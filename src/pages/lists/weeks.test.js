// Unit tests for the weekly planner.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weekStartISO, addDaysISO, ordinal, weekLabel, weekSectionId,
  weekDates, dayHeadingName, dayHeadingId, weeklyConfig, planWeeks,
  refileByDate, weekSectionFor,
} from './weeks.js';

// Local noon, so nothing here depends on the machine's time zone offset.
const localNoon = (iso) => new Date(`${iso}T12:00:00`);

test('weekStartISO rolls back to the configured first day', () => {
  // 2026-09-09 is a Wednesday.
  assert.equal(weekStartISO(localNoon('2026-09-09'), 1), '2026-09-07'); // Monday
  assert.equal(weekStartISO(localNoon('2026-09-09'), 0), '2026-09-06'); // Sunday
  // A day that already *is* the start stays put.
  assert.equal(weekStartISO(localNoon('2026-09-07'), 1), '2026-09-07');
  // Sunday belongs to the week that began the Monday before it.
  assert.equal(weekStartISO(localNoon('2026-09-13'), 1), '2026-09-07');
});

test('weekStartISO and addDaysISO cross a DST change without losing a day', () => {
  // US DST ends 2026-11-01. A naive 24h step would land on 10-31T23:00 and
  // report the wrong date.
  assert.equal(weekStartISO(localNoon('2026-11-02'), 1), '2026-11-02');
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysISO('2026-11-01', 1), '2026-11-02');
  // And forward across the spring change (2026-03-08).
  assert.equal(addDaysISO('2026-03-07', 2), '2026-03-09');
});

test('addDaysISO crosses month and year boundaries', () => {
  assert.equal(addDaysISO('2026-08-31', 7), '2026-09-07');
  assert.equal(addDaysISO('2026-12-28', 7), '2027-01-04');
  assert.equal(addDaysISO('2027-01-04', -7), '2026-12-28');
});

test('ordinal handles the teens and the tens', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '30th', '31st']);
});

test('weekLabel reads the way it would be written on paper', () => {
  assert.equal(weekLabel('2026-09-07', '2026-09-13'), 'September 7th–13th');
  assert.equal(weekLabel('2026-09-01', '2026-09-06'), 'September 1st–6th');
  // Straddling two months names both.
  assert.equal(weekLabel('2026-08-31', '2026-09-06'), 'August 31st – September 6th');
  // …and two years.
  assert.equal(weekLabel('2026-12-28', '2027-01-03'), 'December 28th – January 3rd');
});

test('weekDates walks from the start day and honours which days are wanted', () => {
  const all = weekDates('2026-09-07', [1, 2, 3, 4, 5, 6, 0], 1);
  assert.deepEqual(all.map((d) => d.dateISO), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-11', '2026-09-12', '2026-09-13',
  ]);
  assert.deepEqual(all.map((d) => d.dayOfWeek), [1, 2, 3, 4, 5, 6, 0]);

  // Weekdays only, still in week order rather than numeric day order.
  const weekdays = weekDates('2026-09-07', [1, 2, 3, 4, 5], 1);
  assert.deepEqual(weekdays.map((d) => d.dateISO), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  ]);
});

test('day headings are named and identified predictably', () => {
  assert.equal(dayHeadingName(1, true), '📅 MONDAY 📅');
  assert.equal(dayHeadingName(1, false), 'MONDAY');
  assert.equal(dayHeadingName(0, true), '📅 SUNDAY 📅');
  assert.equal(dayHeadingId('list1', '2026-09-07'), 'day-list1-2026-09-07');
  assert.equal(weekSectionId('2026-09-07'), 'wk-2026-09-07');
});

test('weeklyConfig fills the gaps and clamps weeksAhead', () => {
  assert.equal(weeklyConfig({}).enabled, false);
  assert.equal(weeklyConfig({ weekly: { enabled: true } }).weeksAhead, 2);
  assert.equal(weeklyConfig({ weekly: { enabled: true, weeksAhead: 99 } }).weeksAhead, 8);
  assert.equal(weeklyConfig({ weekly: { enabled: true, weeksAhead: 0 } }).weeksAhead, 2);
  // An empty day list would generate a week with nothing in it.
  assert.deepEqual(weeklyConfig({ weekly: { days: [] } }).days, [1, 2, 3, 4, 5, 6, 0]);
});

test('planWeeks does nothing for a list that is not a weekly planner', () => {
  assert.equal(planWeeks({ id: 'l1', sections: [] }, [], localNoon('2026-09-09')), null);
});

