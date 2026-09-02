import { useState, useEffect } from 'react';
import { ShoppingCart, ClipboardList, Briefcase, Gift, Bell, CalendarClock } from 'lucide-react';
import { formatDueBadge, formatDueMoment, isoInDays } from '../../utils/dueDates';

export { isoInDays };

// ── List type config ─────────────────────────────────────────────────────────
// 'todo' and 'work' are both task lists — same card, same due date/time and
// reminder behaviour. They're split so work items can be filtered on their own.
export const LIST_TYPES = [
  { key: 'grocery', short: 'Grocery', Icon: ShoppingCart },
  { key: 'todo', short: 'To-Do', Icon: ClipboardList },
  { key: 'work', short: 'Work', Icon: Briefcase },
  { key: 'wishlist', short: 'Wishlist', Icon: Gift },
];

export const listTypeMeta = (type) => LIST_TYPES.find((t) => t.key === type) || LIST_TYPES[0];

/** Offsets for the quick due-date chips, in days from today. */
export const QUICK_DATES = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
  // Anything further out is what the date field is for, but a month deserves a
  // chip — it's the horizon people actually reach for after "next week".
  { label: 'In a month', days: 30 },
];

/**
 * The due chip on a list header, shown when the list itself carries a deadline.
 * A bell marks the ones that will actually notify, so a date set without a
 * reminder doesn't look like it will buzz.
 */
export function ListDueBadge({ list }) {
  const badge = list.dueDate ? formatDueBadge(list.dueDate, list.dueTime) : null;
  if (!badge) return null;
  return (
    <span
      title={formatDueMoment(list.dueDate, list.dueTime) || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.1875rem', flexShrink: 0,
        fontSize: '0.6875rem', fontWeight: '700', color: badge.color,
        backgroundColor: 'var(--surface2)', border: `1px solid ${badge.color}`,
        borderRadius: '0.375rem', padding: '0.0625rem 0.3125rem',
      }}
    >
      {list.notifyEnabled ? <Bell size={9} /> : <CalendarClock size={9} />}
      {badge.label}
    </span>
  );
}

export function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Live clock for due-time badges ────────────────────────────────────────────
// Due badges show minutes remaining inside the last hour, so they need to be
// re-rendered as the clock moves. Only ticks while a card with dated tasks is
// open, and only twice a minute — nothing here counts seconds.
export function useTicker(active) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [active]);
}

/**
 * The same ticker, but handing back the moment it last ticked.
 *
 * For anything that has to *sort or group* by the clock rather than just
 * re-render on it. Reading `Date.now()` inside a render pass is impure: two
 * renders of the same state can disagree about which bucket a task belongs in,
 * and React is free to render twice. Taking the time from state instead makes a
 * render pass deterministic, and the interval is what keeps it current.
 */
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Catch up immediately: a card opened after sitting closed for an hour
    // would otherwise group against the stale time until the first tick.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// ── Shared menu button style ──────────────────────────────────────────────────
export const MENU_BTN = {
  width: '100%', display: 'flex', alignItems: 'center', gap: '0.625rem',
  padding: '0.875rem 1rem', fontSize: '0.875rem', color: 'var(--text)',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
};
