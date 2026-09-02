import { useState, useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { listTypeMeta, fmtDate } from './listMeta';

// ── Pasted text → one item per line ──────────────────────────────────────────
/**
 * Split pasted text into item names, one per line, stripping the bullet and
 * numbering styles a list usually arrives with. Blank lines and rules like
 * "---" drop out.
 */
export function splitPastedLines(text) {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const trimmed = line.trim();
      const bullet = trimmed.match(/^[-–—•*]\s*(.+)$/) || trimmed.match(/^\d+[.)]\s*(.+)$/);
      return (bullet ? bullet[1] : trimmed).trim();
    })
    .filter((line) => line && !/^[#=\-–—_*]{2,}$/.test(line));
}

/**
 * Paste handler for the quick-add boxes. A one-line paste is left alone so
 * normal typing is untouched; a multi-line paste becomes one item per line,
 * which an <input> can't do on its own — it flattens the newlines into a single
 * run-on item.
 *
 * Anything already typed joins the first pasted line rather than being lost.
 */
export function pasteAsItems(e, { current, setCurrent, makeItem, addItems }) {
  const text = e.clipboardData?.getData('text') ?? '';
  if (!/[\r\n]/.test(text)) return;
  const names = splitPastedLines(text);
  if (names.length === 0) return;
  e.preventDefault();
  const prefix = current.trim();
  if (prefix) names[0] = `${prefix} ${names[0]}`;
  addItems(names.map(makeItem));
  setCurrent('');
}

// ── List text parser ─────────────────────────────────────────────────────────
export function parseListText(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  let listName = firstLine;
  let dueDate = null;

  // Match trailing date: "- 06-24-26" or "- 06/24/2026"
  const dateMatch = firstLine.match(/[-–]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*$/);
  if (dateMatch) {
    listName = firstLine.slice(0, firstLine.lastIndexOf(dateMatch[0])).trim();
    const parts = dateMatch[1].split(/[/-]/);
    if (parts.length === 3) {
      let [m, d, y] = parts;
      if (y.length === 2) y = '20' + y;
      dueDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const nameLower = listName.toLowerCase();
  const type =
    (nameLower.includes('wish') || nameLower.includes('gift') ||
      nameLower.includes('want') || nameLower.includes('birthday') ||
      nameLower.includes('christmas')) ? 'wishlist'
    : (nameLower.includes('work') || nameLower.includes('shift') ||
      nameLower.includes('job') || nameLower.includes('meeting')) ? 'work'
    : (nameLower.includes('to do') || nameLower.includes('todo') ||
      nameLower.includes('task') || nameLower.includes('errand')) ? 'todo'
    : 'grocery';

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^[-•*]\s*(.+)$/) || line.match(/^\d+[.)]\s*(.+)$/);
    if (match) {
      items.push(match[1].trim());
    } else if (line && !line.match(/^[#=-]{2,}/)) {
      items.push(line);
    }
  }

  return { name: listName.trim() || 'My List', type, dueDate, items };
}

// ── PasteImportModal ──────────────────────────────────────────────────────────
export function PasteImportModal({ onImport, onCancel }) {
  const [raw, setRaw] = useState('');
  const parsed = useMemo(() => (raw.trim() ? parseListText(raw) : null), [raw]);
  const canCreate = parsed && parsed.items.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Paste your list</label>
        <textarea
          className="app-input"
          style={{ minHeight: '9rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65, fontSize: '0.9375rem' }}
          placeholder={'Grocery List - 06-24-26\n- Watermelon\n- Milk\n- Eggs\n\nWork Tasks - 06-24-26\n- Submit timesheet'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          autoFocus
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
          First line is the list name + optional date. Each item starts with a dash (-)
        </p>
      </div>

      {parsed && (
        <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.875rem', padding: '1rem', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
            <span style={{
              fontSize: '0.6875rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--accent-text)', backgroundColor: 'rgba(99,102,241,0.14)',
              padding: '0.15rem 0.5rem', borderRadius: '0.375rem',
            }}>
              {listTypeMeta(parsed.type).short}
            </span>
            <span style={{ fontWeight: '700', color: 'var(--text)', fontSize: '0.9375rem' }}>{parsed.name}</span>
            {parsed.dueDate && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--muted)' }}>
                <Calendar size={11} /> {fmtDate(parsed.dueDate)}
              </span>
            )}
          </div>
          {parsed.items.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>No items found — make sure each item starts with a dash (-)</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {parsed.items.map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text)' }}>
                  <span style={{ color: 'var(--border)', flexShrink: 0, marginTop: '0.1rem' }}>○</span> {item}
                </li>
              ))}
            </ul>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            {parsed.items.length} {parsed.items.length === 1 ? 'item' : 'items'} will be created
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button
          type="button"
          onClick={() => canCreate && onImport(parsed)}
          disabled={!canCreate}
          className="app-btn-primary"
          style={{ flex: 1, opacity: canCreate ? 1 : 0.45 }}
        >
          Create List
        </button>
      </div>
    </div>
  );
}
