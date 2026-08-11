import { useState, useMemo } from 'react';
import { Plus, X, Archive, ClipboardList, Clipboard } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ImageLightbox from '../components/ImageLightbox';
import { deleteFile } from '../utils/storageUtils';
import { isTaskList, isWishlist } from '../utils/helpers';
import { LIST_TYPES } from './lists/listMeta';
import { ExportModal } from './lists/shareText';
import { PasteImportModal } from './lists/pasteImport';
import { GroceryListCard } from './lists/GroceryListCard';
import { WishlistCard } from './lists/WishlistCard';
import { TaskListCard } from './lists/TaskListCard';
import { ListForm } from './lists/forms/ListForm';
import { GroceryItemForm } from './lists/forms/GroceryItemForm';
import { WishlistItemForm } from './lists/forms/WishlistItemForm';
import { TaskItemForm } from './lists/forms/TaskItemForm';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ShoppingLists() {
  const {
    shoppingLists, addShoppingList, updateShoppingList, deleteShoppingList,
    shoppingItems, addShoppingItem, addShoppingItems, updateShoppingItem, deleteShoppingItem, toggleShoppingItem, importList,
    notifPrefs,
  } = useApp();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showNewList, setShowNewList] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [editList, setEditList] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editItemListType, setEditItemListType] = useState('grocery');
  const [addItemToList, setAddItemToList] = useState(null);
  const [exportList, setExportList] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewer, setViewer] = useState(null); // { itemId, attId }

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

  const handleEditItem = (item) => {
    const list = shoppingLists.find((l) => l.id === item.listId);
    setEditItemListType(list?.type || 'grocery');
    setEditItem(item);
  };

  const handleAddItemToList = (list) => {
    setAddItemToList(list);
  };

  // Uploaded photos outlive the row that pointed at them unless they're cleaned
  // up here — the item is gone from state either way, so failures are ignored.
  const removeAttachmentFiles = (items) => {
    items.flatMap((i) => i.attachments || []).forEach((att) => {
      deleteFile(att.url).catch(() => {});
    });
  };

  const handleDeleteItem = (id) => {
    const item = shoppingItems.find((i) => i.id === id);
    deleteShoppingItem(id);
    if (item) removeAttachmentFiles([item]);
  };

  const handleDeleteList = (id) => {
    const items = shoppingItems.filter((i) => i.listId === id);
    deleteShoppingList(id);
    removeAttachmentFiles(items);
  };

  const cardProps = (list) => ({
    list,
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
  });

  const wishlistCardProps = (list) => ({
    ...cardProps(list),
    onAddItem: addShoppingItem,
    onAddItems: addShoppingItems,
    onExport: setExportList,
    onToggleItem: toggleShoppingItem,
  });

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

        {/* Type filter tabs */}
        {presentTypes.length > 1 && (
          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {[['all', 'All'], ...presentTypes.map((t) => [t.key, t.short])].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                style={{
                  padding: '0.375rem 0.75rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: '600',
                  border: typeFilter === key ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                  backgroundColor: typeFilter === key ? 'rgba(99,102,241,0.1)' : 'transparent',
                  color: typeFilter === key ? 'var(--accent-text)' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {shoppingLists.length > 1 && (
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
        {shoppingLists.length === 0 ? (
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
      {editItem && isTaskList(editItemListType) && (() => {
        // Photos save as they upload, so the form reads the live task rather
        // than the snapshot taken when the modal opened.
        const live = shoppingItems.find((i) => i.id === editItem.id) || editItem;
        return (
          <Modal title="Edit Task" onClose={() => setEditItem(null)}>
            <TaskItemForm
              initial={live}
              defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0}
              storagePath={user?.uid ? `users/${user.uid}/todos/${live.id}` : null}
              attachments={live.attachments || []}
              onAttachmentsChange={(atts) => updateShoppingItem(live.id, { attachments: atts })}
              onOpenAttachment={(att) => setViewer({ itemId: live.id, attId: att.id })}
              onSave={(data) => { updateShoppingItem(live.id, data); setEditItem(null); }}
              onCancel={() => setEditItem(null)}
            />
          </Modal>
        );
      })()}
      {exportList && (
        <Modal title="Share List" onClose={() => setExportList(null)}>
          <ExportModal list={exportList} items={exportItems} onClose={() => setExportList(null)} />
        </Modal>
      )}
      {viewer && (() => {
        const item = shoppingItems.find((i) => i.id === viewer.itemId);
        const atts = item?.attachments || [];
        if (atts.length === 0) return null;
        return (
          <ImageLightbox
            attachments={atts}
            startId={viewer.attId}
            title={item.name}
            onClose={() => setViewer(null)}
          />
        );
      })()}
    </div>
  );
}
