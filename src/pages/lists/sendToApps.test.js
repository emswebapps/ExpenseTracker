import { test } from 'node:test';
import assert from 'node:assert';
import {
  itemsToSend, shortcutDueText, buildRemindersPayload, buildRemindersText,
  buildTasksIcs, calendarTasks, remindersShortcutUrl, icsFilename,
} from './sendToApps.js';

const todo = { id: 'L1', name: 'House', type: 'todo' };
const grocery = { id: 'G1', name: 'Groceries', type: 'grocery' };
const now = new Date('2026-10-16T15:04:05.123Z');

function events(ics) {
  return ics.split('BEGIN:VEVENT').slice(1);
}

test('only unfinished work is sent, soonest due first, undated last', () => {
  const items = [
    { id: 'u', name: 'Someday', status: 'pending' },
    { id: 'd', name: 'Done already', status: 'done', dueDate: '2026-10-01' },
    { id: 'h', name: 'Monday', header: true, dueDate: '2026-10-19' },
    { id: 'b', name: 'Blocked', status: 'blocked', dueDate: '2026-10-25' },
    { id: 'a', name: 'Soon', status: 'pending', dueDate: '2026-10-20', dueTime: '08:00' },
  ];
  assert.deepStrictEqual(itemsToSend(todo, items).map((i) => i.id), ['a', 'b', 'u']);
});

test('grocery lists send what is not yet checked off, in list order', () => {
  const items = [
    { id: '1', name: 'Milk', qty: '2', checked: false },
    { id: '2', name: 'Eggs', checked: true },
    { id: '3', name: 'Bread', checked: false },
  ];
  assert.strictEqual(buildRemindersText(grocery, items), 'Milk (2)\nBread');
  assert.deepStrictEqual(calendarTasks(grocery, items), []);
});

test('due text reads the way Shortcuts parses a date', () => {
  assert.strictEqual(shortcutDueText('2026-10-20', '19:05'), 'October 20, 2026 at 7:05 PM');
  assert.strictEqual(shortcutDueText('2026-01-02', '00:30'), 'January 2, 2026 at 12:30 AM');
  assert.strictEqual(shortcutDueText('2026-12-31', '12:00'), 'December 31, 2026 at 12:00 PM');
  // A day with no time alerts in the morning, not at midnight.
  assert.strictEqual(shortcutDueText('2026-10-20', null), 'October 20, 2026 at 9:00 AM');
  assert.strictEqual(shortcutDueText(null, '10:00'), null);
});

test('the Reminders payload carries titles, due dates and notes', () => {
  const payload = buildRemindersPayload(todo, [
    { id: 'a', name: 'Trash out', status: 'pending', dueDate: '2026-10-20', dueTime: '19:00', notes: 'bins too' },
    { id: 'b', name: 'Call plumber', status: 'pending' },
  ]);
  assert.deepStrictEqual(payload, {
    list: 'House',
    reminders: [
      { title: 'Trash out', due: 'October 20, 2026 at 7:00 PM', notes: 'bins too' },
      { title: 'Call plumber' },
    ],
  });
});

test('pasted text is one reminder per line, even if a name had a line break', () => {
  const text = buildRemindersText(todo, [
    { id: 'a', name: 'Pick up\nprescription', status: 'pending' },
    { id: 'b', name: 'Mow', status: 'pending' },
  ]);
  assert.strictEqual(text, 'Pick up prescription\nMow');
});

test('the shortcut is opened by name', () => {
  assert.strictEqual(remindersShortcutUrl(), 'shortcuts://run-shortcut?name=Finance%20to%20Reminders');
});

test('a timed task is a short event with its reminder as an alert', () => {
  const ics = buildTasksIcs(todo, [
    { id: 'a', name: 'Dentist', status: 'pending', dueDate: '2026-10-20', dueTime: '23:45', address: '1 Main St', notifyEnabled: true, remindOffsetMinutes: 60 },
  ], { now });
  const [ev] = events(ics);
  assert.match(ics, /X-WR-CALNAME:House\r\n/);
  assert.match(ev, /UID:task-a@expensetracker\r\n/);
  assert.match(ev, /DTSTAMP:20261016T150405Z\r\n/);
  assert.match(ev, /DTSTART:20261020T234500\r\n/);
  // Runs past midnight into the next day.
  assert.match(ev, /DTEND:20261021T001500\r\n/);
  assert.match(ev, /SUMMARY:Dentist\r\n/);
  assert.match(ev, /LOCATION:1 Main St\r\n/);
  assert.match(ev, /TRIGGER:-PT60M\r\n/);
});

test('a dated task with no time is an all-day event; undated and done tasks are left out', () => {
  const ics = buildTasksIcs(todo, [
    { id: 'a', name: 'Pay rent', status: 'pending', dueDate: '2026-10-31', notifyEnabled: true },
    { id: 'b', name: 'Someday', status: 'pending' },
    { id: 'c', name: 'Finished', status: 'done', dueDate: '2026-10-20' },
  ], { now });
  const evs = events(ics);
  assert.strictEqual(evs.length, 1);
  assert.match(evs[0], /DTSTART;VALUE=DATE:20261031\r\n/);
  assert.match(evs[0], /DTEND;VALUE=DATE:20261101\r\n/);
  assert.match(evs[0], /TRIGGER:PT9H\r\n/);
});

test('a repeating task repeats in the calendar too', () => {
  const ics = buildTasksIcs(todo, [
    { id: 'w', name: 'Bins', status: 'pending', dueDate: '2026-10-20', repeat: { freq: 'weekly', interval: 1 } },
    { id: 'm', name: 'Filter', status: 'pending', dueDate: '2026-10-21', repeat: { freq: 'monthly', interval: 3 } },
  ], { now });
  const [w, m] = events(ics);
  assert.match(w, /RRULE:FREQ=WEEKLY\r\n/);
  assert.match(m, /RRULE:FREQ=MONTHLY;INTERVAL=3\r\n/);
});

test('the file is named after the list', () => {
  assert.strictEqual(icsFilename({ name: 'Groceries & Stuff!' }), 'groceries-stuff.ics');
  assert.strictEqual(icsFilename({ name: '🎉' }), 'tasks.ics');
});
