// ── Due-date maths and formatting ──────────────────────────────────────────
// Split out of utils/notifications.js, which pulls in the Firebase SDK at
// import time. Nothing here touches Firebase or the DOM, so the pieces that
// decide when something is due — and how that reads on a badge — can be unit
// tested on their own and imported from anywhere without dragging the whole
// messaging stack along. notifications.js re-exports all of it, so existing
// imports from there keep working.

// Lead time between the reminder push and the item's due moment.
export const REMINDER_LEAD_OPTIONS = [
  { minutes: 0, label: 'At due time' },
  { minutes: 5, label: '5 min before' },
  { minutes: 15, label: '15 min before' },
  { minutes: 30, label: '30 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: '1 day before' },
];

/** A Date as a local "YYYY-MM-DD" string. */
export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today's date as a local "YYYY-MM-DD" string. */
export function localTodayISO() {
  return localISO(new Date());
}

/** "YYYY-MM-DD" for a date `days` from today, in local time. */
export function isoInDays(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localISO(d);
}

/**
 * "Today" / "Tomorrow" / "9/7/26" — a date on its own, the way a calendar row
 * reads it rather than the way a deadline does.
 *
 * `formatDueBadge` is about urgency: it says "Overdue" and counts down in
 * minutes. That's right for a task and wrong for a day heading, which is a
 * label for a date that has simply been and gone.
 */
export function formatCalendarDate(dateISO, from = new Date()) {
  if (!dateISO) return null;
  if (dateISO === localISO(from)) return 'Today';
  if (dateISO === isoInDays(1, from)) return 'Tomorrow';
  if (dateISO === isoInDays(-1, from)) return 'Yesterday';
  const d = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

export function getDueDateMs(dueDate, dueTime) {
  if (!dueDate) return null;
  return new Date(`${dueDate}T${dueTime || '23:59'}`).getTime();
}

/**
 * Absolute epoch ms for a to-do's due moment, resolved in the device's local
 * time zone. Stored on the item as `dueAt` so the Cloud Function can schedule
 * pushes without having to guess the user's time zone.
 *
 * A blank date with a time given assumes today, so "due at 2:00 PM" means today
 * at 2 PM. A blank date and blank time means the item has no deadline.
 */
export function computeDueAt(dueDate, dueTime) {
  if (!dueDate && !dueTime) return null;
  const date = dueDate || localTodayISO();
  const ms = new Date(`${date}T${dueTime || '23:59'}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Epoch ms at which a to-do's due reminder should fire, or null. */
export function todoReminderAt(item) {
  const dueAt = item.dueAt ?? computeDueAt(item.dueDate, item.dueTime);
  if (!dueAt) return null;
  const lead = Number(item.remindOffsetMinutes) || 0;
  return dueAt - lead * 60 * 1000;
}

/** "Mon, Aug 4 at 2:30 PM" — the full due moment, for confirmation copy. */
export function formatDueMoment(dueDate, dueTime) {
  if (!dueDate && !dueTime) return null;
  const at = computeDueAt(dueDate, dueTime);
  if (!at) return null;
  const d = new Date(at);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  // No time given means end of day — say so rather than showing "11:59 PM".
  if (!dueTime) return `${day} (end of day)`;
  return `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function formatDueBadge(dueDate, dueTime) {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(`${dueDate}T${dueTime || '23:59'}`);
  const diff = due - now;
  const diffHours = diff / (1000 * 60 * 60);
  const diffDays = diff / (1000 * 60 * 60 * 24);

  if (diff < 0) return { label: 'Overdue', color: 'var(--danger)' };
  if (diffHours < 1) return { label: `${Math.max(1, Math.round(diff / 60000))}m`, color: 'var(--danger)' };
  if (diffHours < 24) {
    const h = due.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 || 12;
    const m = String(due.getMinutes()).padStart(2, '0');
    return { label: m === '00' ? `${displayH}${ampm}` : `${displayH}:${m}${ampm}`, color: '#f59e0b' };
  }
  if (diffDays < 2) return { label: 'Tomorrow', color: '#f59e0b' };
  if (diffDays < 7) {
    return { label: due.toLocaleDateString('en-US', { weekday: 'short' }), color: 'var(--accent-text)' };
  }
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'var(--muted)' };
}
