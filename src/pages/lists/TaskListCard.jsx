import { useState, useMemo } from 'react';
import {
  Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore, MessageSquare,
  Calendar, CalendarClock,
} from 'lucide-react';
import { getDueDateMs, localTodayISO, notificationPermission } from '../../utils/notifications';
import { listTypeMeta, ListDueBadge, fmtDate, MENU_BTN, useTicker } from './listMeta';
import { groupTasks } from './taskGroups';
import { parseTaskInput } from '../../utils/parseTaskInput.js';
import { pasteAsItems } from './pasteImport';
import TaskRow from './TaskRow';

// Heading colour per bucket — the same red/amber/violet ladder the due badges
// already use, so a heading and the badges under it never disagree.
const GROUP_COLOR = {
  overdue: 'var(--danger)',
  today: 'var(--accent-text)',
  tomorrow: '#f59e0b',
};

// ── TaskListCard ──────────────────────────────────────────────────────────────
// Renders both to-do and work lists. Every task is due at a real date and time;
// the clock button on a row sets that moment without opening the full editor.
export function TaskListCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddTodoItem, onAddTodoItems, onDeleteItem, onUpdateItem, onEditItem, onExport,
  onOpenAttachment, onToggleStatus, onSetBlocked, onAddTaskDetailed,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  // Finished work is context, not the job in hand — it opens collapsed.
  const [showDone, setShowDone] = useState(false);

  const { Icon: ListIcon } = listTypeMeta(list.type);
  const today = localTodayISO();
  const groups = useMemo(() => groupTasks(listItems), [listItems]);

  const isPending = (i) => i.status !== 'done' && i.status !== 'blocked';
  const done = listItems.filter((i) => i.status === 'done');
  const blocked = listItems.filter((i) => i.status === 'blocked');
  const overdue = listItems.filter((i) =>
    isPending(i) && i.dueDate && getDueDateMs(i.dueDate, i.dueTime) < Date.now()
  );
  const dueToday = listItems.filter((i) => isPending(i) && i.dueDate === today);

  // Badges inside the last hour count down in minutes, so keep the clock live
  // while the card is open and something still has a deadline.
  useTicker(expanded && listItems.some((i) => isPending(i) && i.dueDate));

  const makeItem = (name, due = {}) => ({
    listId: list.id, name, status: 'pending', notes: null, address: null,
    dueDate: due.dueDate ?? null, dueTime: due.dueTime ?? null,
    notifyEnabled: due.notifyEnabled ?? false, remindOffsetMinutes: 0,
    flagged: false, completedAt: null,
  });

  // Typing "trash out tomorrow 7pm" dates the task on the way in. A pasted
  // list doesn't go through here — those lines are names, not sentences.
  //
  // A date typed this way switches the reminder on exactly when the clock
  // button would, but only if permission was already granted: interrupting
  // someone mid-quick-add with a permission prompt would be obnoxious.
  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    const { name, dueDate, dueTime } = parseTaskInput(trimmed);
    const notify = !!dueDate && notificationPermission() === 'granted';
    onAddTodoItem(makeItem(name, { dueDate, dueTime, notifyEnabled: notify }));
    setQuickAdd('');
  };

  const handlePaste = (e) => pasteAsItems(e, {
    current: quickAdd, setCurrent: setQuickAdd, makeItem, addItems: onAddTodoItems,
  });

  const progress = listItems.length > 0 ? done.length / listItems.length : 0;

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: `1px solid ${overdue.length > 0 ? 'rgba(244,63,94,0.4)' : 'var(--border)'}`, borderRadius: '1rem', overflow: menuOpen ? 'visible' : 'hidden' }}>
      <div style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <ListIcon size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
              <ListDueBadge list={list} />
              {list.dueDate && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <Calendar size={10} /> {fmtDate(list.dueDate)}
                </span>
              )}
              {overdue.length > 0 && (
                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'var(--danger)', backgroundColor: 'rgba(244,63,94,0.12)', padding: '0.125rem 0.375rem', borderRadius: '0.375rem' }}>
                  {overdue.length} overdue
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
              {listItems.length === 0 ? <span>No tasks</span> : (
                <>
                  <span>{done.length}/{listItems.length} done</span>
                  {blocked.length > 0 && <span style={{ color: '#f59e0b' }}>{blocked.length} blocked</span>}
                  {dueToday.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--accent-text)' }}>
                      <CalendarClock size={11} /> {dueToday.length} due today
                    </span>
                  )}
                </>
              )}
            </div>
            {listItems.length > 0 && (
              <div style={{ marginTop: '0.5rem', height: '3px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: progress === 1 ? 'var(--positive)' : 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label={`Options for ${list.name}`}
            style={{
              flexShrink: 0, width: '2.75rem', height: '2.75rem', margin: '-0.5rem -0.5rem 0 0',
              color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem',
            }}
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {listItems.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>No tasks yet — add one below.</div>
          ) : (
            groups.map((group) => {
              const collapsible = group.key === 'done';
              const open = !collapsible || showDone;
              return (
                <div key={group.key}>
                  <button
                    onClick={collapsible ? () => setShowDone((v) => !v) : undefined}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 1rem', background: 'var(--surface2)', border: 'none',
                      borderBottom: '1px solid var(--border)',
                      cursor: collapsible ? 'pointer' : 'default', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: GROUP_COLOR[group.key] || 'var(--muted)',
                    }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--subtle)' }}>{group.items.length}</span>
                    {collapsible && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--subtle)' }}>{open ? '▲' : '▼'}</span>
                    )}
                  </button>
                  {open && group.items.map((item) => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      onEdit={onEditItem}
                      onUpdate={onUpdateItem}
                      onDelete={onDeleteItem}
                      onToggleStatus={onToggleStatus}
                      onSetBlocked={onSetBlocked}
                      onOpenAttachment={onOpenAttachment}
                    />
                  ))}
                </div>
              );
            })
          )}
          <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
            <input
              className="app-input" style={{ flex: 1 }} placeholder="Add task — or paste a list"
              value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              onPaste={handlePaste}
            />
            <button
              onClick={handleQuickAdd} disabled={!quickAdd.trim()}
              style={{ flexShrink: 0, padding: '0 1rem', borderRadius: '0.75rem', height: '2.75rem', backgroundColor: quickAdd.trim() ? 'var(--accent)' : 'var(--surface2)', color: quickAdd.trim() ? '#fff' : 'var(--subtle)', border: 'none', cursor: quickAdd.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '600', fontSize: '0.875rem' }}
            >
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
      )}

      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
          <div style={{ position: 'absolute', right: '0.75rem', top: '3rem', zIndex: 50, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', minWidth: '11rem', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <button onClick={() => { onExport(list); setMenuOpen(false); }} style={MENU_BTN}><MessageSquare size={14} /> Share as text</button>
            <button onClick={() => { onAddTaskDetailed(list); setMenuOpen(false); }} style={MENU_BTN}><Plus size={14} /> Add task with details</button>
            <button onClick={() => { onEditList(list); setMenuOpen(false); }} style={MENU_BTN}><Pencil size={14} /> Edit list</button>
            <button onClick={() => { onArchiveList(list.id); setMenuOpen(false); }} style={MENU_BTN}>
              {list.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {list.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button onClick={() => { onDeleteList(list.id); setMenuOpen(false); }} style={{ ...MENU_BTN, color: 'var(--danger)' }}><Trash2 size={14} /> Delete list</button>
          </div>
        </>
      )}
    </div>
  );
}
