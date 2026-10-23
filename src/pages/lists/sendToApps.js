import { isTaskList } from '../../utils/helpers.js';
import {
  escapeText, ymd, nextDay, localStamp, utcStamp, isISODate, alarmLines, buildCalendar,
} from '../../utils/ics.js';
import { isHeading } from './subtasks.js';
import { dueMs } from './taskSort.js';

/**
 * Sending a list out to Apple's own apps.
 *
 * Calendar takes an .ics file, the same way Work Time exports shifts: every
 * open task with a due date becomes an event.
 *
 * Reminders has no file it will import, and a web page can't reach it
 * directly, so there are two routes in:
 *
 *   1. A Shortcut. The list is copied to the clipboard as JSON and the
 *      "Finance to Reminders" shortcut is opened; it reads the clipboard and
 *      adds one reminder per task, due dates included. It has to be built by
 *      hand once — the steps are in the modal.
 *   2. Plain text, one task per line. Pasting that into a Reminders list
 *      makes one reminder per line. No setup, but no due dates either.
 */

export const REMINDERS_SHORTCUT_NAME = 'Finance to Reminders';

export function remindersShortcutUrl(name = REMINDERS_SHORTCUT_NAME) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}`;
}

/**
 * What's worth sending: unfinished work. Headings are labels rather than
 * tasks, and anything already done or ticked off has nothing left to remind
 * anyone about. Sorted the way the list itself reads — soonest due first.
 */
export function itemsToSend(list, items = []) {
  const open = isTaskList(list.type)
    ? items.filter((i) => !isHeading(i) && i.status !== 'done')
    : items.filter((i) => !i.checked);
  return open
    .map((item, index) => ({ item, index, due: isTaskList(list.type) ? dueMs(item) : null }))
    .sort((a, b) => {
      if (a.due == null && b.due == null) return a.index - b.index;
      if (a.due == null) return 1;
      if (b.due == null) return -1;
      return a.due - b.due;
    })
    .map(({ item }) => item);
}

/** The line a reminder is titled with: a grocery's quantity rides along. */
function reminderTitle(list, item) {
  const name = String(item.name || '').trim();
  return !isTaskList(list.type) && item.qty ? `${name} (${item.qty})` : name;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A due moment the way Shortcuts reads a date out of text:
 * "October 20, 2026 at 7:00 PM". Built by hand rather than through
 * `toLocaleString`, which puts a narrow no-break space before "PM" on newer
 * browsers — a character date detection isn't guaranteed to accept.
 *
 * A task due on a day with no time gets 9:00 AM, the hour Reminders itself
 * alerts on for an all-day reminder.
 */
export function shortcutDueText(dueDate, dueTime) {
  if (!isISODate(dueDate)) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  let [h, min] = (dueTime || '09:00').split(':').map(Number);
  if (!Number.isFinite(h)) h = 9;
  if (!Number.isFinite(min)) min = 0;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[m - 1]} ${d}, ${y} at ${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The JSON the shortcut reads off the clipboard. */
export function buildRemindersPayload(list, items) {
  const taskList = isTaskList(list.type);
  return {
    list: list.name,
    reminders: itemsToSend(list, items).map((item) => {
      const r = { title: reminderTitle(list, item) };
      const due = taskList ? shortcutDueText(item.dueDate, item.dueTime) : null;
      if (due) r.due = due;
      if (item.notes) r.notes = String(item.notes);
      return r;
    }),
  };
}

/** One task per line, ready to paste into a Reminders list. */
export function buildRemindersText(list, items) {
  return itemsToSend(list, items)
    .map((item) => reminderTitle(list, item).replace(/\s*\r?\n\s*/g, ' '))
    .filter(Boolean)
    .join('\n');
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// A timed task is an event this long, starting at its due time — long enough
// to show up on a day view, short enough not to block out the afternoon.
const TIMED_TASK_MINUTES = 30;

function addMinutes(dueDate, dueTime, minutes) {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [h, min] = dueTime.split(':').map(Number);
  const end = new Date(y, m - 1, d, h, (min || 0) + minutes);
  const date = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return localStamp(date, `${end.getHours()}:${end.getMinutes()}`);
}

const RRULE_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };

function taskEvent(item, dtstamp) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:task-${item.id}@expensetracker`,
    `DTSTAMP:${dtstamp}`,
  ];
  const timed = /^\d{1,2}:\d{2}$/.test(item.dueTime || '');
  if (timed) {
    lines.push(`DTSTART:${localStamp(item.dueDate, item.dueTime)}`);
    lines.push(`DTEND:${addMinutes(item.dueDate, item.dueTime, TIMED_TASK_MINUTES)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(item.dueDate)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(nextDay(item.dueDate))}`);
    lines.push('TRANSP:TRANSPARENT');
  }
  lines.push(`SUMMARY:${escapeText(item.name || 'Task')}`);
  if (item.address) lines.push(`LOCATION:${escapeText(item.address)}`);
  if (item.notes) lines.push(`DESCRIPTION:${escapeText(item.notes)}`);

  const freq = RRULE_FREQ[item.repeat?.freq];
  if (freq) {
    const n = Math.max(1, Number(item.repeat.interval) || 1);
    lines.push(`RRULE:FREQ=${freq}${n > 1 ? `;INTERVAL=${n}` : ''}`);
  }

  // The task's own reminder carries over. An all-day one alerts at 9 AM on
  // the day, as Apple Calendar does by default — midnight would be useless.
  if (item.notifyEnabled) {
    const lead = Math.max(0, Number(item.remindOffsetMinutes) || 0);
    lines.push(...alarmLines(item.name || 'Task', timed ? `-PT${lead}M` : 'PT9H'));
  }

  lines.push('END:VEVENT');
  return lines;
}

/** Open tasks that have a day to sit on in a calendar. */
export function calendarTasks(list, items) {
  if (!isTaskList(list.type)) return [];
  return itemsToSend(list, items).filter((i) => isISODate(i.dueDate));
}

/**
 * The text of an .ics file for a task list. Each event's UID is the task's id,
 * so importing the same task again is recognised as the same event.
 * `now` is only there so tests get a stable DTSTAMP.
 */
export function buildTasksIcs(list, items, { now = new Date() } = {}) {
  const dtstamp = utcStamp(now);
  return buildCalendar(
    calendarTasks(list, items).flatMap((item) => taskEvent(item, dtstamp)),
    { calendarName: list.name || 'Tasks', product: 'Lists' },
  );
}

/** "Groceries & stuff" → "groceries-stuff.ics" */
export function icsFilename(list) {
  const slug = String(list.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'tasks'}.ics`;
}
