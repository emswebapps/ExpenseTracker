import { useState } from 'react';
import {
  Plus, MoreVertical, Pencil, Trash2, Archive, ArchiveRestore, MessageSquare,
  CheckCircle2, Circle, Gift, Link2, ExternalLink, User,
} from 'lucide-react';
import { safeExternalUrl, linkHost, formatCurrency } from '../../utils/helpers';
import { ListDueBadge, MENU_BTN } from './listMeta';
import { pasteAsItems } from './pasteImport';

// ── WishlistCard ──────────────────────────────────────────────────────────────
export function WishlistCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddItem, onAddItems, onDeleteItem, onToggleItem, onEditItem, onExport,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');

  const bought = listItems.filter((i) => i.checked);
  const wanted = listItems.filter((i) => !i.checked);
  const remaining = wanted.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const progress = listItems.length > 0 ? bought.length / listItems.length : 0;

  // A pasted link on its own becomes an item named after its site.
  const makeItem = (raw) => {
    const asLink = safeExternalUrl(raw);
    const looksLikeUrl = asLink && /^(https?:\/\/|www\.)/i.test(raw);
    return {
      listId: list.id,
      name: looksLikeUrl ? (linkHost(raw) || raw) : raw,
      url: looksLikeUrl ? asLink : null,
      price: null, notes: null, qty: null, checked: false,
    };
  };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
              <Gift size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
              <ListDueBadge list={list} />
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--accent-text)', backgroundColor: 'rgba(99,102,241,0.14)', padding: '0.125rem 0.4375rem', borderRadius: '0.375rem' }}>
                <User size={10} /> {list.forPerson || 'Me'}
              </span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
              <span>{listItems.length === 0 ? 'Nothing saved yet' : `${bought.length}/${listItems.length} bought`}</span>
              {remaining > 0 && <span>{formatCurrency(remaining)} to go</span>}
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
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>
              Nothing here yet — add something below, or paste a link.
            </div>
          ) : (
            listItems.map((item) => {
              const href = safeExternalUrl(item.url);
              const host = linkHost(item.url);
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.6875rem 1rem', borderBottom: '1px solid var(--border)', opacity: item.checked ? 0.5 : 1 }}>
                  <button onClick={() => onToggleItem(item.id)} title={item.checked ? 'Not bought after all' : 'Mark as bought'}
                    style={{ flexShrink: 0, marginTop: '0.125rem', color: item.checked ? 'var(--positive)' : 'var(--border)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem', display: 'flex' }}>
                    {item.checked ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditItem(item)}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9375rem', color: 'var(--text)', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.name}</span>
                      {item.price != null && <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>{formatCurrency(item.price)}</span>}
                    </div>
                    {item.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', margin: '0.125rem 0 0' }}>{item.notes}</p>}
                    {host && <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', margin: '0.125rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Link2 size={10} /> {host}</p>}
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" title="Open link"
                      onClick={(e) => e.stopPropagation()}
                      style={{ flexShrink: 0, color: 'var(--accent-text)', padding: '0.375rem', display: 'flex', borderRadius: '0.5rem' }}>
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button onClick={() => onDeleteItem(item.id)} style={{ flexShrink: 0, color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
          <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
            <input className="app-input" style={{ flex: 1 }} placeholder="Add an item, a link, or paste a list" value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()} onPaste={handlePaste} />
            <button onClick={handleQuickAdd} disabled={!quickAdd.trim()}
              style={{ flexShrink: 0, padding: '0 1rem', borderRadius: '0.75rem', height: '2.75rem', backgroundColor: quickAdd.trim() ? 'var(--accent)' : 'var(--surface2)', color: quickAdd.trim() ? '#fff' : 'var(--subtle)', border: 'none', cursor: quickAdd.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: '600', fontSize: '0.875rem' }}>
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
