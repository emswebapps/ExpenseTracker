// Unit tests for task ordering.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert';
import { test } from 'node:test';
import { sortTasks } from './taskSort.js';

const NOW = Date.UTC(2026, 7, 11, 18, 0, 0);
const HOUR = 60 * 60 * 1000;

const task = (id, o = {}) => ({
  id, name: id, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', ...o,
});

const order = (items) => sortTasks(items, NOW).map((i) => i.id);

test('overdue first, then dated, then undated', () => {
  const items = [
    task('undated'),
    task('later', { dueAt: NOW + 48 * HOUR }),
    task('overdue', { dueAt: NOW - HOUR }),
    task('soon', { dueAt: NOW + HOUR }),
  ];
  assert.deepStrictEqual(order(items), ['overdue', 'soon', 'later', 'undated']);
});

test('most overdue sorts above less overdue', () => {
  const items = [
    task('yesterday', { dueAt: NOW - 24 * HOUR }),
    task('lastWeek', { dueAt: NOW - 168 * HOUR }),
  ];
  assert.deepStrictEqual(order(items), ['lastWeek', 'yesterday']);
});

test('done sinks below everything unfinished', () => {
  const items = [
    task('done', { status: 'done', completedAt: '2026-08-11T00:00:00.000Z' }),
    task('undated'),
  ];
  assert.deepStrictEqual(order(items), ['undated', 'done']);
});

test('blocked keeps its place among unfinished tasks', () => {
  const items = [
    task('blockedUndated', { status: 'blocked' }),
    task('overdue', { dueAt: NOW - HOUR }),
  ];
  assert.deepStrictEqual(order(items), ['overdue', 'blockedUndated']);
});

test('a flag lifts a task within its bucket but never past an overdue one', () => {
  const items = [
    task('plainUndated'),
    task('flaggedUndated', { flagged: true }),
    task('overdue', { dueAt: NOW - HOUR }),
  ];
  assert.deepStrictEqual(order(items), ['overdue', 'flaggedUndated', 'plainUndated']);
});

test('flag orders two dated tasks only when neither is overdue', () => {
  const items = [
    task('early', { dueAt: NOW + HOUR }),
    task('lateFlagged', { dueAt: NOW + 5 * HOUR, flagged: true }),
  ];
  // Same bucket, so the flag wins over the sooner due time.
  assert.deepStrictEqual(order(items), ['lateFlagged', 'early']);
});

test('finished tasks read most-recently-completed first', () => {
  const items = [
    task('old', { status: 'done', completedAt: '2026-08-01T00:00:00.000Z' }),
    task('fresh', { status: 'done', completedAt: '2026-08-11T12:00:00.000Z' }),
  ];
  assert.deepStrictEqual(order(items), ['fresh', 'old']);
});

test('undated tasks fall back to creation order, oldest first', () => {
  const items = [
    task('newer', { createdAt: '2026-06-01T00:00:00.000Z' }),
    task('older', { createdAt: '2026-01-01T00:00:00.000Z' }),
  ];
  assert.deepStrictEqual(order(items), ['older', 'newer']);
});

test('a legacy task with dueDate but no dueAt still sorts by its deadline', () => {
  const items = [
    task('undated'),
    task('legacy', { dueDate: '2020-01-01', dueTime: '09:00' }),
  ];
  assert.deepStrictEqual(order(items), ['legacy', 'undated']);
});

test('sorting never mutates the array it was given', () => {
  const items = [task('b', { dueAt: NOW + HOUR }), task('a', { dueAt: NOW - HOUR })];
  const before = items.map((i) => i.id);
  sortTasks(items, NOW);
  assert.deepStrictEqual(items.map((i) => i.id), before);
});
