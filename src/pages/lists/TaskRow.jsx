import { useState } from 'react';
import {
  MapPin, Paperclip, Bell, Ban, Circle, CheckCircle2, CalendarClock, Trash2, Star, Repeat,
  MoreHorizontal, RotateCcw,
} from 'lucide-react';
import { mapsHref, mapsAppName } from '../../utils/helpers';
import { fileCategory } from '../../utils/storageUtils';
import {
  formatDueBadge, formatDueMoment, localTodayISO,
  notificationPermission, requestNotificationPermission,
} from '../../utils/notifications';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { QUICK_DATES, isoInDays, MENU_BTN } from './listMeta';
import { repeatLabel } from './recurrence.js';
import { useSwipeRow, SWIPE_ROW_STYLE, DRAWER_WIDTH } from './useSwipeRow';

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
 * Touch targets: four 23px icons used to sit along the right edge, which is
 * under half Apple's 44px minimum and put an unconfirmed delete a thumb-width
 * from a star. They're one 44px "⋯" now, opening an action sheet, with the two
 * common actions also available as swipes — right to complete, left for delete.
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDone = item.status === 'done';
  const isBlocked = item.status === 'blocked';
  const pendingItem = !isDone && !isBlocked;
  const due = item.dueDate ? formatDueBadge(item.dueDate, item.dueTime) : null;
  const isOverdue = due?.label === 'Overdue';
  const repeats = repeatLabel(item.repeat);

  // Swiping is suspended while the due-date panel is open, so dragging the
  // date inputs can't also drag the row out from under them.
  const swipe = useSwipeRow({
    onComplete: () => onToggleStatus(item),
    enabled: !dueOpen,
  });

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

  const runFromSheet = (fn) => { setSheetOpen(false); fn(); };

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Behind the row on the right — revealed by swiping left. */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: `${DRAWER_WIDTH}px`,
        display: 'flex', alignItems: 'stretch',
      }}>
        <button
          onClick={() => { swipe.close(); setConfirmDelete(true); }}
          aria-label={`Delete ${item.name}`}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.1875rem', backgroundColor: 'var(--danger)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 700,
          }}
        >
          <Trash2 size={18} />
          Delete
        </button>
      </div>

      {/* Behind the row on the left — revealed by swiping right. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: `${Math.max(0, swipe.dx)}px`,
        backgroundColor: isDone ? 'var(--warn)' : 'var(--positive)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        paddingLeft: '1rem', color: '#fff', overflow: 'hidden',
      }}>
        {isDone ? <RotateCcw size={18} style={{ flexShrink: 0 }} /> : <CheckCircle2 size={18} style={{ flexShrink: 0 }} />}
      </div>

      {/* The row itself. Opaque, so nothing behind it shows through at rest. */}
      <div
        {...swipe.handlers}
        style={{
          ...SWIPE_ROW_STYLE,
          position: 'relative',
          padding: '0.75rem 0.5rem 0.75rem 1rem',
          opacity: (isDone || isBlocked) ? 0.55 : 1,
          backgroundColor: 'var(--surface)',
          backgroundImage: isOverdue && pendingItem ? 'linear-gradient(rgba(244,63,94,0.06), rgba(244,63,94,0.06))' : 'none',
          transform: `translateX(${swipe.dx}px)`,
          transition: swipe.dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <button
            onClick={() => onToggleStatus(item)}
            aria-label={isDone ? `Mark ${item.name} as not done` : `Complete ${item.name}`}
            style={{
              flexShrink: 0, width: '2.75rem', height: '2.75rem', marginLeft: '-0.5rem',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isDone ? 'var(--positive)' : isBlocked ? '#f59e0b' : 'var(--border2)',
            }}
          >
            {isDone ? <CheckCircle2 size={22} /> : isBlocked ? <Ban size={22} /> : <Circle size={22} />}
          </button>

          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer', paddingTop: '0.375rem' }} onClick={() => onEdit(item)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {item.flagged && pendingItem && (
                <Star size={12} fill="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
              )}
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

          <button
            onClick={() => setSheetOpen(true)}
            aria-label={`Actions for ${item.name}`}
            style={{
              flexShrink: 0, width: '2.75rem', height: '2.75rem',
              color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem',
            }}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>

        {dueOpen && (
          <div style={{ marginTop: '0.625rem', marginLeft: '2.25rem', marginRight: '0.5rem', padding: '0.75rem', borderRadius: '0.75rem', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="app-input" type="date" value={dueDraft.date}
                onChange={(e) => setDueDraft((d) => ({ ...d, date: e.target.value }))}
                style={{ flex: 1, minWidth: 0 }}
              />
              <input
                className="app-input" type="time" value={dueDraft.time}
                onChange={(e) => setDueDraft((d) => ({ ...d, time: e.target.value }))}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
              {QUICK_DATES.map(({ label, days }) => {
                const iso = isoInDays(days);
                const active = dueDraft.date === iso;
                return (
                  <button
                    key={label}
                    onClick={() => setDueDraft((d) => ({ ...d, date: active ? '' : iso }))}
                    style={{
                      padding: '0.5rem 0.75rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: '600',
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
                style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: '600', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
              >
                {item.dueDate ? 'Clear due' : 'Cancel'}
              </button>
              <button
                onClick={saveDue}
                style={{ flex: 1, minHeight: '2.75rem', borderRadius: '0.625rem', fontSize: '0.875rem', fontWeight: '700', border: 'none', backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {sheetOpen && (
        <Modal title={item.name} onClose={() => setSheetOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', margin: '-0.5rem 0' }}>
            <button style={MENU_BTN} onClick={() => runFromSheet(() => onToggleStatus(item))}>
              {isDone ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
              {isDone ? 'Mark as not done' : 'Mark as done'}
            </button>
            <button style={MENU_BTN} onClick={() => runFromSheet(() => onUpdate(item.id, { flagged: !item.flagged }))}>
              <Star size={16} fill={item.flagged ? '#f59e0b' : 'none'} style={{ color: item.flagged ? '#f59e0b' : undefined }} />
              {item.flagged ? 'Remove star' : 'Star as important'}
            </button>
            <button style={MENU_BTN} onClick={() => runFromSheet(openDueMenu)}>
              <CalendarClock size={16} style={{ color: item.dueDate ? 'var(--accent-text)' : undefined }} />
              {item.dueDate ? 'Change due date & time' : 'Set a due date & time'}
            </button>
            <button style={MENU_BTN} onClick={() => runFromSheet(() => onEdit(item))}>
              <MoreHorizontal size={16} /> Edit task details…
            </button>
            <button style={MENU_BTN} onClick={() => runFromSheet(() => onSetBlocked(item))}>
              <Ban size={16} />
              {isBlocked ? 'No longer blocked' : "Can't complete"}
            </button>
            <button
              style={{ ...MENU_BTN, color: 'var(--danger)' }}
              onClick={() => runFromSheet(() => setConfirmDelete(true))}
            >
              <Trash2 size={16} /> Delete task
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete task?"
          message={`"${item.name}" will be removed, along with any photos attached to it. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { setConfirmDelete(false); onDelete(item.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
