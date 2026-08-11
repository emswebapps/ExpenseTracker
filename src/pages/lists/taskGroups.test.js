// Unit tests for the due-date buckets shown inside a list card.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert';
import { test } from 'node:test';
import { bucketOf, groupTasks } from './taskGroups.js';

// Local noon, so every bucket boundary is computed well away from a day edge
// and the test doesn't depend on the machine's time zone.
const NOW = new Date(2026, 7, 11, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

const iso = (days) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const task = (id, o = {}) => ({
  id, name: id, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', ...o,
});

const bucket = (o) => bucketOf(task('t', o), NOW);

test('a task with no due date is undated', () => {
  assert.strictEqual(bucket({}), 'undated');
});

test('a past due moment is overdue even when the date is today', () => {
  assert.strictEqual(bucket({ dueDate: iso(0), dueAt: NOW - HOUR }), 'overdue');
});

test('later today is today, not overdue', () => {
  assert.strictEqual(bucket({ dueDate: iso(0), dueAt: NOW + HOUR }), 'today');
});

test('the next calendar day is tomorrow', () => {
  assert.strictEqual(bucket({ dueDate: iso(1), dueAt: NOW + 24 * HOUR }), 'tomorrow');
});

test('days two through six fall in this week', () => {
  for (const d of [2, 3, 6]) {
    assert.strictEqual(bucket({ dueDate: iso(d), dueAt: NOW + d * 24 * HOUR }), 'thisWeek', `day ${d}`);
  }
});

test('a week out and beyond is later', () => {
  assert.strictEqual(bucket({ dueDate: iso(7), dueAt: NOW + 7 * 24 * HOUR }), 'later');
  assert.strictEqual(bucket({ dueDate: iso(30), dueAt: NOW + 30 * 24 * HOUR }), 'later');
});

test('done wins over any due date', () => {
  assert.strictEqual(bucket({ status: 'done', dueDate: iso(0), dueAt: NOW - HOUR }), 'done');
});

test('blocked tasks stay in their date bucket rather than sinking', () => {
  assert.strictEqual(bucket({ status: 'blocked', dueDate: iso(1), dueAt: NOW + 24 * HOUR }), 'tomorrow');
});

test('a task with dueDate but no dueAt falls back to end of day', () => {
  // No dueAt and no time means 23:59 local, which is still ahead of noon.
  assert.strictEqual(bucket({ dueDate: iso(0) }), 'today');
});

test('groupTasks returns buckets in display order and drops empty ones', () => {
  const groups = groupTasks([
    task('undated'),
    task('done', { status: 'done', completedAt: '2026-08-11T10:00:00.000Z' }),
    task('tomorrow', { dueDate: iso(1), dueAt: NOW + 24 * HOUR }),
    task('overdue', { dueDate: iso(0), dueAt: NOW - HOUR }),
  ], NOW);

  assert.deepStrictEqual(
    groups.map((g) => g.key),
    ['overdue', 'tomorrow', 'undated', 'done'],
  );
  assert.deepStrictEqual(groups.map((g) => g.items.map((i) => i.id)), [
    ['overdue'], ['tomorrow'], ['undated'], ['done'],
  ]);
});

test('groupTasks sorts within a bucket, starred first', () => {
  const groups = groupTasks([
    task('plain'),
    task('starred', { flagged: true }),
  ], NOW);

  const undated = groups.find((g) => g.key === 'undated');
  assert.deepStrictEqual(undated.items.map((i) => i.id), ['starred', 'plain']);
});

test('groupTasks on an empty list returns no groups', () => {
  assert.deepStrictEqual(groupTasks([], NOW), []);
});
