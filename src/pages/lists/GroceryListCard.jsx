import { useState } from 'react';
import {
  ShoppingCart, Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore,
  MessageSquare, Store, CheckCircle2, Circle, Calendar,
} from 'lucide-react';
import { ListDueBadge, fmtDate, MENU_BTN } from './listMeta';
import { pasteAsItems } from './pasteImport';

// ── GroceryListCard ───────────────────────────────────────────────────────────
export function GroceryListCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddItem, onAddItems, onDeleteItem, onToggleItem, onEditItem, onExport,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');

  const checkedCount = listItems.filter((i) => i.checked).length;
  const priced = listItems.filter((i) => i.price != null);
  const total = priced.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const progress = listItems.length > 0 ? checkedCount / listItems.length : 0;

  const makeItem = (name) => ({ listId: list.id, name, qty: null, price: null, checked: false });

  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    onAddItem(makeItem(trimmed));
    setQuickAdd('');
  };

  const handlePaste = (e) => pasteAsItems(e, {
    current: quickAdd, setCurrent: setQuickAdd, makeItem, addItems: onAddItems,
  });

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: menuOpen ? 'visible' : 'hidden' }}>
      <div style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <ShoppingCart size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
              <ListDueBadge list={list} />
            </div>
            {list.store && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                <Store size={11} style={{ color: 'var(--subtle)' }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>{list.store}</span>
              </div>
            )}
            {list.dueDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                <Calendar size={11} style={{ color: 'var(--subtle)' }} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Shop by {fmtDate(list.dueDate)}</span>
              </div>
            )}
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
              <span>{listItems.length === 0 ? 'No items' : `${checkedCount}/${listItems.length} done`}</span>
              {priced.length > 0 && <span>Est. ${total.toFixed(2)}</span>}
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
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>No items yet — add one below.</div>
          ) : (
            listItems.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6875rem 1rem', borderBottom: '1px solid var(--border)', opacity: item.checked ? 0.5 : 1 }}>
                <button onClick={() => onToggleItem(item.id)} style={{ flexShrink: 0, color: item.checked ? 'var(--positive)' : 'var(--border)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem', display: 'flex' }}>
                  {item.checked
                    ? <CheckCircle2 size={20} />
                    : <Circle size={20} />}
                </button>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditItem(item)}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9375rem', color: 'var(--text)', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.name}</span>
                    {item.qty && <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>({item.qty})</span>}
                  </div>
                  {item.price != null && <span style={{ fontSize: '0.8125rem', color: 'var(--accent-text)' }}>${Number(item.price).toFixed(2)}</span>}
                </div>
                <button onClick={() => onDeleteItem(item.id)} style={{ flexShrink: 0, color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
          <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
            <input className="app-input" style={{ flex: 1 }} placeholder="Add item — or paste a list" value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()} onPaste={handlePaste} />
            <button onClick={handleQuickAdd} disabled={!quickAdd.trim()} style={{ flexShrink: 0, padding: '0 1rem', borderRadius: '0.75rem', height: '2.75rem', backgroundColor: quickAdd.trim() ? 'var(--accent)' : 'var(--surface2)', color: quickAdd.trim() ? '#fff' : 'var(--subtle)', border: 'none', cursor: quickAdd.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '600', fontSize: '0.875rem' }}>
              <Plus size={16} /> Add
            </button>
          </div>
          {listItems.length > 0 && (
            <div style={{ padding: '0 1rem 0.875rem' }}>
              <button onClick={() => onExport(list)} style={{ width: '100%', padding: '0.625rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <MessageSquare size={14} /> Share as text message
              </button>
            </div>
          )}
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
