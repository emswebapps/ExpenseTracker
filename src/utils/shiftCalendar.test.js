import { test } from 'node:test';
import assert from 'node:assert';
import { buildShiftsIcs } from './shiftCalendar.js';

const jobs = [{ id: 'j1', name: 'Main Station' }];
const now = new Date('2026-10-16T15:04:05.123Z');

function events(ics) {
  return ics.split('BEGIN:VEVENT').slice(1);
}

test('a timed shift becomes a timed event with a stable UID', () => {
  const ics = buildShiftsIcs([
    { id: 'a', jobId: 'j1', date: '2026-10-20', startTime: '07:00', endTime: '15:30', hoursWorked: 8.5, location: 'HQ', notes: 'covering' },
  ], jobs, { now });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  const [ev] = events(ics);
  assert.match(ev, /UID:shift-a@expensetracker\r\n/);
  assert.match(ev, /DTSTAMP:20261016T150405Z\r\n/);
  assert.match(ev, /DTSTART:20261020T070000\r\n/);
  assert.match(ev, /DTEND:20261020T153000\r\n/);
  assert.match(ev, /SUMMARY:Main Station\r\n/);
  assert.match(ev, /LOCATION:HQ\r\n/);
  assert.match(ev, /DESCRIPTION:8\.5h · covering\r\n/);
});

test('an overnight shift ends the next day, across a month end too', () => {
  const ics = buildShiftsIcs([
    { id: 'n', jobId: 'j1', date: '2026-10-31', startTime: '19:00', endTime: '07:00', hoursWorked: 12 },
  ], jobs, { now });
  assert.match(ics, /DTSTART:20261031T190000\r\n/);
  assert.match(ics, /DTEND:20261101T070000\r\n/);
});

test('hours with no clock times become an all-day entry naming the hours', () => {
  const ics = buildShiftsIcs([
    { id: 'h', jobId: 'j1', date: '2026-12-31', hoursWorked: 6 },
  ], jobs, { now });
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20270101\r\n/);
  assert.match(ics, /SUMMARY:Main Station \(6h\)\r\n/);
});

test('a shift reminder carries over as an alert', () => {
  const ics = buildShiftsIcs([
    { id: 'r', jobId: 'j1', date: '2026-10-20', startTime: '07:00', endTime: '15:00', notificationEnabled: true, notificationOffsetMinutes: 60 },
  ], jobs, { now });
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Main Station\r\nTRIGGER:-PT60M\r\nEND:VALARM/);
});

test('special characters are escaped and long lines are folded', () => {
  const notes = 'Bring badge, keys; and the \\ form\nthen ' + 'x'.repeat(100);
  const ics = buildShiftsIcs([
    { id: 'e', jobId: 'j1', date: '2026-10-20', startTime: '07:00', endTime: '15:00', notes },
  ], jobs, { now });
  assert.match(ics, /Bring badge\\, keys\\; and the \\\\ form\\nthen/);
  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  // Unfolding restores the original line.
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('x'.repeat(100)));
});

test('events are sorted by date, and a shift with an unknown job still exports', () => {
  const ics = buildShiftsIcs([
    { id: 'b', jobId: 'gone', date: '2026-10-22', startTime: '09:00', endTime: '17:00' },
    { id: 'a', jobId: 'j1', date: '2026-10-21', startTime: '09:00', endTime: '17:00' },
  ], jobs, { now });
  const evs = events(ics);
  assert.strictEqual(evs.length, 2);
  assert.match(evs[0], /UID:shift-a@/);
  assert.match(evs[1], /SUMMARY:Work\r\n/);
});