test('planWeeks builds this week and the next, with a heading per day', () => {
  const list = { id: 'l1', weekly: { enabled: true }, sections: [] };
  const plan = planWeeks(list, [], localNoon('2026-09-09'));

  assert.deepEqual(plan.sections.map((s) => s.name), ['September 7th–13th', 'September 14th–20th']);
  assert.deepEqual(plan.sections.map((s) => s.id), ['wk-2026-09-07', 'wk-2026-09-14']);
  assert.equal(plan.generatedThrough, '2026-09-14');
  assert.equal(plan.items.length, 14);

  const monday = plan.items[0];
  assert.equal(monday.name, '📅 MONDAY 📅');
  assert.equal(monday.dueDate, '2026-09-07');
  assert.equal(monday.sectionId, 'wk-2026-09-07');
  assert.equal(monday.header, true);
  // Headings never notify — the work under them carries its own reminders.
  assert.equal(monday.notifyEnabled, false);
  // Sections sort by the week they cover, whatever order they arrived in.
  assert.ok(plan.sections[0].order < plan.sections[1].order);
});

test('planWeeks is idempotent — a second run adds nothing', () => {
  const list = { id: 'l1', weekly: { enabled: true }, sections: [] };
  const first = planWeeks(list, [], localNoon('2026-09-09'));

  const settled = {
    ...list,
    sections: first.sections,
    weekly: { enabled: true, generatedThrough: first.generatedThrough },
  };
  assert.equal(planWeeks(settled, first.items, localNoon('2026-09-09')), null);
  // Still nothing later the same week.
  assert.equal(planWeeks(settled, first.items, localNoon('2026-09-13')), null);
});

test('planWeeks adds only the newly-needed week as time passes', () => {
  const list = { id: 'l1', weekly: { enabled: true }, sections: [] };
  const first = planWeeks(list, [], localNoon('2026-09-09'));
  const settled = {
    ...list,
    sections: first.sections,
    weekly: { enabled: true, generatedThrough: first.generatedThrough },
  };

  // Monday of what was "next week" — the week after it is now due.
  const next = planWeeks(settled, first.items, localNoon('2026-09-14'));
  assert.deepEqual(next.sections.map((s) => s.id), ['wk-2026-09-21']);
  assert.equal(next.items.length, 7);
  assert.equal(next.generatedThrough, '2026-09-21');
});

test('a week deleted on purpose does not grow back', () => {
  const list = { id: 'l1', weekly: { enabled: true }, sections: [] };
  const first = planWeeks(list, [], localNoon('2026-09-09'));

  // The person throws away next week's column and its rows.
  const kept = first.sections.filter((s) => s.id !== 'wk-2026-09-14');
  const keptItems = first.items.filter((i) => i.sectionId !== 'wk-2026-09-14');
  const settled = {
    ...list,
    sections: kept,
    weekly: { enabled: true, generatedThrough: first.generatedThrough },
  };

  assert.equal(planWeeks(settled, keptItems, localNoon('2026-09-09')), null);
});

test('a day heading deleted inside a generated week stays deleted', () => {
  const list = { id: 'l1', weekly: { enabled: true, weeksAhead: 1 }, sections: [] };
  const first = planWeeks(list, [], localNoon('2026-09-09'));
  const withoutWednesday = first.items.filter((i) => i.dueDate !== '2026-09-09');
  const settled = {
    ...list,
    sections: first.sections,
    weekly: { enabled: true, weeksAhead: 1, generatedThrough: first.generatedThrough },
  };
  assert.equal(planWeeks(settled, withoutWednesday, localNoon('2026-09-09')), null);
});

test('planWeeks respects a renamed week section', () => {
  const list = { id: 'l1', weekly: { enabled: true, weeksAhead: 1 }, sections: [] };
  const first = planWeeks(list, [], localNoon('2026-09-09'));
  const renamed = [{ ...first.sections[0], name: 'EMS week' }];
  const settled = { ...list, sections: renamed, weekly: { enabled: true, weeksAhead: 1 } };

  // No generatedThrough recorded, so it reconsiders the week — and leaves the
  // renamed section alone because its id is already there.
  const again = planWeeks(settled, first.items, localNoon('2026-09-09'));
  assert.equal(again, null);
});

// ── Filing a dated task into the week it belongs to ─────────────────────────

const weekly = (over = {}) => ({
  id: 'L1', weekly: { enabled: true }, sections: [], ...over,
});
const task = (over = {}) => ({
  id: 'T1', listId: 'L1', name: 'Dentist', status: 'pending',
  parentId: null, sectionId: null, dueDate: null, header: false, ...over,
});

test('a task dated months out builds its week and day, and lands in them', () => {
  const list = weekly();
  const plan = refileByDate(list, [task({ dueDate: '2026-12-14' })]);

  assert.deepStrictEqual(plan.sections.map((s) => s.name), ['December 14th–20th']);
  assert.strictEqual(plan.sections[0].id, 'wk-2026-12-14');
  assert.strictEqual(plan.items.length, 1);
  assert.strictEqual(plan.items[0].name, '📅 MONDAY 📅');
  assert.strictEqual(plan.items[0].dueDate, '2026-12-14');
  assert.deepStrictEqual(plan.patches, [
    { id: 'T1', sectionId: 'wk-2026-12-14', parentId: 'day-L1-2026-12-14' },
  ]);
});

