import { localTodayISO, isoInDays, getDueDateMs } from '../../utils/dueDates.js';
import { isTaskList } from '../../utils/helpers.js';
import { sortTasks } from './taskSort.js';
import { isHeading } from './subtasks.js';

/**
 * The Today view's data: every dated, still-open task across all active to-do
 * and work lists, split into overdue / today / tomorrow.
 *
 * Blocked tasks are deliberately excluded. They aren't actionable, and one
 * blocked task with an old due date would otherwise sit at the top of Overdue
 * indefinitely.
 *
 * Headings are excluded for a related reason: "📅 MONDAY 📅" dated the 7th is a
 * label for that day, not work anyone can finish, so from the 8th onwards it
 * would sit in Overdue forever with nothing to do about it. The tasks *under*
 * a heading are ordinary dated tasks and show here as normal, tagged with the
 * heading they came from.
 *
 * `parentById` maps an item id to its parent task, for that tag.
 */
export function collectAgenda(lists = [], items = [], now = Date.now()) {
  const listById = new Map(
    lists.filter((l) => isTaskList(l.type) && !l.archived).map((l) => [l.id, l])
  );
  const today = localTodayISO();
  const tomorrow = isoInDays(1);

  const overdue = [];
  const dueToday = [];
  const dueTomorrow = [];
  const parentById = new Map();
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const item of items) {
    if (!listById.has(item.listId)) continue;
    if (item.status === 'done' || item.status === 'blocked') continue;
    if (isHeading(item)) continue;
    if (!item.dueDate) continue;

    if (item.parentId && byId.has(item.parentId)) parentById.set(item.id, byId.get(item.parentId));

    const due = item.dueAt ?? getDueDateMs(item.dueDate, item.dueTime);
    // Being late wins over the calendar bucket: a task due at 9am today, seen
    // at 6pm, belongs under Overdue rather than Today.
    if (due != null && due < now) overdue.push(item);
    else if (item.dueDate === today) dueToday.push(item);
    else if (item.dueDate === tomorrow) dueTomorrow.push(item);
  }

  return {
    overdue: sortTasks(overdue, now),
    dueToday: sortTasks(dueToday, now),
    dueTomorrow: sortTasks(dueTomorrow, now),
    listById,
    parentById,
  };
}
