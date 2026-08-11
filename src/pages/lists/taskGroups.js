import { localISO, getDueDateMs } from '../../utils/dueDates.js';
import { sortTasks } from './taskSort.js';

/**
 * Tasks inside a list card, split into the buckets you actually plan around.
 *
 * A flat list sorted by due date reads fine when everything is dated, but a
 * to-do list that mixes an overdue errand, a 7am work item and an appointment
 * next Tuesday gives no sense of *when* — you have to read every badge to find
 * the shape of the day. Grouping under headings does that reading for you.
 *
 * Buckets are calendar-relative, not duration-relative: "Tomorrow" means the
 * next calendar day, not "within 24 hours". That matches how the due badges
 * already read and how someone plans a day.
 *
 *   overdue   — dated, still open, and the moment has passed
 *   today     — due on today's date and not yet passed
 *   tomorrow  — due on the next calendar day
 *   thisWeek  — due within the following 6 days (through day+7 exclusive)
 *   later     — dated beyond that
 *   undated   — no due date at all
 *   done      — status 'done', regardless of date
 *
 * Blocked tasks are *not* pulled out the way `collectAgenda` pulls them: inside
 * their own list they're still something you have to deal with, so they stay in
 * their date bucket (matching `compareTasks`, which only sinks 'done').
 */

export const TASK_BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'undated', label: 'No date' },
  { key: 'done', label: 'Done' },
];

/** Epoch ms this task is due, or null. Mirrors `taskSort`'s fallback. */
function dueMs(item) {
  if (item.dueAt != null) return item.dueAt;
  if (!item.dueDate) return null;
  return getDueDateMs(item.dueDate, item.dueTime);
}

/** Which bucket a single task belongs in. Exported for tests. */
export function bucketOf(item, now = Date.now()) {
  if (item.status === 'done') return 'done';
  if (!item.dueDate) return 'undated';

  const due = dueMs(item);
  // Being late wins over the calendar bucket, same rule the Today view uses:
  // a task due at 9am today, seen at 6pm, is Overdue rather than Today.
  if (due != null && due < now) return 'overdue';

  const ref = new Date(now);
  const today = localISO(ref);
  if (item.dueDate === today) return 'today';

  const dayAfter = (days) => {
    const d = new Date(ref);
    d.setDate(d.getDate() + days);
    return localISO(d);
  };
  if (item.dueDate === dayAfter(1)) return 'tomorrow';
  // Through the next 6 days — day+7 and beyond reads as "Later".
  if (item.dueDate < dayAfter(7)) return 'thisWeek';
  return 'later';
}

/**
 * Group and sort a list's tasks for display.
 *
 * Returns the buckets in display order, each already sorted by the shared
 * `sortTasks` comparator so ordering *within* a group stays identical to the
 * flat list it replaces. Empty buckets are dropped, so the caller can render
 * the result directly without filtering.
 *
 * @returns {{key: string, label: string, items: object[]}[]}
 */
export function groupTasks(items = [], now = Date.now()) {
  const byKey = new Map(TASK_BUCKETS.map(({ key }) => [key, []]));
  for (const item of items) byKey.get(bucketOf(item, now)).push(item);

  return TASK_BUCKETS
    .filter(({ key }) => byKey.get(key).length > 0)
    .map(({ key, label }) => ({ key, label, items: sortTasks(byKey.get(key), now) }));
}
