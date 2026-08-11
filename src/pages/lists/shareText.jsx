import { useState, useMemo } from 'react';
import { MessageSquare, Check, Clipboard } from 'lucide-react';
import { isTaskList, isWishlist } from '../../utils/helpers';
import { formatDueMoment } from '../../utils/notifications';

// ── ExportModal ───────────────────────────────────────────────────────────────
// Every list type can be sent as a text message, so this formats by type rather
// than assuming groceries: task lists carry a status and a due time, wishlists
// carry a link, groceries carry quantity and price.
export function buildShareText(list, items) {
  const taskList = isTaskList(list.type);
  const wishlist = isWishlist(list.type);
  const isDone = (i) => (taskList ? i.status === 'done' : !!i.checked);

  const heading = taskList ? '📋' : wishlist ? '🎁' : '🛒';
  const lines = [`${heading} ${list.name}`];
  if (list.store) lines.push(list.store);
  if (wishlist && list.forPerson) lines.push(`For: ${list.forPerson}`);
  lines.push('');

  const fmt = (item) => {
    let line;
    if (taskList) {
      line = (item.status === 'done' ? '✓ ' : item.status === 'blocked' ? '⛔ ' : '☐ ') + item.name;
      const due = formatDueMoment(item.dueDate, item.dueTime);
      if (due) line += ` — ${due}`;
    } else {
      line = (isDone(item) ? '✓ ' : '☐ ') + item.name;
      if (item.qty) line += ` (${item.qty})`;
      if (item.price != null) line += ` - $${Number(item.price).toFixed(2)}`;
    }
    if (item.notes) line += `\n    ${item.notes}`;
    if (taskList && item.address) line += `\n    📍 ${item.address}`;
    if (wishlist && item.url) line += `\n    ${item.url}`;
    return line;
  };

  const open = items.filter((i) => !isDone(i));
  const done = items.filter(isDone);
  open.forEach((i) => lines.push(fmt(i)));
  if (open.length > 0 && done.length > 0) lines.push('');
  done.forEach((i) => lines.push(fmt(i)));

  if (items.length === 0) lines.push('(no items yet)');

  // A running total only means something where the items carry prices.
  if (!taskList) {
    const priced = items.filter((i) => i.price != null);
    if (priced.length > 0) {
      lines.push('');
      const total = priced.reduce((s, i) => s + (i.price ?? 0), 0);
      lines.push(`${wishlist ? 'Total' : 'Est. total'}: $${total.toFixed(2)}`);
    }
  }
  return lines.join('\n');
}

export function ExportModal({ list, items, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => buildShareText(list, items), [list, items]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  // On a phone this opens the OS share sheet, so the list goes straight into
  // Messages instead of making you paste it yourself. Desktop browsers mostly
  // lack it, so copying stays available either way.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const handleShare = () => {
    navigator.share({ title: list.name, text }).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '1rem', border: '1px solid var(--border)' }}>
        <pre style={{ fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}>{text}</pre>
      </div>
      {canShare && (
        <button onClick={handleShare} className="app-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
          <MessageSquare size={16} /> Send as Text Message
        </button>
      )}
      <button onClick={handleCopy} className={canShare ? 'app-btn-secondary' : 'app-btn-primary'} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
        {copied ? <Check size={16} /> : <Clipboard size={16} />}
        {copied ? 'Copied!' : 'Copy to Clipboard'}
      </button>
      <button onClick={onClose} className="app-btn-secondary">Close</button>
    </div>
  );
}
