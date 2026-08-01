// Unit tests for the shift → iCalendar (.ics) export.
// Run with: npm test
import assert from 'node:assert';
import { test } from 'node:test';
import { buildShiftsICS, shiftBounds, resolveReminder, foldLine, escapeText } from './calendarExport.js';

const jobs = [{ id: 'J1', name: 'EMS, Station 4', normalShiftHours: 12 }];
const lines = (ics) => ics.split('\r\n');

test('timed shift becomes a UTC event with an alarm', () => {
  const ics = buildShiftsICS({
    jobs,
    shifts: [{ id: 'S1', jobId: 'J1', date: '2026-08-04', startTime: '07:00', endTime: '19:00', hoursWorked: 12, location: 'Main Station' }],
    reminderMinutes: 30,
  });
  const l = lines(ics);
  assert.ok(l.includes('BEGIN:VCALENDAR') && l.includes('END:VCALENDAR'));
  assert.ok(l.includes('UID:shift-S1@budget-tracker.app'));
  assert.ok(l.some((x) => /^DTSTART:\d{8}T\d{6}Z$/.test(x)), 'DTSTART is a UTC stamp');
  assert.ok(l.includes('TRIGGER:-PT30M'));
  assert.ok(l.includes('LOCATION:Main Station'));
  // comma in the job name must be escaped
  assert.ok(l.includes('SUMMARY:EMS\\, Station 4'));
  // 12 hours apart
  const st = l.find((x) => x.startsWith('DTSTART:')).slice(8);
  const en = l.find((x) => x.startsWith('DTEND:')).slice(6);
  const parse = (s) => Date.parse(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`);
  assert.strictEqual((parse(en) - parse(st)) / 3600000, 12);
});

test('overnight shift ends the next day', () => {
  const b = shiftBounds({ date: '2026-08-04', startTime: '19:00', endTime: '07:00', hoursWorked: 12 }, {});
  assert.strictEqual((b.end - b.start) / 3600000, 12);
  assert.strictEqual(b.end.getDate(), 5);
});

test('missing end time falls back to hours worked', () => {
  const b = shiftBounds({ date: '2026-08-04', startTime: '08:00', hoursWorked: 6.5 }, {});
  assert.strictEqual((b.end - b.start) / 3600000, 6.5);
});

test('shift with no clock times is an all-day event with no alarm', () => {
  const ics = buildShiftsICS({ jobs, shifts: [{ id: 'S2', jobId: 'J1', date: '2026-08-05', hoursWorked: 8 }], reminderMinutes: 30 });
  const l = lines(ics);
  assert.ok(l.includes('DTSTART;VALUE=DATE:20260805'));
  assert.ok(l.includes('DTEND;VALUE=DATE:20260806'));
  assert.ok(!l.includes('BEGIN:VALARM'));
  assert.ok(l.includes('SUMMARY:EMS\\, Station 4 (8h)'));
});

test("per-shift reminder overrides the export default", () => {
  assert.strictEqual(resolveReminder({ notificationEnabled: true, notificationOffsetMinutes: '120' }, 30), 120);
  assert.strictEqual(resolveReminder({ notificationEnabled: false }, 30), 30);
  assert.strictEqual(resolveReminder({ notificationEnabled: false }, null), null);
  assert.strictEqual(resolveReminder({ notificationEnabled: true, notificationOffsetMinutes: '0' }, null), 0);
});

test('no reminder selected means no VALARM', () => {
  const ics = buildShiftsICS({ jobs, shifts: [{ id: 'S3', jobId: 'J1', date: '2026-08-06', startTime: '09:00', hoursWorked: 8 }], reminderMinutes: null });
  assert.ok(!ics.includes('BEGIN:VALARM'));
});

test('long lines fold at 75 octets with a leading space', () => {
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = foldLine(long);
  for (const [i, part] of folded.split('\r\n').entries()) {
    assert.ok(Buffer.byteLength(part) <= 75, `part ${i} too long`);
    if (i > 0) assert.ok(part.startsWith(' '));
  }
  assert.strictEqual(folded.split('\r\n').join('').replace(/ /g, ''), long);
});

test('escaping covers backslash, semicolon, comma, newline', () => {
  assert.strictEqual(escapeText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne');
});

test('events are sorted and notes/OT flag land in the description', () => {
  const ics = buildShiftsICS({
    jobs,
    shifts: [
      { id: 'B', jobId: 'J1', date: '2026-08-10', startTime: '08:00', hoursWorked: 8, notes: 'Covered a shift', otExempt: true },
      { id: 'A', jobId: 'J1', date: '2026-08-09', startTime: '08:00', hoursWorked: 8 },
    ],
    reminderMinutes: 30,
  });
  assert.ok(ics.indexOf('UID:shift-A@') < ics.indexOf('UID:shift-B@'));
  assert.ok(ics.includes('DESCRIPTION:Hours: 8h\\nOT exempt (PTO / holiday)\\nCovered a shift'));
});

test('every line ends CRLF and the file terminates properly', () => {
  const ics = buildShiftsICS({ jobs, shifts: [{ id: 'S9', jobId: 'J1', date: '2026-08-04', startTime: '07:00', hoursWorked: 4 }] });
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics));
});
