import { useState } from 'react';
import {
  MapPin, Paperclip, Bell, Ban, Circle, CheckCircle2, CalendarClock, Trash2, Star, Repeat,
} from 'lucide-react';
import { mapsHref, mapsAppName } from '../../utils/helpers';
import { fileCategory } from '../../utils/storageUtils';
import {
  formatDueBadge, formatDueMoment, localTodayISO,
  notificationPermission, requestNotificationPermission,
} from '../../utils/notifications';
import { QUICK_DATES, isoInDays } from './listMeta';
import { repeatLabel } from './recurrence.js';

// ── Task address & photos ─────────────────────────────────────────────────────
/**
 * The address on a task row. Tapping it hands off to the Maps app rather than
 * opening the task editor, so `stopPropagation` matters here.
 */
export function TaskAddressLink({ address }) {
  const href = mapsHref(address);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open in ${mapsAppName()}`}
      style={{
        display: 'inline-flex', alignItems: 'flex-start', gap: '0.25rem',
        marginTop: '0.25rem', fontSize: '0.8125rem', fontWeight: 600,
        color: 'var(--accent-text)', textDecoration: 'none',
      }}
    >
      <MapPin size={12} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
      <span>{address}</span>
    </a>
  );
}

/** Thumbnails of whatever is attached to a task — tap one to open the viewer. */
export function TaskPhotoStrip({ attachments = [], onOpen }) {
  if (!attachments || attachments.length === 0) return null;
  const shown = attachments.slice(0, 4);
  const extra = attachments.length - shown.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
      {shown.map((att) => (
        <button
          key={att.id}
          onClick={(e) => { e.stopPropagation(); onOpen?.(att); }}
          title={att.name}
          style={{
            width: '2.75rem', height: '2.75rem', padding: 0, flexShrink: 0,
            borderRadius: '0.5rem', overflow: 'hidden', cursor: 'pointer',
            border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {fileCategory(att.type) === 'image'
            ? <img src={att.url} alt={att.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Paperclip size={14} style={{ color: 'var(--muted)' }} />}
        </button>
      ))}
      {extra > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpen?.(attachments[shown.length]); }}
          style={{
            height: '2.75rem', padding: '0 0.5rem', flexShrink: 0,
            borderRadius: '0.5rem', cursor: 'pointer',
            border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
            color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 700,
          }}
        >
          +{extra}
        </button>
      )}
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────
/**
 * One task, wherever it's shown — inside its list card or flattened into the
 * Today view. The row owns its own due-date menu (that popover is per-task, so
 * per-row state is simpler than threading an open-id through the parent), but
 * it never decides what completing a task *means*: `onToggleStatus` and
 * `onSetBlocked` are handed down, which is what keeps completion stamping and
 * recurrence out of the presentation layer.
 *
 * Props:
 *   item             — the task
 *   listLabel        — list name badge, shown when the row is out of its card
 *   onEdit           — open the full editor
 *   onUpdate(id,patch)
 *   onDelete(id)
 *   onToggleStatus(item) / onSetBlocked(item)
 *   onOpenAttachment(item, att)
 */
export default function TaskRow({
  item, listLabel,
  onEdit, onUpdate, onDelete, onToggleStatus, onSetBlocked, onOpenAttachment,
}) {
  const [dueOpen, setDueOpen] = useState(false);
  const [dueDraft, setDueDraft] = useState({ date: '', time: '' });

  const isDone = item.status === 'done';
  const isBlocked = item.status === 'blocked';
  const pendingItem = !isDone && !isBlocked;
  const due = item.dueDate ? formatDueBadge(item.dueDate, item.dueTime) : null;
  const isOverdue = due?.label === 'Overdue';
  const repeats = repeatLabel(item.repeat);

  const openDueMenu = () => {
    if (dueOpen) { setDueOpen(false); return; }
    setDueDraft({ date: item.dueDate || '', time: item.dueTime || '' });
    setDueOpen(true);
  };

  const saveDue = async () => {
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
    onUpdate(item.id, {
      dueDate: date,
      dueTime: date ? (dueDraft.time || null) : null,
      notifyEnabled: notify,
    });
    setDueOpen(false);
  };

  const clearDue = () => {
    onUpdate(item.id, { dueDate: null, dueTime: null, notifyEnabled: false, remindOffsetMinutes: 0 });
    setDueOpen(false);
  };

  return (
    <div style={{
      padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
      opacity: (isDone || isBlocked) ? 0.55 : 1,
      backgroundColor: isOverdue && pendingItem ? 'rgba(244,63,94,0.04)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <button
          onClick={() => onToggleStatus(item)}
          style={{ flexShrink: 0, marginTop: '0.125rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.125rem', display: 'flex', color: isDone ? 'var(--positive)' : isBlocked ? '#f59e0b' : 'var(--border)' }}
        >
          {isDone ? <CheckCircle2 size={20} /> : isBlocked ? <Ban size={20} /> : <Circle size={20} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(item)}>
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
            {repeats && pendingItem && (
              <span title={repeats} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.1875rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                <Repeat size={10} /> {repeats.replace('Repeats ', '')}
              </span>
            )}
            {listLabel && (
              <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'var(--muted)', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', padding: '0.0625rem 0.375rem', borderRadius: '0.375rem' }}>
                {listLabel}
              </span>
            )}
          </div>
          {item.notes && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem', margin: '0.125rem 0 0' }}>{item.notes}</p>}
          <TaskAddressLink address={item.address} />
          <TaskPhotoStrip
            attachments={item.attachments}
            onOpen={(att) => onOpenAttachment?.(item, att)}
          />
        </div>
        {pendingItem && (
          <button
            onClick={() => onUpdate(item.id, { flagged: !item.flagged })}
            title={item.flagged ? 'Remove star' : 'Star as important'}
            style={{ flexShrink: 0, padding: '0.375rem', color: item.flagged ? '#f59e0b' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: '0.5rem' }}
          >
            <Star size={14} fill={item.flagged ? '#f59e0b' : 'none'} />
          </button>
        )}
        {pendingItem && (
          <button
            onClick={openDueMenu}
            title={item.dueDate ? 'Change due date & time' : 'Set a due date & time'}
            style={{ flexShrink: 0, padding: '0.375rem', color: item.dueDate ? 'var(--accent-text)' : 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: '0.5rem' }}
          >
            <CalendarClock size={14} />
          </button>
        )}
        {pendingItem && (
          <button
            onClick={() => onSetBlocked(item)}
            title="Mark as can't complete"
            style={{ flexShrink: 0, padding: '0.375rem', color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', borderRadius: '0.5rem' }}
          >
            <Ban size={14} />
          </button>
        )}
        <button onClick={() => onDelete(item.id)} style={{ flexShrink: 0, color: 'var(--subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', display: 'flex', borderRadius: '0.5rem' }}>
          <Trash2 size={14} />
        </button>
      </div>

      {dueOpen && (
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
              onClick={() => (item.dueDate ? clearDue() : setDueOpen(false))}
              style={{ flex: 1, padding: '0.4375rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: '600', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
            >
              {item.dueDate ? 'Clear due' : 'Cancel'}
            </button>
            <button
              onClick={saveDue}
              style={{ flex: 1, padding: '0.4375rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: '700', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
