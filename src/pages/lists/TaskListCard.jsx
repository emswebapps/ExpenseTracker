import { useState } from 'react';
import {
  Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore, MessageSquare,
  Calendar, CalendarClock,
} from 'lucide-react';
import { getDueDateMs, localTodayISO } from '../../utils/notifications';
import { listTypeMeta, ListDueBadge, fmtDate, MENU_BTN, useTicker } from './listMeta';
import { pasteAsItems } from './pasteImport';
import TaskRow from './TaskRow';

// ── TaskListCard ──────────────────────────────────────────────────────────────
// Renders both to-do and work lists. Every task is due at a real date and time;
// the clock button on a row sets that moment without opening the full editor.
export function TaskListCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddTodoItem, onAddTodoItems, onDeleteItem, onUpdateItem, onEditItem, onExport,
  onOpenAttachment,
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');

  const { Icon: ListIcon } = listTypeMeta(list.type);
  const today = localTodayISO();

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

  const makeItem = (name) => ({
    listId: list.id, name, status: 'pending', notes: null, address: null,
    dueDate: null, dueTime: null, notifyEnabled: false, remindOffsetMinutes: 0,
  });

  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    onAddTodoItem(makeItem(trimmed));
    setQuickAdd('');
  };

  const handlePaste = (e) => pasteAsItems(e, {
    current: quickAdd, setCurrent: setQuickAdd, makeItem, addItems: onAddTodoItems,
  });

  const cycleStatus = (item) => {
    if (item.status === 'done' || item.status === 'blocked') {
      onUpdateItem(item.id, { status: 'pending' });
    } else {
      onUpdateItem(item.id, { status: 'done' });
    }
  };

  const markBlocked = (item) => {
    onUpdateItem(item.id, { status: item.status === 'blocked' ? 'pending' : 'blocked' });
  };

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
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} style={{ flexShrink: 0, padding: '0.375rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {listItems.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>No tasks yet — add one below.</div>
          ) : (
            listItems.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                onEdit={onEditItem}
                onUpdate={onUpdateItem}
                onDelete={onDeleteItem}
                onToggleStatus={cycleStatus}
                onSetBlocked={markBlocked}
                onOpenAttachment={onOpenAttachment}
              />
            ))
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
