/**
 * The order tasks are shown in, everywhere. Tasks used to render in creation
 * order, which buried whatever was overdue and left finished ones wedged in the
 * middle of the list.
 *
 * The comparator is a fixed sequence of keys so the result is predictable and
 * explainable, rather than a score nobody can reason about:
 *
 *   1. unfinished before finished — 'done' sinks, 'blocked' stays put in place
 *      since it's still something you have to deal with
 *   2. overdue → dated → undated
 *   3. flagged first *within* its bucket, so a starred someday-task can never
 *      outrank something that's actually late
 *   4. soonest due first
 *   5. oldest first — except finished tasks, which read better most-recent
 *      first, so the thing you just ticked off stays at the top of the done pile
 */

const isFinished = (item) => item.status === 'done';

/**
 * Epoch ms this task is due, or null when it carries no deadline.
 *
 * Almost every task carries `dueAt` already; the fallback mirrors `computeDueAt`
 * in utils/notifications for the handful saved before that field existed. It's
 * repeated rather than imported so this module stays free of the Firebase
 * import chain and can be unit-tested on its own.
 */
function dueMs(item) {
  if (item.dueAt != null) return item.dueAt;
  if (!item.dueDate) return null;
  const parsed = new Date(`${item.dueDate}T${item.dueTime || '23:59'}`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function dueBucket(item, now) {
  const due = dueMs(item);
  if (due == null) return 2;
  return due < now ? 0 : 1;
}

const ms = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
};

/** Compare two tasks. Exported for tests and for reuse by the Today view. */
export function compareTasks(a, b, now = Date.now()) {
  const finishedA = isFinished(a);
  const finishedB = isFinished(b);
  if (finishedA !== finishedB) return finishedA ? 1 : -1;

  // Finished tasks don't need due-date ordering — most recently completed wins.
  if (finishedA && finishedB) {
    const diff = ms(b.completedAt) - ms(a.completedAt);
    if (diff !== 0) return diff;
    return ms(a.createdAt) - ms(b.createdAt);
  }

  const bucketA = dueBucket(a, now);
  const bucketB = dueBucket(b, now);
  if (bucketA !== bucketB) return bucketA - bucketB;

  if (!!a.flagged !== !!b.flagged) return a.flagged ? -1 : 1;

  const dueA = dueMs(a);
  const dueB = dueMs(b);
  if (dueA != null && dueB != null && dueA !== dueB) return dueA - dueB;

  return ms(a.createdAt) - ms(b.createdAt);
}

/** A sorted copy — never sorts the caller's array in place. */
export function sortTasks(items = [], now = Date.now()) {
  return [...items].sort((a, b) => compareTasks(a, b, now));
}
