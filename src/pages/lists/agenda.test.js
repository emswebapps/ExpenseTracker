// Unit tests for the Today view's grouping.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert';
import { test } from 'node:test';
import { collectAgenda } from './agenda.js';
import { localTodayISO, isoInDays } from '../../utils/dueDates.js';

const TODAY = localTodayISO();
const TOMORROW = isoInDays(1);
const YESTERDAY = isoInDays(-1);

// "Now" has to sit inside today for the today/tomorrow buckets to mean
// anything, so anchor it at noon today rather than a fixed calendar date.
const NOW = new Date(`${TODAY}T12:00:00`).getTime();
const HOUR = 60 * 60 * 1000;

const LISTS = [
  { id: 'L1', name: 'Errands', type: 'todo' },
  { id: 'L2', name: 'Job', type: 'work' },
  { id: 'L3', name: 'Old', type: 'todo', archived: true },
  { id: 'L4', name: 'Groceries', type: 'grocery' },
];

const task = (id, o = {}) => ({
  id, name: id, listId: 'L1', status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z', ...o,
});

const ids = (group) => group.map((i) => i.id);

test('splits into overdue, today and tomorrow', () => {
  const { overdue, dueToday, dueTomorrow } = collectAgenda(LISTS, [
    task('late', { dueDate: YESTERDAY, dueAt: NOW - 24 * HOUR }),
    task('tonight', { dueDate: TODAY, dueAt: NOW + 6 * HOUR }),
    task('tmrw', { dueDate: TOMORROW, dueAt: NOW + 30 * HOUR }),
  ], NOW);
  assert.deepStrictEqual(ids(overdue), ['late']);
  assert.deepStrictEqual(ids(dueToday), ['tonight']);
  assert.deepStrictEqual(ids(dueTomorrow), ['tmrw']);
});

test('a task due earlier today counts as overdue, not today', () => {
  const { overdue, dueToday } = collectAgenda(LISTS, [
    task('thisMorning', { dueDate: TODAY, dueAt: NOW - 3 * HOUR }),
  ], NOW);
  assert.deepStrictEqual(ids(overdue), ['thisMorning']);
  assert.deepStrictEqual(ids(dueToday), []);
});

test('pulls tasks from every active task list, work included', () => {
  const { dueToday } = collectAgenda(LISTS, [
    task('errand', { dueDate: TODAY, dueAt: NOW + HOUR }),
    task('shift', { listId: 'L2', dueDate: TODAY, dueAt: NOW + 2 * HOUR }),
  ], NOW);
  assert.deepStrictEqual(ids(dueToday), ['errand', 'shift']);
});

test('ignores archived lists, grocery lists and unknown list ids', () => {
  const { overdue, dueToday, dueTomorrow } = collectAgenda(LISTS, [
    task('archived', { listId: 'L3', dueDate: TODAY, dueAt: NOW + HOUR }),
    task('grocery', { listId: 'L4', dueDate: TODAY, dueAt: NOW + HOUR }),
    task('orphan', { listId: 'nope', dueDate: TODAY, dueAt: NOW + HOUR }),
  ], NOW);
  assert.deepStrictEqual([...ids(overdue), ...ids(dueToday), ...ids(dueTomorrow)], []);
});

test('ignores done, blocked and undated tasks', () => {
  const { overdue, dueToday } = collectAgenda(LISTS, [
    task('done', { status: 'done', dueDate: YESTERDAY, dueAt: NOW - 24 * HOUR }),
    task('blocked', { status: 'blocked', dueDate: YESTERDAY, dueAt: NOW - 24 * HOUR }),
    task('undated'),
  ], NOW);
  assert.deepStrictEqual([...ids(overdue), ...ids(dueToday)], []);
});

test('groups come back sorted, most overdue first', () => {
  const { overdue } = collectAgenda(LISTS, [
    task('yesterday', { dueDate: YESTERDAY, dueAt: NOW - 20 * HOUR }),
    task('lastWeek', { dueDate: isoInDays(-7), dueAt: NOW - 168 * HOUR }),
  ], NOW);
  assert.deepStrictEqual(ids(overdue), ['lastWeek', 'yesterday']);
});

test('listById names the list each row came from', () => {
  const { listById } = collectAgenda(LISTS, [], NOW);
  assert.strictEqual(listById.get('L1').name, 'Errands');
  assert.strictEqual(listById.get('L2').name, 'Job');
  assert.strictEqual(listById.has('L3'), false);
});

test('a task dated further out appears in no group', () => {
  const { overdue, dueToday, dueTomorrow } = collectAgenda(LISTS, [
    task('nextWeek', { dueDate: isoInDays(7), dueAt: NOW + 168 * HOUR }),
  ], NOW);
  assert.deepStrictEqual([...ids(overdue), ...ids(dueToday), ...ids(dueTomorrow)], []);
});
