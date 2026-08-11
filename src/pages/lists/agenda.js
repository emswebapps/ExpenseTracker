import { localTodayISO, isoInDays, getDueDateMs } from '../../utils/dueDates.js';
import { isTaskList } from '../../utils/helpers.js';
import { sortTasks } from './taskSort.js';

/**
 * The Today view's data: every dated, still-open task across all active to-do
 * and work lists, split into overdue / today / tomorrow.
 *
 * Blocked tasks are deliberately excluded. They aren't actionable, and one
 * blocked task with an old due date would otherwise sit at the top of Overdue
 * indefinitely.
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

  for (const item of items) {
    if (!listById.has(item.listId)) continue;
    if (item.status === 'done' || item.status === 'blocked') continue;
    if (!item.dueDate) continue;

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
  };
}
