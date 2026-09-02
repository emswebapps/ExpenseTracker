import { localISO, getDueDateMs } from '../../utils/dueDates.js';

/**
 * Repeating tasks. A repeat is stored on the task itself as
 * `{ freq: 'daily'|'weekly'|'monthly', interval: 1 }` — weekly repeats land on
 * whatever weekday the due date already falls on, so there's no separate
 * weekday list to keep in sync with the date.
 *
 * Completing a repeating task spawns the *next* one rather than resurrecting
 * the same row, which keeps the history of what was actually done intact.
 */

export const REPEAT_OPTIONS = [
  { freq: null, label: "Doesn't repeat" },
  { freq: 'daily', label: 'Daily' },
  { freq: 'weekly', label: 'Weekly' },
  { freq: 'monthly', label: 'Monthly' },
];

export function repeatLabel(repeat) {
  if (!repeat?.freq) return null;
  const n = Number(repeat.interval) || 1;
  if (n === 1) return { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' }[repeat.freq] ?? null;
  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months' }[repeat.freq];
  return unit ? `Repeats every ${n} ${unit}` : null;
}

/** Add one step of the repeat to a "YYYY-MM-DD" date. */
function step(dateISO, freq, interval) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12); // midday, so DST can't shift the day
  if (freq === 'daily') date.setDate(date.getDate() + interval);
  else if (freq === 'weekly') date.setDate(date.getDate() + 7 * interval);
  else if (freq === 'monthly') {
    // Clamp rather than overflow: the 31st + 1 month is the 28th/30th, not the
    // 1st or 2nd of the month after.
    const targetMonth = date.getMonth() + interval;
    const wanted = date.getDate();
    date.setDate(1);
    date.setMonth(targetMonth);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(wanted, lastDay));
  } else return null;
  return localISO(date);
}

/**
 * The next due date after completing `item`, or null if it doesn't repeat.
 *
 * Rolls forward until it lands in the future, so a chore ignored for three
 * weeks produces one upcoming task rather than three backdated ones.
 */
export function nextOccurrence(item, now = Date.now()) {
  const freq = item?.repeat?.freq;
  if (!freq || !item.dueDate) return null;
  const interval = Math.max(1, Number(item.repeat.interval) || 1);

  let date = item.dueDate;
  for (let guard = 0; guard < 500; guard += 1) {
    const nextDate = step(date, freq, interval);
    if (!nextDate) return null;
    date = nextDate;
    if (getDueDateMs(date, item.dueTime) > now) return date;
  }
  return date;
}

/** Shift a "YYYY-MM-DD" by a whole number of days. */
function shiftDays(dateISO, days) {
  if (!dateISO || !days) return dateISO ?? null;
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12); // midday, so DST can't shift the day
  date.setDate(date.getDate() + days);
  return localISO(date);
}

/** Whole days from one "YYYY-MM-DD" to another. */
function daysBetween(fromISO, toISO) {
  const parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toISO) - parse(fromISO)) / 86400000);
}

/**
 * The follow-up task to create when `item` is completed, or null.
 *
 * Photos deliberately don't carry over — a receipt belongs to the occurrence it
 * came from. Neither does completion state, and `spawnedNextId` is left off so
 * the new task can itself spawn one later.
 */
export function buildNextOccurrence(item, nextId, now = Date.now()) {
  const dueDate = nextOccurrence(item, now);
  if (!dueDate) return null;
  return {
    id: nextId,
    listId: item.listId,
    parentId: item.parentId ?? null,
    sectionId: item.sectionId ?? null,
    header: !!item.header,
    name: item.name,
    notes: item.notes ?? null,
    address: item.address ?? null,
    attachments: [],
    status: 'pending',
    completedAt: null,
    flagged: !!item.flagged,
    dueDate,
    dueTime: item.dueTime ?? null,
    notifyEnabled: !!item.notifyEnabled,
    remindOffsetMinutes: Number(item.remindOffsetMinutes) || 0,
    repeat: { freq: item.repeat.freq, interval: Math.max(1, Number(item.repeat.interval) || 1) },
  };
}

/**
 * The whole next occurrence of a repeating task — the task itself plus fresh
 * copies of its subtasks — or null if it doesn't repeat.
 *
 * The subtasks move with the parent rather than keeping their own dates: a
 * weekly "MONDAY" heading rolling from the 7th to the 14th has to take "EMS
 * class, 8:00 AM" to the 14th at 8:00 AM, not leave it behind on the 7th. The
 * shift is the same whole number of days the parent moved, so a subtask
 * deliberately dated two days after its parent stays two days after it.
 *
 * `newId` is called once per task created, so the caller controls id
 * generation (and can hand out the id it already used for the parent).
 */
export function buildNextOccurrenceGroup(item, children = [], newId, now = Date.now()) {
  const parent = buildNextOccurrence(item, newId(), now);
  if (!parent) return null;

  const delta = daysBetween(item.dueDate, parent.dueDate);
  const clones = children.map((child) => ({
    id: newId(),
    listId: child.listId,
    parentId: parent.id,
    sectionId: child.sectionId ?? null,
    name: child.name,
    notes: child.notes ?? null,
    address: child.address ?? null,
    header: !!child.header,
    attachments: [],
    status: 'pending',
    completedAt: null,
    flagged: !!child.flagged,
    dueDate: shiftDays(child.dueDate, delta),
    dueTime: child.dueTime ?? null,
    notifyEnabled: !!child.notifyEnabled,
    remindOffsetMinutes: Number(child.remindOffsetMinutes) || 0,
    repeat: child.repeat?.freq
      ? { freq: child.repeat.freq, interval: Math.max(1, Number(child.repeat.interval) || 1) }
      : null,
  }));

  return [parent, ...clones];
}
