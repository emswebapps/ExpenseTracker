import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  sectionsOf, hasSections, plannerSort, splitBySection,
  defaultSectionIndex, nextSectionOrder, splitByAge,
} from './sections.js';

const at = (iso) => new Date(iso).getTime();
const item = (over = {}) => ({
  id: 'i', listId: 'l1', name: 'task', status: 'pending',
  dueDate: null, dueAt: null, sectionId: null, createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

test('sections come back in their configured order', () => {
  const list = {
    sections: [
      { id: 'b', name: 'Second', order: 2 },
      { id: 'a', name: 'First', order: 1 },
    ],
  };
  assert.deepEqual(sectionsOf(list).map((s) => s.id), ['a', 'b']);
  assert.equal(hasSections(list), true);
  assert.equal(hasSections({}), false);
  assert.equal(hasSections({ sections: [] }), false);
});

test('planner order is by date, not by urgency', () => {
  const rows = [
    item({ id: 'wed', dueDate: '2026-09-09', dueAt: at('2026-09-09T23:59') }),
    item({ id: 'mon', dueDate: '2026-09-07', dueAt: at('2026-09-07T23:59') }),
    item({ id: 'undated' }),
    item({ id: 'tue', dueDate: '2026-09-08', dueAt: at('2026-09-08T23:59') }),
  ];
  assert.deepEqual(plannerSort(rows).map((i) => i.id), ['mon', 'tue', 'wed', 'undated']);
});

test('finished rows sink within their section', () => {
  const rows = [
    item({ id: 'mon-done', status: 'done', dueDate: '2026-09-07', dueAt: at('2026-09-07T09:00') }),
    item({ id: 'tue', dueDate: '2026-09-08', dueAt: at('2026-09-08T09:00') }),
  ];
  assert.deepEqual(plannerSort(rows).map((i) => i.id), ['tue', 'mon-done']);
});

test('splitBySection puts unfiled rows first and keeps orphans visible', () => {
  const list = {
    sections: [
      { id: 'wk1', name: 'Week 1', order: 1 },
      { id: 'wk2', name: 'Week 2', order: 2 },
    ],
  };
  const roots = [
    item({ id: 'a', sectionId: 'wk1', dueDate: '2026-09-07', dueAt: at('2026-09-07T09:00') }),
    item({ id: 'b', sectionId: 'wk2' }),
    item({ id: 'loose' }),
    item({ id: 'orphan', sectionId: 'deleted-week' }),
  ];

  const groups = splitBySection(list, roots);
  assert.deepEqual(groups.map((g) => g.section?.id ?? null), [null, 'wk1', 'wk2']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['loose', 'orphan']);
  assert.deepEqual(groups[1].items.map((i) => i.id), ['a']);
});

test('the unfiled group is omitted when everything is filed', () => {
  const list = { sections: [{ id: 'wk1', name: 'Week 1', order: 1 }] };
  const groups = splitBySection(list, [item({ id: 'a', sectionId: 'wk1' })]);
  assert.deepEqual(groups.map((g) => g.section.id), ['wk1']);
});

test('the column that opens is the one with the nearest work', () => {
  const now = at('2026-09-09T12:00');
  const groups = [
    { section: { id: 'last' }, items: [item({ dueAt: at('2026-09-02T09:00') })] },
    { section: { id: 'this' }, items: [item({ dueAt: at('2026-09-10T09:00') })] },
    { section: { id: 'next' }, items: [item({ dueAt: at('2026-09-17T09:00') })] },
  ];
  assert.equal(defaultSectionIndex(groups, now), 1);

  // A week already under way beats the finished one before it, even when its
  // remaining work is behind schedule.
  const started = [
    { section: { id: 'last' }, items: [item({ dueAt: at('2026-09-01T09:00') })] },
    { section: { id: 'this' }, items: [item({ dueAt: at('2026-09-08T09:00') })] },
  ];
  assert.equal(defaultSectionIndex(started, now), 1);

  // Nothing dated anywhere — open on the first column rather than guessing.
  assert.equal(defaultSectionIndex([{ section: { id: 'a' }, items: [item()] }], now), 0);
  assert.equal(defaultSectionIndex([], now), 0);
});

test('the unfiled inbox is never the landing column while sections exist', () => {
  const now = at('2026-09-09T12:00');
  const groups = [
    // Nearest work of all, but it's the inbox.
    { section: null, items: [item({ dueAt: at('2026-09-09T13:00') })] },
    { section: { id: 'this' }, items: [item({ dueAt: at('2026-09-11T09:00') })] },
  ];
  assert.equal(defaultSectionIndex(groups, now), 1);

  // With nothing dated anywhere, it still opens on a real section.
  assert.equal(defaultSectionIndex([
    { section: null, items: [item()] },
    { section: { id: 'this' }, items: [item()] },
  ], now), 1);

  // The inbox alone is all there is, so that's what opens.
  assert.equal(defaultSectionIndex([{ section: null, items: [item()] }], now), 0);
});

test('finished work never decides which column opens', () => {
  const now = at('2026-09-09T12:00');
  const groups = [
    { section: { id: 'done-week' }, items: [item({ status: 'done', dueAt: at('2026-09-09T13:00') })] },
    { section: { id: 'live' }, items: [item({ dueAt: at('2026-09-11T09:00') })] },
  ];
  assert.equal(defaultSectionIndex(groups, now), 1);
});

test('nextSectionOrder appends past whatever is there', () => {
  assert.equal(nextSectionOrder({}), 0);
  assert.equal(nextSectionOrder({ sections: [{ order: 3 }, { order: 7 }] }), 8);
});

// ── Folding away weeks that have gone by ────────────────────────────────────

test('sections older than the window fold away, newer ones stay', () => {
  const now = new Date('2026-09-09T12:00:00');
  const groups = [
    { section: { id: 'a', endDate: '2026-08-16' }, items: [] }, // 24 days back
    { section: { id: 'b', endDate: '2026-08-30' }, items: [] }, // 10 days back
    { section: { id: 'c', endDate: '2026-09-06' }, items: [] },
    { section: { id: 'd', endDate: '2026-09-13' }, items: [] }, // this week
  ];
  const { current, earlier } = splitByAge(groups, now);
  assert.deepEqual(earlier.map((g) => g.section.id), ['a']);
  assert.deepEqual(current.map((g) => g.section.id), ['b', 'c', 'd']);
});

test('the unfiled inbox and hand-made sections never age out', () => {
  const now = new Date('2026-09-09T12:00:00');
  const groups = [
    { section: null, items: [] },
    { section: { id: 'named', name: 'Someday' }, items: [] }, // no endDate
    { section: { id: 'old', endDate: '2026-01-04' }, items: [] },
  ];
  const { current, earlier } = splitByAge(groups, now);
  assert.deepEqual(current.map((g) => g.section?.id ?? null), [null, 'named']);
  assert.deepEqual(earlier.map((g) => g.section.id), ['old']);
});

test('a list of nothing but old weeks still shows them', () => {
  const now = new Date('2026-09-09T12:00:00');
  const groups = [
    { section: { id: 'old1', endDate: '2026-01-04' }, items: [] },
    { section: { id: 'old2', endDate: '2026-01-11' }, items: [] },
  ];
  const { current, earlier } = splitByAge(groups, now);
  assert.deepEqual(current.map((g) => g.section.id), ['old1', 'old2']);
  assert.deepEqual(earlier, []);
});