test('the day heading is named for the weekday the date actually falls on', () => {
  // 2027-03-02 is a Tuesday.
  const plan = refileByDate(weekly(), [task({ dueDate: '2027-03-02' })]);
  assert.strictEqual(plan.items[0].name, '📅 TUESDAY 📅');
  assert.strictEqual(plan.sections[0].name, 'March 1st–7th');
});

test('a second task on the same day reuses the day that was just made', () => {
  const plan = refileByDate(weekly(), [
    task({ id: 'T1', dueDate: '2026-12-14' }),
    task({ id: 'T2', dueDate: '2026-12-14' }),
  ]);
  assert.strictEqual(plan.sections.length, 1);
  assert.strictEqual(plan.items.length, 1);
  assert.strictEqual(plan.patches.length, 2);
  assert.ok(plan.patches.every((p) => p.parentId === 'day-L1-2026-12-14'));
});

test('an existing week and day are reused rather than rebuilt', () => {
  const list = weekly({ sections: [weekSectionFor('2026-12-14')] });
  const heading = task({
    id: 'day-L1-2026-12-14', header: true, name: '📅 MONDAY 📅',
    dueDate: '2026-12-14', sectionId: 'wk-2026-12-14',
  });
  const plan = refileByDate(list, [heading, task({ dueDate: '2026-12-14' })]);
  assert.deepStrictEqual(plan.sections, []);
  assert.deepStrictEqual(plan.items, []);
  assert.strictEqual(plan.patches.length, 1);
});

test('a task already filed correctly is left alone', () => {
  const list = weekly({ sections: [weekSectionFor('2026-12-14')] });
  const items = [
    task({ id: 'day-L1-2026-12-14', header: true, dueDate: '2026-12-14', sectionId: 'wk-2026-12-14' }),
    task({ dueDate: '2026-12-14', sectionId: 'wk-2026-12-14', parentId: 'day-L1-2026-12-14' }),
  ];
  assert.strictEqual(refileByDate(list, items), null);
});

test('re-dating a task moves it to the new week and the new day', () => {
  const list = weekly({ sections: [weekSectionFor('2026-12-14'), weekSectionFor('2027-01-11')] });
  const items = [
    task({ id: 'day-L1-2026-12-14', header: true, dueDate: '2026-12-14', sectionId: 'wk-2026-12-14' }),
    // Was under Monday the 14th, now dated the 13th of January.
    task({ dueDate: '2027-01-13', sectionId: 'wk-2026-12-14', parentId: 'day-L1-2026-12-14' }),
  ];
  const plan = refileByDate(list, items);
  assert.deepStrictEqual(plan.patches, [
    { id: 'T1', sectionId: 'wk-2027-01-11', parentId: 'day-L1-2027-01-13' },
  ]);
  // The week exists already; only the new day has to be built.
  assert.deepStrictEqual(plan.sections, []);
  assert.strictEqual(plan.items[0].name, '📅 WEDNESDAY 📅');
});

test('a genuine subtask keeps its parent and only moves week', () => {
  const list = weekly({ sections: [weekSectionFor('2026-12-14')] });
  const items = [
    task({ id: 'P1', name: 'Book the venue', dueDate: '2026-12-14', sectionId: 'wk-2026-12-14' }),
    task({ id: 'C1', name: 'Pay deposit', parentId: 'P1', dueDate: '2027-02-03', sectionId: 'wk-2026-12-14' }),
  ];
  const plan = refileByDate(list, items);
  const child = plan.patches.find((p) => p.id === 'C1');
  assert.strictEqual(child.parentId, 'P1', 'a real subtask stays under its task');
  assert.strictEqual(child.sectionId, 'wk-2027-02-01');
});

test('undated, finished and heading rows are never re-filed', () => {
  const list = weekly({ sections: [weekSectionFor('2026-12-14')] });
  assert.strictEqual(refileByDate(list, [task({ dueDate: null })]), null);
  assert.strictEqual(refileByDate(list, [task({ dueDate: '2026-12-14', status: 'done' })]), null);
  assert.strictEqual(
    refileByDate(list, [task({ header: true, dueDate: '2027-06-01', sectionId: 'wk-2026-12-14' })]),
    null,
  );
});

test('a hand-made section is a decision the date does not override', () => {
  const list = weekly({ sections: [{ id: 'someday', name: 'Someday', order: 99 }] });
  const items = [task({ dueDate: '2027-06-01', sectionId: 'someday' })];
  assert.strictEqual(refileByDate(list, items), null);
});

test('another list\'s tasks are not touched', () => {
  const plan = refileByDate(weekly(), [task({ listId: 'L2', dueDate: '2026-12-14' })]);
  assert.strictEqual(plan, null);
});

test('a list without the planner enabled files nothing', () => {
  const list = { id: 'L1', sections: [] };
  assert.strictEqual(refileByDate(list, [task({ dueDate: '2026-12-14' })]), null);
});

test('the emoji setting is honoured on a day built this way', () => {
  const list = weekly({ weekly: { enabled: true, emoji: false } });
  const plan = refileByDate(list, [task({ dueDate: '2026-12-14' })]);
  assert.strictEqual(plan.items[0].name, 'MONDAY');
});
