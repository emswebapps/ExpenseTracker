import { useState, useMemo, useEffect } from 'react';
import {
  ShoppingCart, Plus, X, MoreVertical, Pencil, Trash2,
  Archive, ArchiveRestore, MessageSquare, Check, Store,
  ClipboardList, Bell, BellOff, CheckCircle2, Ban,
  Circle, Clipboard, Calendar, CalendarClock, Briefcase,
  Gift, Link2, ExternalLink, User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import { isTaskList, isWishlist, safeExternalUrl, linkHost, formatCurrency } from '../utils/helpers';
import {
  requestNotificationPermission, notificationPermission, formatDueBadge, getDueDateMs,
  REMINDER_LEAD_OPTIONS, localTodayISO, formatDueMoment,
} from '../utils/notifications';

// ── List type config ─────────────────────────────────────────────────────────
// 'todo' and 'work' are both task lists — same card, same due date/time and
// reminder behaviour. They're split so work items can be filtered on their own.
const LIST_TYPES = [
  { key: 'grocery', short: 'Grocery', Icon: ShoppingCart },
  { key: 'todo', short: 'To-Do', Icon: ClipboardList },
  { key: 'work', short: 'Work', Icon: Briefcase },
  { key: 'wishlist', short: 'Wishlist', Icon: Gift },
];

const listTypeMeta = (type) => LIST_TYPES.find((t) => t.key === type) || LIST_TYPES[0];

/** Offsets for the quick due-date chips, in days from today. */
const QUICK_DATES = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
];

/** "YYYY-MM-DD" for a date `days` from today, in local time. */
function isoInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── ListForm ──────────────────────────────────────────────────────────────────
function ListForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [type, setType] = useState(initial.type || 'grocery');
  const [store, setStore] = useState(initial.store || '');
  const [forPerson, setForPerson] = useState(initial.forPerson || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      type,
      store: type === 'grocery' ? (store.trim() || null) : null,
      forPerson: isWishlist(type) ? (forPerson.trim() || null) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">List Name *</label>
        <input className="app-input" placeholder="e.g. Weekly Groceries, Project Tasks…" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Type</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {LIST_TYPES.map(({ key, short, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              style={{
                flex: 1, minWidth: 0, padding: '0.625rem 0.375rem', borderRadius: '0.75rem', border: '2px solid',
                borderColor: type === key ? 'var(--accent)' : 'var(--border)',
                backgroundColor: type === key ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: type === key ? 'var(--accent-text)' : 'var(--muted)',
                fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem',
              }}
            >
              <Icon size={14} style={{ flexShrink: 0 }} /> {short}
            </button>
          ))}
        </div>
      </div>
      {type === 'grocery' && (
        <div>
          <label className="app-label">Store <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="e.g. Walmart, Costco, Target…" value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
      )}
      {isWishlist(type) && (
        <div>
          <label className="app-label">Who it's for <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
          <input className="app-input" placeholder="Leave blank for yourself — or a name, e.g. Mom" value={forPerson} onChange={(e) => setForPerson(e.target.value)} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save</button>
      </div>
    </form>
  );
}

// ── GroceryItemForm ───────────────────────────────────────────────────────────
function GroceryItemForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [qty, setQty] = useState(initial.qty || '');
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), qty: qty.trim() || null, price: price !== '' ? parseFloat(price) : null });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Item *</label>
        <input className="app-input" placeholder="e.g. Milk, Chicken breast…" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Qty <span style={{ color: 'var(--subtle)' }}>(opt)</span></label>
          <input className="app-input" placeholder="e.g. 2, 3 lbs" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Price <span style={{ color: 'var(--subtle)' }}>(opt)</span></label>
          <input className="app-input" type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Item</button>
      </div>
    </form>
  );
}

