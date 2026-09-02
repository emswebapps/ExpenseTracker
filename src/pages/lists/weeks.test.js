// Unit tests for the weekly planner.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weekStartISO, addDaysISO, ordinal, weekLabel, weekSectionId,
  weekDates, dayHeadingName, dayHeadingId, weeklyConfig, planWeeks,
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
