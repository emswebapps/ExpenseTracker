import { sortTasks, dueMs } from './taskSort.js';

/**
 * Subtasks. A task nests under another by carrying `parentId`; everything
 * without one is top level. The field is optional, so every list that existed
 * before subtasks did reads as a flat set of parents with no children.
 *
 * Nesting is one level deep by design. The UI only ever offers "add subtask" on
 * a top-level row, which is what the Reminders-style day-heading pattern needs
 * — a heading with its work under it — without the indent-forever problem of
 * arbitrary depth. `descendantIds` still walks recursively, because data
 * arriving from an older client or a shared-list edit can't be assumed to obey
 * that rule.
 *
 * Two rules matter more than they look:
 *
 *   1. A child whose parent is gone is *promoted* to top level rather than
 *      hidden. Losing a parent must never make its work invisible.
 *   2. Headings (`header: true`) are groupings, not work. They're skipped by
 *      progress counts, the Today agenda and due reminders — a day heading that
 *      went past is not a task anybody failed to do.
 */

/** A task that's a heading for the work under it rather than work itself. */
export function isHeading(item) {
  return !!item?.header;
}

/** Map of parentId → its children, each list sorted for display. */
export function indexChildren(items = [], now = Date.now()) {
  const byParent = new Map();
  for (const item of items) {
    if (!item.parentId) continue;
    const bucket = byParent.get(item.parentId);
    if (bucket) bucket.push(item);
    else byParent.set(item.parentId, [item]);
  }
  for (const [key, bucket] of byParent) byParent.set(key, sortTasks(bucket, now));
  return byParent;
}

/**
 * The rows that render at the top of a list: anything with no parent, plus any
 * orphan whose parent isn't in `items` (see rule 1 above).
 */
export function topLevelItems(items = []) {
  const ids = new Set(items.map((i) => i.id));
  return items.filter((i) => !i.parentId || !ids.has(i.parentId));
}

/**
 * Every id beneath `id`, not including `id` itself. Used to cascade a delete or
 * a completion down a subtree.
 */
export function descendantIds(items = [], id) {
  const byParent = new Map();
  for (const item of items) {
    if (!item.parentId) continue;
    const bucket = byParent.get(item.parentId);
    if (bucket) bucket.push(item.id);
    else byParent.set(item.parentId, [item.id]);
  }

  const out = new Set();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const childId of byParent.get(current) || []) {
      // The guard also breaks a parentId cycle, which would otherwise spin here
      // forever.
      if (out.has(childId)) continue;
      out.add(childId);
      queue.push(childId);
    }
  }
  return out;
}

/** `{ done, total }` over a parent's children, headings excluded. */
export function subtaskStats(children = []) {
  const real = children.filter((c) => !isHeading(c));
  return {
    done: real.filter((c) => c.status === 'done').length,
    total: real.length,
  };
}

/**
 * The children still open under a parent — what "complete the parent too?"
 * has to act on, and what makes a heading worth showing at all.
 */
export function openChildren(children = []) {
  return children.filter((c) => c.status !== 'done');
}

/**
 * Epoch ms of the soonest open child, or null. Lets an undated heading sit in
 * the date bucket its work actually falls in rather than under "No date".
 */
export function earliestChildDue(children = []) {
  let soonest = null;
  for (const child of children) {
    if (child.status === 'done') continue;
    const due = dueMs(child);
    if (due == null) continue;
    if (soonest == null || due < soonest) soonest = due;
  }
  return soonest;
}