// ── WishlistItemForm ──────────────────────────────────────────────────────────
// A thing you'd like to buy later: what it is, roughly what it costs, and where
// to find it again.
function WishlistItemForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [url, setUrl] = useState(initial.url || '');
  const [price, setPrice] = useState(initial.price != null ? String(initial.price) : '');
  const [notes, setNotes] = useState(initial.notes || '');

  const badLink = url.trim() !== '' && !safeExternalUrl(url);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || badLink) return;
    onSave({
      name: name.trim(),
      url: safeExternalUrl(url),
      price: price !== '' ? parseFloat(price) : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Item *</label>
        <input className="app-input" placeholder="e.g. Noise-cancelling headphones" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Link <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" type="url" inputMode="url" placeholder="Paste the product page" value={url} onChange={(e) => setUrl(e.target.value)} />
        {badLink && (
          <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.375rem' }}>
            That doesn't look like a web address.
          </p>
        )}
      </div>
      <div>
        <label className="app-label">Price <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" type="number" step="0.01" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div>
        <label className="app-label">Notes <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" placeholder="e.g. size medium, black one" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }} disabled={badLink}>Save Item</button>
      </div>
    </form>
  );
}

// ── TaskItemForm ──────────────────────────────────────────────────────────────
// Used by both to-do and work lists. A task is due at an absolute moment — a
// date and a clock time — never a countdown.
function TaskItemForm({ initial = {}, defaultLeadMinutes = 0, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [dueDate, setDueDate] = useState(initial.dueDate || '');
  const [dueTime, setDueTime] = useState(initial.dueTime || '');
  const [notifyEnabled, setNotifyEnabled] = useState(initial.notifyEnabled ?? false);
  const [remindOffset, setRemindOffset] = useState(
    initial.remindOffsetMinutes ?? defaultLeadMinutes ?? 0
  );
  const [permDenied, setPermDenied] = useState(false);

  const ensurePermission = async () => {
    const perm = notificationPermission();
    if (perm === 'granted') return true;
    if (perm === 'denied') { setPermDenied(true); return false; }
    const result = await requestNotificationPermission();
    if (result === 'granted') return true;
    setPermDenied(true);
    return false;
  };

  const handleNotifyToggle = async () => {
    if (notifyEnabled) { setNotifyEnabled(false); return; }
    if (await ensurePermission()) setNotifyEnabled(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    // A time with no date means "today at that time." No date and no time means
    // the task simply has no deadline.
    const resolvedDate = dueDate || (dueTime ? localTodayISO() : null);
    const hasDeadline = !!resolvedDate;

    onSave({
      name: name.trim(),
      notes: notes.trim() || null,
      dueDate: resolvedDate,
      dueTime: hasDeadline ? (dueTime || null) : null,
      notifyEnabled: hasDeadline ? notifyEnabled : false,
      remindOffsetMinutes: hasDeadline && notifyEnabled ? Number(remindOffset) || 0 : 0,
      status: initial.status || 'pending',
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label className="app-label">Task *</label>
        <input className="app-input" placeholder="What needs to be done?" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div>
        <label className="app-label">Notes <span style={{ color: 'var(--subtle)' }}>(optional)</span></label>
        <input className="app-input" placeholder="Additional details…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Due Date</label>
          <input className="app-input" type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); if (!e.target.value && !dueTime) setNotifyEnabled(false); }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Due Time</label>
          <input className="app-input" type="time" value={dueTime} onChange={(e) => { setDueTime(e.target.value); if (!e.target.value && !dueDate) setNotifyEnabled(false); }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '-0.5rem' }}>
        {QUICK_DATES.map(({ label, days }) => {
          const iso = isoInDays(days);
          const active = dueDate === iso;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDueDate(active ? '' : iso)}
              style={{
                padding: '0.3125rem 0.625rem', borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: '600',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: active ? 'var(--accent-text)' : 'var(--muted)', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
        {(dueDate || dueTime) && (
          <button
            type="button"
            onClick={() => { setDueDate(''); setDueTime(''); setNotifyEnabled(false); }}
            style={{
              padding: '0.3125rem 0.625rem', borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: '600',
              border: '1.5px solid var(--border)', backgroundColor: 'transparent',
              color: 'var(--subtle)', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '-0.5rem' }}>
        {formatDueMoment(dueDate, dueTime)
          ? `Due ${formatDueMoment(dueDate, dueTime)}.`
          : 'Set the exact date and time this task is due. Leave the date blank to use today (e.g. 2:00 PM today).'}
      </p>
      {(dueDate || dueTime) && (
        <div>
          <button
            type="button"
            onClick={handleNotifyToggle}
            style={{
              width: '100%', padding: '0.75rem', borderRadius: '0.75rem',
              border: `2px solid ${notifyEnabled ? 'var(--accent)' : 'var(--border)'}`,
              backgroundColor: notifyEnabled ? 'rgba(99,102,241,0.1)' : 'var(--surface2)',
              color: notifyEnabled ? 'var(--accent-text)' : 'var(--muted)',
              fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
            }}
          >
            {notifyEnabled ? <Bell size={15} /> : <BellOff size={15} />}
            {notifyEnabled ? 'Push notification when due (on)' : 'Push notification when due'}
          </button>
          {notifyEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', flexShrink: 0 }}>Remind me</span>
              <select
                value={remindOffset}
                onChange={(e) => setRemindOffset(Number(e.target.value))}
                style={{ flex: 1, backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.375rem 0.5rem', color: 'var(--text)', fontSize: '0.875rem' }}
              >
                {REMINDER_LEAD_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {permDenied && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>
          Notifications are blocked in your browser settings.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
        <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" className="app-btn-primary" style={{ flex: 1 }}>Save Task</button>
      </div>
    </form>
  );
}

// ── GroceryExportModal ────────────────────────────────────────────────────────
function ExportModal({ list, items, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    const lines = [`🛒 ${list.name}`];
    if (list.store) lines.push(list.store);
    lines.push('');
    const unchecked = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);
    const fmt = (item, done) => {
      let line = (done ? '✓ ' : '☐ ') + item.name;
      if (item.qty) line += ` (${item.qty})`;
      if (item.price != null) line += ` - $${Number(item.price).toFixed(2)}`;
      return line;
    };
    unchecked.forEach((i) => lines.push(fmt(i, false)));
    if (unchecked.length > 0 && checked.length > 0) lines.push('');
    checked.forEach((i) => lines.push(fmt(i, true)));
    const priced = items.filter((i) => i.price != null);
    if (priced.length > 0) {
      lines.push('');
      lines.push(`Est. total: $${priced.reduce((s, i) => s + (i.price ?? 0), 0).toFixed(2)}`);
    }
    return lines.join('\n');
  }, [list, items]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ backgroundColor: 'var(--surface2)', borderRadius: '0.75rem', padding: '1rem', border: '1px solid var(--border)' }}>
        <pre style={{ fontFamily: 'inherit', fontSize: '0.875rem', color: 'var(--text)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}>{text}</pre>
      </div>
      <button onClick={handleCopy} className="app-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
        {copied ? <Check size={16} /> : <MessageSquare size={16} />}
        {copied ? 'Copied!' : 'Copy for Text Message'}
      </button>
      <button onClick={onClose} className="app-btn-secondary">Close</button>
    </div>
  );
}

// ── List text parser ─────────────────────────────────────────────────────────
function parseListText(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  let listName = firstLine;
  let dueDate = null;

  // Match trailing date: "- 06-24-26" or "- 06/24/2026"
  const dateMatch = firstLine.match(/[-–]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*$/);
  if (dateMatch) {
    listName = firstLine.slice(0, firstLine.lastIndexOf(dateMatch[0])).trim();
    const parts = dateMatch[1].split(/[\/\-]/);
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
    } else if (line && !line.match(/^[#=\-]{2,}/)) {
      items.push(line);
    }
  }

  return { name: listName.trim() || 'My List', type, dueDate, items };
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── PasteImportModal ──────────────────────────────────────────────────────────
function PasteImportModal({ onImport, onCancel }) {
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

// ── Live clock for due-time badges ────────────────────────────────────────────
// Due badges show minutes remaining inside the last hour, so they need to be
// re-rendered as the clock moves. Only ticks while a card with dated tasks is
// open, and only twice a minute — nothing here counts seconds.
function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [active]);
}

// ── Shared menu button style ──────────────────────────────────────────────────
const MENU_BTN = {
  width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem',
  padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
};

// ── GroceryListCard ───────────────────────────────────────────────────────────
function GroceryListCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddItem, onDeleteItem, onToggleItem, onEditItem, onExport,
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');

  const checkedCount = listItems.filter((i) => i.checked).length;
  const priced = listItems.filter((i) => i.price != null);
  const total = priced.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const progress = listItems.length > 0 ? checkedCount / listItems.length : 0;

  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    onAddItem({ listId: list.id, name: trimmed, qty: null, price: null, checked: false });
    setQuickAdd('');
  };

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <ShoppingCart size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
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
            <input className="app-input" style={{ flex: 1 }} placeholder="Add item…" value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()} />
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

// ── WishlistCard ──────────────────────────────────────────────────────────────
function WishlistCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddItem, onDeleteItem, onToggleItem, onEditItem,
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');

  const bought = listItems.filter((i) => i.checked);
  const wanted = listItems.filter((i) => !i.checked);
  const remaining = wanted.reduce((sum, i) => sum + (i.price ?? 0), 0);
  const progress = listItems.length > 0 ? bought.length / listItems.length : 0;

  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    // A pasted link on its own becomes an item named after its site.
    const asLink = safeExternalUrl(trimmed);
    const looksLikeUrl = asLink && /^(https?:\/\/|www\.)/i.test(trimmed);
    onAddItem({
      listId: list.id,
      name: looksLikeUrl ? (linkHost(trimmed) || trimmed) : trimmed,
      url: looksLikeUrl ? asLink : null,
      price: null, notes: null, qty: null, checked: false,
    });
    setQuickAdd('');
  };

  return (
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
              <Gift size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
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
            <input className="app-input" style={{ flex: 1 }} placeholder="Add an item or paste a link…" value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()} />
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

// ── TaskListCard ──────────────────────────────────────────────────────────────
// Renders both to-do and work lists. Every task is due at a real date and time;
// the clock button on a row sets that moment without opening the full editor.
function TaskListCard({
  list, listItems,
  onEditList, onDeleteList, onArchiveList,
  onAddTodoItem, onDeleteItem, onUpdateItem, onEditItem,
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const [dueMenuFor, setDueMenuFor] = useState(null);
  const [dueDraft, setDueDraft] = useState({ date: '', time: '' });

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

  const openDueMenu = (item) => {
    if (dueMenuFor === item.id) { setDueMenuFor(null); return; }
    setDueDraft({ date: item.dueDate || '', time: item.dueTime || '' });
    setDueMenuFor(item.id);
  };

  const saveDue = async (itemId) => {
    // A time with no date means today, matching the full task editor.
    const date = dueDraft.date || (dueDraft.time ? localTodayISO() : null);
    let notify = false;
    if (date) {
      // Setting a deadline here implies you want telling about it — the full
      // editor is where you'd turn the reminder back off. Never let an ignored
      // permission prompt hold up saving the deadline itself.
      if (notificationPermission() === 'default') {
        const result = await Promise.race([
          requestNotificationPermission(),
          new Promise((resolve) => setTimeout(() => resolve('dismissed'), 5000)),
        ]);
        notify = result === 'granted';
      } else {
        notify = notificationPermission() === 'granted';
      }
    }
    onUpdateItem(itemId, {
      dueDate: date,
      dueTime: date ? (dueDraft.time || null) : null,
      notifyEnabled: notify,
    });
    setDueMenuFor(null);
  };

  const clearDue = (itemId) => {
    onUpdateItem(itemId, { dueDate: null, dueTime: null, notifyEnabled: false, remindOffsetMinutes: 0 });
    setDueMenuFor(null);
  };

  const handleQuickAdd = () => {
    const trimmed = quickAdd.trim();
    if (!trimmed) return;
    onAddTodoItem({ listId: list.id, name: trimmed, status: 'pending', notes: null, dueDate: null, dueTime: null, notifyEnabled: false, remindOffsetMinutes: 0 });
    setQuickAdd('');
  };

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
    <div style={{ position: 'relative', backgroundColor: 'var(--surface)', border: `1px solid ${overdue.length > 0 ? 'rgba(244,63,94,0.4)' : 'var(--border)'}`, borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <ListIcon size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
              <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text)' }}>{list.name}</span>
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
            listItems.map((item) => {
              const isDone = item.status === 'done';
              const isBlocked = item.status === 'blocked';
              const pendingItem = !isDone && !isBlocked;
              const due = item.dueDate ? formatDueBadge(item.dueDate, item.dueTime) : null;
              const isOverdue = due?.label === 'Overdue';

              return (
                <div key={item.id} style={{
                  padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
                  opacity: (isDone || isBlocked) ? 0.55 : 1,
                  backgroundColor: isOverdue && pendingItem ? 'rgba(244,63,94,0.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <button
                      onClick={() => cycleStatus(item)}
                      style={{ flexShrink: 0, marginTop: '0.125rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem', display: 'flex', color: isDone ? 'var(--positive)' : isBlocked ? '#f59e0b' : 'var(--border)' }}
                    >
                      {isDone ? <CheckCircle2 size={20} /> : isBlocked ? <Ban size={20} /> : <Circle size={20} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditItem(item)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9375rem', color: isOverdue && pendingItem ? 'var(--danger)' : 'var(--text)', textDecoration: (isDone || isBlocked) ? 'line-through' : 'none', fontWeight: isOverdue && pendingItem ? '600' : '400' }}>
                          {item.name}
                        </span>
                        {due && pendingItem && (
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: due.color, backgroundColor: `${due.color}18`, padding: '0.0625rem 0.375rem', borderRadius: '0.375rem' }}>
                            {due.label}
                          </span>
                        )}
                        {item.notifyEnabled && pendingItem && <Bell size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                      </div>
                      {item.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem', margin: '0.125rem 0 0' }}>{item.notes}</p>}
                    </div>
                    {pendingItem && (
                      <button
                        onClick={() => openDueMenu(item)}
                        title={item.dueDate ? 'Change due date & time' : 'Set a due date & time'}
                        style={{ flexShrink: 0, padding: '0.375rem', color: item.dueDate ? 'var(--accent-text)' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: '0.5rem' }}
                      >
                        <CalendarClock size={14} />
                      </button>
                    )}
                    {pendingItem && (
                      <button
                        onClick={() => markBlocked(item)}
                        title="Mark as can't complete"
                        style={{ flexShrink: 0, padding: '0.375rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: '0.5rem' }}
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button onClick={() => onDeleteItem(item.id)} style={{ flexShrink: 0, color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', display: 'flex', borderRadius: '0.5rem' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {dueMenuFor === item.id && (
                    <div style={{ marginTop: '0.625rem', marginLeft: '1.8rem', padding: '0.75rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          className="app-input" type="date" value={dueDraft.date}
                          onChange={(e) => setDueDraft((d) => ({ ...d, date: e.target.value }))}
                          style={{ flex: 1, minWidth: 0, height: 'auto', padding: '0.4375rem 0.5rem', fontSize: '0.8125rem' }}
                        />
                        <input
                          className="app-input" type="time" value={dueDraft.time}
                          onChange={(e) => setDueDraft((d) => ({ ...d, time: e.target.value }))}
                          style={{ flex: 1, minWidth: 0, height: 'auto', padding: '0.4375rem 0.5rem', fontSize: '0.8125rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3125rem', marginTop: '0.5rem' }}>
                        {QUICK_DATES.map(({ label, days }) => {
                          const iso = isoInDays(days);
                          const active = dueDraft.date === iso;
                          return (
                            <button
                              key={label}
                              onClick={() => setDueDraft((d) => ({ ...d, date: active ? '' : iso }))}
                              style={{
                                padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: '600',
                                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                                backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
                                color: active ? 'var(--accent-text)' : 'var(--muted)', cursor: 'pointer',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--subtle)', margin: '0.5rem 0 0' }}>
                        {formatDueMoment(dueDraft.date, dueDraft.time)
                          ? `Due ${formatDueMoment(dueDraft.date, dueDraft.time)}`
                          : 'Pick a date and time. A time on its own means today.'}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                        <button
                          onClick={() => (item.dueDate ? clearDue(item.id) : setDueMenuFor(null))}
                          style={{ flex: 1, padding: '0.4375rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: '600', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          {item.dueDate ? 'Clear due' : 'Cancel'}
                        </button>
                        <button
                          onClick={() => saveDue(item.id)}
                          style={{ flex: 1, padding: '0.4375rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: '700', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
            <input
              className="app-input" style={{ flex: 1 }} placeholder="Quick add task…"
              value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ShoppingLists() {
  const {
    shoppingLists, addShoppingList, updateShoppingList, deleteShoppingList,
    shoppingItems, addShoppingItem, updateShoppingItem, deleteShoppingItem, toggleShoppingItem, importList,
    notifPrefs,
  } = useApp();

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
        shoppingItems.some((i) => i.listId === l.id && i.name.toLowerCase().includes(q))
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

  const cardProps = (list) => ({
    list,
    listItems: shoppingItems.filter((i) => i.listId === list.id),
    onEditList: setEditList,
    onDeleteList: deleteShoppingList,
    onArchiveList: (id) => updateShoppingList(id, { archived: !shoppingLists.find((l) => l.id === id)?.archived }),
    onEditItem: handleEditItem,
    onDeleteItem: deleteShoppingItem,
  });

  const groceryCardProps = (list) => ({
    ...cardProps(list),
    onAddItem: addShoppingItem,
    onToggleItem: toggleShoppingItem,
    onExport: setExportList,
  });

  const taskCardProps = (list) => ({
    ...cardProps(list),
    onAddTodoItem: addShoppingItem,
    onUpdateItem: updateShoppingItem,
  });

  const wishlistCardProps = (list) => ({
    ...cardProps(list),
    onAddItem: addShoppingItem,
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
          <ListForm onSave={(data) => { addShoppingList(data); setShowNewList(false); }} onCancel={() => setShowNewList(false)} />
        </Modal>
      )}
      {editList && (
        <Modal title="Edit List" onClose={() => setEditList(null)}>
          <ListForm initial={editList} onSave={(data) => { updateShoppingList(editList.id, data); setEditList(null); }} onCancel={() => setEditList(null)} />
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
      {editItem && isTaskList(editItemListType) && (
        <Modal title="Edit Task" onClose={() => setEditItem(null)}>
          <TaskItemForm
            initial={editItem}
            defaultLeadMinutes={notifPrefs?.todos?.defaultLeadMinutes ?? 0}
            onSave={(data) => { updateShoppingItem(editItem.id, data); setEditItem(null); }}
            onCancel={() => setEditItem(null)}
          />
        </Modal>
      )}
      {exportList && (
        <Modal title="Share List" onClose={() => setExportList(null)}>
          <ExportModal list={exportList} items={exportItems} onClose={() => setExportList(null)} />
        </Modal>
      )}
    </div>
  );
}
