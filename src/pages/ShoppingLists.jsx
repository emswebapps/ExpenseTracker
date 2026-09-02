import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, Archive, ClipboardList, Clipboard } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ImageLightbox from '../components/ImageLightbox';
import { deleteFile } from '../utils/storageUtils';
import { isTaskList, isWishlist, generateId } from '../utils/helpers';
import { LIST_TYPES } from './lists/listMeta';
import TodayView from './lists/TodayView';
import { collectAgenda } from './lists/agenda';
import { buildNextOccurrenceGroup } from './lists/recurrence.js';
import { descendantIds, isHeading } from './lists/subtasks.js';
import {
  weekStartISO, weekLabel, weekSectionId, weekDates, addDaysISO,
  dayHeadingName, dayHeadingId, weeklyConfig,
} from './lists/weeks.js';
import { ExportModal } from './lists/shareText';
import { ShareListModal } from './lists/ShareListModal';
import { PasteImportModal } from './lists/pasteImport';
import { GroceryListCard } from './lists/GroceryListCard';
import { WishlistCard } from './lists/WishlistCard';
import { TaskListCard } from './lists/TaskListCard';
import { ListForm } from './lists/forms/ListForm';
import { GroceryItemForm } from './lists/forms/GroceryItemForm';
import { WishlistItemForm } from './lists/forms/WishlistItemForm';
import { TaskEditorModal } from './lists/forms/TaskEditorModal';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ShoppingLists() {
  const {
    shoppingLists, addShoppingList, updateShoppingList, deleteShoppingList,
    shoppingItems, addShoppingItem, addShoppingItems, updateShoppingItem, updateShoppingItems,
    deleteShoppingItem, deleteShoppingItems, toggleShoppingItem, importList,
    completeAndRepeatShoppingItem,
    shareList, revokeListShare, deleteListShareLink,
    notifPrefs, cloudLoaded,
  } = useApp();
  const { user } = useAuth();
  // A search hit links to /lists?list=<id>; that list opens on arrival.
  const [searchParams] = useSearchParams();
  const focusListId = searchParams.get('list');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  // Whether the filter row has been touched. Guards the one-time landing
  // decision below so it can never yank the view out from under a tap.
  const chosenRef = useRef(false);
  const landedRef = useRef(false);
  const [showNewList, setShowNewList] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [editList, setEditList] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editItemListType, setEditItemListType] = useState('grocery');
  // A task being composed in the full form. It carries an id from the start so
  // photos can upload before the task is saved, and the attachments it has
  // gathered so far so they can be cleaned up if the form is abandoned.
  const [addTask, setAddTask] = useState(null); // { list, draftId, attachments }
  const [exportList, setExportList] = useState(null);
  const [shareListFor, setShareListFor] = useState(null); // list id being shared
  const [showArchived, setShowArchived] = useState(false);
  const [viewer, setViewer] = useState(null); // { itemId | draft, attId }

  const active = useMemo(() => shoppingLists.filter((l) => !l.archived), [shoppingLists]);
  const archived = useMemo(() => shoppingLists.filter((l) => l.archived), [shoppingLists]);

  const filterLists = (lists) => {
    let result = lists;
    if (typeFilter !== 'all') result = result.filter((l) => (l.type || 'grocery') === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        l.store?.toLowerCase().includes(q) ||
        shoppingItems.some((i) => i.listId === l.id && (
          i.name.toLowerCase().includes(q) || i.address?.toLowerCase().includes(q)
        ))
      );
    }
    return result;
  };

  const filteredActive = useMemo(() => filterLists(active), [active, typeFilter, search, shoppingItems]);
  const filteredArchived = useMemo(() => filterLists(archived), [archived, typeFilter, search]);

  // Only worth showing the filter row once more than one kind of list exists.
  const presentTypes = useMemo(
    () => LIST_TYPES.filter(({ key }) => active.some((l) => (l.type || 'grocery') === key)),
    [active]
  );

  // The Today tab only earns its place when something is actually due; its
  // badge turns red as soon as anything is late.
  const agenda = useMemo(() => collectAgenda(shoppingLists, shoppingItems), [shoppingLists, shoppingItems]);
  const overdueCount = agenda.overdue.length;
  const agendaCount = overdueCount + agenda.dueToday.length;

  // Land on Today when the day actually has something in it, otherwise on the
  // lists themselves. Decided exactly once: lists hydrate from localStorage
  // synchronously, so a returning device is right on the first render, but a
  // cold login has to wait for the Firestore pull — `cloudLoaded` is the flag
  // the rest of the app already waits on for this. Re-deciding later would
  // move the ground under someone already reading, hence the latch.
  //
  // A `?list=` deep link from Search or the Dashboard always wins: it asked
  // for a specific list, and Today would silently swallow that.
  useEffect(() => {
    if (landedRef.current) return;
    if (focusListId) { landedRef.current = true; return; }
    if (user?.uid && !cloudLoaded) return;
    landedRef.current = true;
    if (!chosenRef.current && agendaCount > 0) setTypeFilter('today');
  }, [agendaCount, focusListId, user?.uid, cloudLoaded]);

  const handleEditItem = (item) => {
    const list = shoppingLists.find((l) => l.id === item.listId);
    setEditItemListType(list?.type || 'grocery');
    setEditItem(item);
  };

  const handleAddTaskDetailed = (list, sectionId = null) => {
    setAddTask({ list, sectionId, draftId: generateId(), attachments: [] });
  };

  // Abandoning the form has to take any already-uploaded photos with it,
  // otherwise they'd sit in storage with nothing pointing at them.
  const cancelAddTask = () => {
    if (addTask?.attachments?.length) removeAttachmentFiles([{ attachments: addTask.attachments }]);
    setAddTask(null);
  };

  // Uploaded photos outlive the row that pointed at them unless they're cleaned
  // up here — the item is gone from state either way, so failures are ignored.
  const removeAttachmentFiles = (items) => {
    items.flatMap((i) => i.attachments || []).forEach((att) => {
      deleteFile(att.url).catch(() => {});
    });
  };

  // Deleting a parent takes its subtasks with it. Leaving them behind would
  // strand them: `topLevelItems` promotes orphans, so they'd reappear at the
  // top of the list with no hint of what they belonged to.
  const handleDeleteItem = (id) => {
    const doomed = descendantIds(shoppingItems, id);
    doomed.add(id);
    const gone = shoppingItems.filter((i) => doomed.has(i.id));
    deleteShoppingItems([...doomed]);
    removeAttachmentFiles(gone);
  };

  const handleDeleteList = (id) => {
    const items = shoppingItems.filter((i) => i.listId === id);
    deleteShoppingList(id);
    removeAttachmentFiles(items);
  };

  // Completing a task is the one place that has to do more than patch a field:
  // it stamps when it happened, and for a repeating task it puts the next
  // occurrence on the list.
  const handleToggleStatus = (item) => {
    if (item.status === 'done' || item.status === 'blocked') {
      // Re-opening a parent deliberately leaves its subtasks alone: the ones
      // that were genuinely finished before it was ticked off shouldn't be
      // resurrected just because the parent came back.
      updateShoppingItem(item.id, { status: 'pending', completedAt: null });
      return;
    }

    const stamp = new Date().toISOString();
    const donePatch = { status: 'done', completedAt: stamp };

    // Closing a parent closes everything under it — ticking off "MONDAY" with
    // three open errands beneath it and having them survive is never what was
    // meant. Blocked subtasks are left as they are; they're a flag that
    // something couldn't be done, not work in progress.
    const below = descendantIds(shoppingItems, item.id);
    const subtree = shoppingItems.filter((i) => below.has(i.id));
    const closing = subtree
      .filter((i) => i.status !== 'done' && i.status !== 'blocked')
      .map((i) => i.id);

    // `spawnedNextId` is the guard: un-completing and re-completing a repeating
    // task must not keep minting occurrences. The next occurrence takes copies
    // of the subtasks with it, so a repeating day heading arrives populated.
    const next = item.spawnedNextId
      ? null
      : buildNextOccurrenceGroup(item, subtree.filter((i) => i.parentId === item.id), generateId);

    if (next) {
      completeAndRepeatShoppingItem(item.id, { ...donePatch, spawnedNextId: next[0].id }, next, closing);
    } else if (closing.length > 0) {
      updateShoppingItems([item.id, ...closing], donePatch);
    } else {
      updateShoppingItem(item.id, donePatch);
    }
  };

  // A task added under a heading inherits the heading's date — the whole point
  // of "MONDAY 9/7" is that what sits under it belongs to that day. The time is
  // left blank so it lands as end-of-day until someone sets one, and the
  // reminder stays off: an inherited date is not a request to be buzzed.
  const handleAddSubtask = (parent, name) => {
    addShoppingItem({
      listId: parent.listId,
      parentId: parent.id,
      sectionId: parent.sectionId ?? null,
      name,
      status: 'pending',
      notes: null,
      address: null,
      dueDate: isHeading(parent) ? (parent.dueDate ?? null) : null,
      dueTime: null,
      notifyEnabled: false,
      remindOffsetMinutes: 0,
      flagged: false,
      completedAt: null,
    });
  };

  const handleSetBlocked = (item) => {
    const unblocking = item.status === 'blocked';
    updateShoppingItem(item.id, { status: unblocking ? 'pending' : 'blocked', completedAt: null });
  };

  // ── Sections ──────────────────────────────────────────────────────────────
  const handleRenameSection = (list, sectionId, name) => {
    updateShoppingList(list.id, {
      sections: (list.sections || []).map((s) => (s.id === sectionId ? { ...s, name } : s)),
    });
  };

  // Deleting a column keeps its tasks: they lose their `sectionId` and turn up
  // under Unfiled. Throwing away a week's work because the header was tidied
  // away is not a trade anyone would choose.
  const handleDeleteSection = (list, sectionId) => {
    updateShoppingList(list.id, {
      sections: (list.sections || []).filter((s) => s.id !== sectionId),
    });
    const stranded = shoppingItems.filter((i) => i.listId === list.id && i.sectionId === sectionId);
    if (stranded.length > 0) updateShoppingItems(stranded.map((i) => i.id), { sectionId: null });
  };

  const handleSetViewMode = (list, mode) => updateShoppingList(list.id, { viewMode: mode });

  /**
   * Build the week after the last one the list already has — the manual
   * counterpart to the automatic generation, for when you want to plan further
   * out than the two weeks that stand by default.
   */
  const handleAddWeek = (list) => {
    const cfg = weeklyConfig(list);
    const starts = (list.sections || [])
      .map((s) => s.startDate)
      .filter(Boolean)
      .sort();
    const lastStart = starts[starts.length - 1] || weekStartISO(new Date(), cfg.startDay);
    const startISO = addDaysISO(lastStart, 7);
    const endISO = addDaysISO(startISO, 6);
    const id = weekSectionId(startISO);
    if ((list.sections || []).some((s) => s.id === id)) return;

    updateShoppingList(list.id, {
      sections: [
        ...(list.sections || []),
        { id, name: weekLabel(startISO, endISO), startDate: startISO, endDate: endISO, order: Date.parse(`${startISO}T00:00:00Z`) },
      ],
      // Keep the automatic generator from treating this week as still owed.
      weekly: { ...cfg, generatedThrough: cfg.generatedThrough && cfg.generatedThrough > startISO ? cfg.generatedThrough : startISO },
    });

    const existing = new Set(shoppingItems.filter((i) => i.listId === list.id).map((i) => i.id));
    const days = weekDates(startISO, cfg.days, cfg.startDay)
      .filter(({ dateISO }) => !existing.has(dayHeadingId(list.id, dateISO)))
      .map(({ dateISO, dayOfWeek }) => ({
        id: dayHeadingId(list.id, dateISO),
        listId: list.id, sectionId: id, parentId: null, header: true,
        name: dayHeadingName(dayOfWeek, cfg.emoji),
        notes: null, address: null, status: 'pending', completedAt: null, flagged: false,
        dueDate: dateISO, dueTime: null, notifyEnabled: false, remindOffsetMinutes: 0,
        repeat: null, attachments: [],
      }));
    if (days.length > 0) addShoppingItems(days, { keepIds: true });
  };

  const cardProps = (list) => ({
    list,
    defaultExpanded: list.id === focusListId,
    listItems: shoppingItems.filter((i) => i.listId === list.id),
    onEditList: setEditList,
    onDeleteList: handleDeleteList,
    onArchiveList: (id) => updateShoppingList(id, { archived: !shoppingLists.find((l) => l.id === id)?.archived }),
    onEditItem: handleEditItem,
    onDeleteItem: handleDeleteItem,
  });

  const groceryCardProps = (list) => ({
    ...cardProps(list),
    onAddItem: addShoppingItem,
    onAddItems: addShoppingItems,
    onToggleItem: toggleShoppingItem,
    onExport: setExportList,
  });

  const taskCardProps = (list) => ({
    ...cardProps(list),
    onAddTodoItem: addShoppingItem,
    onAddTodoItems: addShoppingItems,
    onExport: setExportList,
    onUpdateItem: updateShoppingItem,
    onOpenAttachment: (item, att) => setViewer({ itemId: item.id, attId: att.id }),
    onToggleStatus: handleToggleStatus,
    onSetBlocked: handleSetBlocked,
    onAddTaskDetailed: handleAddTaskDetailed,
    onAddSubtask: handleAddSubtask,
    onRenameSection: handleRenameSection,
    onDeleteSection: handleDeleteSection,
    onSetViewMode: handleSetViewMode,
    onAddWeek: handleAddWeek,
    onShareList: (l) => setShareListFor(l.id),
  });

  const wishlistCardProps = (list) => ({
    ...cardProps(list),
    onAddItem: addShoppingItem,
    onAddItems: addShoppingItems,
    onExport: setExportList,
    onToggleItem: toggleShoppingItem,
  });

  // Props every task row needs, whether it sits in its card or in Today.
  const taskRowProps = {
    onEdit: handleEditItem,
    onUpdate: updateShoppingItem,
    onDelete: handleDeleteItem,
    onToggleStatus: handleToggleStatus,
    onSetBlocked: handleSetBlocked,
    onOpenAttachment: (item, att) => setViewer({ itemId: item.id, attId: att.id }),
  };

  const renderCard = (list) => {
    if (isTaskList(list.type)) return <TaskListCard key={list.id} {...taskCardProps(list)} />;
    if (isWishlist(list.type)) return <WishlistCard key={list.id} {...wishlistCardProps(list)} />;
    return <GroceryListCard key={list.id} {...groceryCardProps(list)} />;
  };

  const exportItems = exportList ? shoppingItems.filter((i) => i.listId === exportList.id) : [];

  return (
    <div className="app-page">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.625rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>Lists</h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowPaste(true)}
              title="Paste list from text"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0.75rem', backgroundColor: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.75rem', cursor: 'pointer' }}
            >
              <Clipboard size={16} />
            </button>
            <button
              onClick={() => setShowNewList(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 0.875rem', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' }}
            >
              <Plus size={16} /> New List
            </button>
          </div>
        </div>

        {/* Today + type filter tabs */}
        {(presentTypes.length > 1 || agendaCount > 0 || typeFilter === 'today') && (
          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {[
              ...((agendaCount > 0 || typeFilter === 'today') ? [['today', 'Today', agendaCount]] : []),
              ['all', 'All'],
              ...(presentTypes.length > 1 ? presentTypes.map((t) => [t.key, t.short]) : []),
            ].map(([key, label, badge]) => (
              <button
                key={key}
                onClick={() => { chosenRef.current = true; setTypeFilter(key); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3125rem', minHeight: '2.5rem',
                  padding: '0.375rem 0.875rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: '600',
                  border: typeFilter === key ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                  backgroundColor: typeFilter === key ? 'rgba(99,102,241,0.1)' : 'transparent',
                  color: typeFilter === key ? 'var(--accent-text)' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
                {badge > 0 && (
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 800, lineHeight: 1,
                    color: overdueCount > 0 ? '#fff' : 'var(--accent-text)',
                    backgroundColor: overdueCount > 0 ? 'var(--danger)' : 'rgba(99,102,241,0.2)',
                    borderRadius: '9999px', padding: '0.1875rem 0.375rem', minWidth: '1.125rem', textAlign: 'center',
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {typeFilter !== 'today' && shoppingLists.length > 1 && (
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input className="app-input" placeholder="Search lists and tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '0 1rem' }}>
        {typeFilter === 'today' ? (
          <TodayView lists={shoppingLists} items={shoppingItems} rowProps={taskRowProps} />
        ) : shoppingLists.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <ClipboardList size={48} style={{ margin: '0 auto 1rem', opacity: 0.2, color: 'var(--muted)', display: 'block' }} />
            <p style={{ fontWeight: '700', color: 'var(--text)', fontSize: '1.125rem', marginBottom: '0.5rem' }}>No lists yet</p>
            <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Create a grocery, to-do, work, or wish list to get started.</p>
            <button onClick={() => setShowNewList(true)} className="app-btn-primary" style={{ maxWidth: '14rem', margin: '0 auto' }}>
              <Plus size={18} /> New List
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredActive.length === 0 && (search || typeFilter !== 'all') ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.9375rem' }}>No lists match your filter.</p>
            ) : (
              filteredActive.map(renderCard)
            )}

            {archived.length > 0 && (
              <div style={{ marginTop: '0.25rem' }}>
                <button onClick={() => setShowArchived((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}>
                  <Archive size={13} />
                  {archived.length} archived {archived.length === 1 ? 'list' : 'lists'}
                  <span style={{ fontSize: '0.7rem' }}>{showArchived ? '▲' : '▼'}</span>
                </button>
                {showArchived && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem', opacity: 0.7 }}>
                    {filteredArchived.map(renderCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showPaste && (
        <Modal title="Paste List" onClose={() => setShowPaste(false)}>
          <PasteImportModal
            onImport={({ name, type, dueDate, items }) => {
              importList({ name, type, dueDate: dueDate || null }, items);
              setShowPaste(false);
            }}
            onCancel={() => setShowPaste(false)}
          />
        </Modal>
      )}
      {showNewList && (
        <Modal title="New List" onClose={() => setShowNewList(false)}>
          <ListForm defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0} onSave={(data) => { addShoppingList(data); setShowNewList(false); }} onCancel={() => setShowNewList(false)} />
        </Modal>
      )}
      {editList && (
        <Modal title="Edit List" onClose={() => setEditList(null)}>
          <ListForm initial={editList} defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0} onSave={(data) => { updateShoppingList(editList.id, data); setEditList(null); }} onCancel={() => setEditList(null)} />
        </Modal>
      )}
      {editItem && !isTaskList(editItemListType) && !isWishlist(editItemListType) && (
        <Modal title="Edit Item" onClose={() => setEditItem(null)}>
          <GroceryItemForm initial={editItem} onSave={(data) => { updateShoppingItem(editItem.id, data); setEditItem(null); }} onCancel={() => setEditItem(null)} />
        </Modal>
      )}
      {editItem && isWishlist(editItemListType) && (
        <Modal title="Edit Item" onClose={() => setEditItem(null)}>
          <WishlistItemForm initial={editItem} onSave={(data) => { updateShoppingItem(editItem.id, data); setEditItem(null); }} onCancel={() => setEditItem(null)} />
        </Modal>
      )}
      {addTask && (
        <TaskEditorModal
          title={`New Task · ${addTask.list.name}`}
          saveLabel="Add Task"
          onClose={cancelAddTask}
          defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0}
          storagePath={user?.uid ? `users/${user.uid}/todos/${addTask.draftId}` : null}
          attachments={addTask.attachments}
          onAttachmentsChange={(atts) => setAddTask((d) => ({ ...d, attachments: atts }))}
          onOpenAttachment={(att) => setViewer({ draft: true, attId: att.id })}
          onSave={(data) => {
            addShoppingItem({
              ...data,
              id: addTask.draftId,
              listId: addTask.list.id,
              sectionId: addTask.sectionId ?? null,
              parentId: null,
              attachments: addTask.attachments,
              flagged: false,
              completedAt: null,
            });
            setAddTask(null);
          }}
        />
      )}
      {editItem && isTaskList(editItemListType) && (() => {
        // Photos save as they upload, so the form reads the live task rather
        // than the snapshot taken when the modal opened.
        const live = shoppingItems.find((i) => i.id === editItem.id) || editItem;
        return (
          <TaskEditorModal
            title="Edit Task"
            onClose={() => setEditItem(null)}
            initial={live}
            defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0}
            storagePath={user?.uid ? `users/${user.uid}/todos/${live.id}` : null}
            attachments={live.attachments || []}
            onAttachmentsChange={(atts) => updateShoppingItem(live.id, { attachments: atts })}
            onOpenAttachment={(att) => setViewer({ itemId: live.id, attId: att.id })}
            onSave={(data) => { updateShoppingItem(live.id, data); setEditItem(null); }}
          />
        );
      })()}
      {shareListFor && (() => {
        // Read live: creating the link patches the list, and the modal has to
        // show the link it just made rather than the snapshot it opened with.
        const live = shoppingLists.find((l) => l.id === shareListFor);
        if (!live) return null;
        return (
          <ShareListModal
            list={live}
            onClose={() => setShareListFor(null)}
            onShare={shareList}
            onRevoke={revokeListShare}
            onDelete={deleteListShareLink}
          />
        );
      })()}
      {exportList && (
        <Modal title="Share List" onClose={() => setExportList(null)}>
          <ExportModal list={exportList} items={exportItems} onClose={() => setExportList(null)} />
        </Modal>
      )}
      {viewer && (() => {
        // Photos on a task being composed have no saved item to read from yet,
        // so those come off the draft instead.
        const item = viewer.itemId ? shoppingItems.find((i) => i.id === viewer.itemId) : null;
        const atts = (viewer.draft ? addTask?.attachments : item?.attachments) || [];
        if (atts.length === 0) return null;
        return (
          <ImageLightbox
            attachments={atts}
            startId={viewer.attId}
            title={item ? item.name : 'New task'}
            onClose={() => setViewer(null)}
          />
        );
      })()}
    </div>
  );
}
