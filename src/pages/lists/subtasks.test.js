import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isHeading, indexChildren, topLevelItems, descendantIds,
  subtaskStats, openChildren, earliestChildDue,
} from './subtasks.js';
import { groupTasks, bucketOf } from './taskGroups.js';

const task = (over = {}) => ({
  id: 'x', listId: 'l1', name: 'task', status: 'pending',
  dueDate: null, dueTime: null, dueAt: null, createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

// A fixed "now" so the calendar buckets don't move under the tests.
const NOW = new Date('2026-09-07T09:00:00').getTime();
const at = (dateISO, timeStr) => new Date(`${dateISO}T${timeStr}`).getTime();

test('items without a parent are top level', () => {
  const items = [task({ id: 'a' }), task({ id: 'b' })];
  assert.deepEqual(topLevelItems(items).map((i) => i.id), ['a', 'b']);
  assert.equal(indexChildren(items).size, 0);
});

test('children are indexed under their parent and sorted', () => {
  const items = [
    task({ id: 'p' }),
    task({ id: 'c-late', parentId: 'p', dueDate: '2026-09-10', dueAt: at('2026-09-10', '09:00') }),
    task({ id: 'c-soon', parentId: 'p', dueDate: '2026-09-08', dueAt: at('2026-09-08', '09:00') }),
  ];
  assert.deepEqual(topLevelItems(items).map((i) => i.id), ['p']);
  assert.deepEqual(
    indexChildren(items, NOW).get('p').map((i) => i.id),
    ['c-soon', 'c-late'],
  );
});

test('a child whose parent is gone is promoted rather than hidden', () => {
  const items = [task({ id: 'orphan', parentId: 'deleted-parent' })];
  assert.deepEqual(topLevelItems(items).map((i) => i.id), ['orphan']);
});

test('descendantIds walks the whole subtree and survives a cycle', () => {
  const items = [
    task({ id: 'p' }),
    task({ id: 'c1', parentId: 'p' }),
    task({ id: 'c2', parentId: 'p' }),
    task({ id: 'g1', parentId: 'c1' }),
    task({ id: 'elsewhere' }),
  ];
  assert.deepEqual([...descendantIds(items, 'p')].sort(), ['c1', 'c2', 'g1']);
  assert.deepEqual([...descendantIds(items, 'c1')], ['g1']);
  assert.deepEqual([...descendantIds(items, 'elsewhere')], []);

  const cyclic = [task({ id: 'a', parentId: 'b' }), task({ id: 'b', parentId: 'a' })];
  assert.deepEqual([...descendantIds(cyclic, 'a')].sort(), ['a', 'b']);
});

test('progress counts skip headings', () => {
  const children = [
    task({ id: 'c1', status: 'done' }),
    task({ id: 'c2' }),
    task({ id: 'h', header: true }),
  ];
  assert.deepEqual(subtaskStats(children), { done: 1, total: 2 });
  assert.deepEqual(openChildren(children).map((i) => i.id), ['c2', 'h']);
  assert.equal(isHeading(children[2]), true);
  assert.equal(isHeading(children[0]), false);
});

test('earliestChildDue takes the soonest open child, ignoring finished ones', () => {
  const children = [
    task({ id: 'done-first', status: 'done', dueDate: '2026-09-07', dueAt: at('2026-09-07', '06:00') }),
    task({ id: 'open-late', dueDate: '2026-09-12', dueAt: at('2026-09-12', '08:00') }),
    task({ id: 'open-soon', dueDate: '2026-09-09', dueAt: at('2026-09-09', '08:00') }),
    task({ id: 'undated' }),
  ];
  assert.equal(earliestChildDue(children), at('2026-09-09', '08:00'));
  assert.equal(earliestChildDue([task({ id: 'u' })]), null);
  assert.equal(earliestChildDue([]), null);
});

test('an undated parent is bucketed by its soonest open subtask', () => {
  const parent = task({ id: 'p' });
  // On its own it has no date at all.
  assert.equal(bucketOf(parent, NOW), 'undated');
  // Inheriting today's later slot puts it under Today…
  assert.equal(bucketOf(parent, NOW, at('2026-09-07', '17:00')), 'today');
  // …tomorrow's under Tomorrow, and a passed one under Overdue.
  assert.equal(bucketOf(parent, NOW, at('2026-09-08', '09:00')), 'tomorrow');
  assert.equal(bucketOf(parent, NOW, at('2026-09-07', '06:00')), 'overdue');
});

test('a parent with its own date ignores what its children say', () => {
  const parent = task({ id: 'p', dueDate: '2026-09-20', dueAt: at('2026-09-20', '09:00') });
  assert.equal(bucketOf(parent, NOW, at('2026-09-07', '10:00')), 'later');
});

test('groupTasks buckets only the rows it is given, inheriting child dates', () => {
  const items = [
    task({ id: 'monday', header: true, dueDate: '2026-09-07', dueAt: at('2026-09-07', '23:59') }),
    task({ id: 'class', parentId: 'monday', dueDate: '2026-09-07', dueAt: at('2026-09-07', '08:00') }),
    task({ id: 'loose-parent' }),
    task({ id: 'loose-child', parentId: 'loose-parent', dueDate: '2026-09-08', dueAt: at('2026-09-08', '08:00') }),
  ];
  const roots = topLevelItems(items);
  const children = indexChildren(items, NOW);
  const groups = groupTasks(roots, NOW, children);

  const keys = groups.map((g) => g.key);
  assert.deepEqual(keys, ['today', 'tomorrow']);
  // The subtasks are not bucketed themselves — they render under their parent.
  assert.deepEqual(groups[0].items.map((i) => i.id), ['monday']);
  assert.deepEqual(groups[1].items.map((i) => i.id), ['loose-parent']);
});
