import { localISO } from '../../utils/dueDates.js';
import { sortTasks, dueMs } from './taskSort.js';
import { earliestChildDue } from './subtasks.js';

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
 *
 * Only top-level tasks are bucketed — subtasks render under their own parent,
 * so bucketing them too would show the same work twice. A parent with no date
 * of its own borrows the soonest date among its open children, which is what
 * keeps an undated heading out of "No date" when there's work due under it.
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

/**
 * Which bucket a single task belongs in. Exported for tests.
 *
 * `inheritedDue` is the roll-up from a parent's children (epoch ms or null);
 * it's only consulted for a task carrying no date of its own.
 */
export function bucketOf(item, now = Date.now(), inheritedDue = null) {
  if (item.status === 'done') return 'done';

  if (!item.dueDate) {
    if (inheritedDue == null) return 'undated';
    // Bucket by the child's date, without pretending the parent has one: the
    // calendar comparisons below all read `item.dueDate`, so they're done here
    // against the inherited instant instead.
    if (inheritedDue < now) return 'overdue';
    return bucketOfDate(localISO(new Date(inheritedDue)), now);
  }

  const due = dueMs(item);
  // Being late wins over the calendar bucket, same rule the Today view uses:
  // a task due at 9am today, seen at 6pm, is Overdue rather than Today.
  if (due != null && due < now) return 'overdue';

  return bucketOfDate(item.dueDate, now);
}

/** The calendar bucket for a "YYYY-MM-DD" that isn't overdue. */
function bucketOfDate(dateISO, now) {
  const ref = new Date(now);
  if (dateISO === localISO(ref)) return 'today';

  const dayAfter = (days) => {
    const d = new Date(ref);
    d.setDate(d.getDate() + days);
    return localISO(d);
  };
  if (dateISO === dayAfter(1)) return 'tomorrow';
  // Through the next 6 days — day+7 and beyond reads as "Later".
  if (dateISO < dayAfter(7)) return 'thisWeek';
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
 * `items` should be the top-level rows only (see `topLevelItems`). Pass
 * `childrenById` — the map from `indexChildren` — to let an undated parent
 * inherit its children's soonest date.
 *
 * @returns {{key: string, label: string, items: object[]}[]}
 */
export function groupTasks(items = [], now = Date.now(), childrenById = null) {
  const byKey = new Map(TASK_BUCKETS.map(({ key }) => [key, []]));
  for (const item of items) {
    const inherited = childrenById ? earliestChildDue(childrenById.get(item.id) || []) : null;
    byKey.get(bucketOf(item, now, inherited)).push(item);
  }

  return TASK_BUCKETS
    .filter(({ key }) => byKey.get(key).length > 0)
    .map(({ key, label }) => ({ key, label, items: sortTasks(byKey.get(key), now) }));
}
