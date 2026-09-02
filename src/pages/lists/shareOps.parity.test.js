// The contract that keeps a guest's screen agreeing with what actually got
// saved.
//
// A guest's edit is applied twice: here, immediately, so a ticked box ticks
// under their finger, and again on the server by `functions/listOps.js`, which
// is the half that decides what's allowed. If the two disagree, the guest sees
// a change appear and then quietly undo itself a second later — the worst shape
// this bug can take, because they walk away believing the task is on the list.
//
// The maths exists twice because the client is an ESM Vite bundle and the
// function is a CommonJS deployment that only ships its own directory; neither
// can import the other. So rather than a comment asking the next person to keep
// them in step, every op is run through both and the results compared.
//
// If this goes red: decide which side is right, then change *both*. Relaxing
// the assertion is how a guest ends up lied to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { applyOp as clientApply } from './shareOps.js';

const require = createRequire(import.meta.url);
const { applyOp: serverApply } = require('../../../functions/listOps.js');

const NOW = Date.UTC(2026, 8, 7, 14, 0, 0);
const wallClockToMs = (date, time) => Date.parse(`${date}T${time || '23:59'}:00Z`);

const item = (over = {}) => ({
  id: 'T1', listId: 'L1', name: 'Existing', status: 'pending', notes: null,
  parentId: null, sectionId: null, dueDate: null, dueTime: null,
  completedAt: null, header: false, ...over,
});

// The fields a guest can actually see on their screen. `dueAt`, `createdAt` and
// `addedBy` are deliberately excluded: the server stamps those and the mirror
// carries them back, so they can't be compared before the round trip.
const VISIBLE = ['id', 'name', 'status', 'notes', 'dueDate', 'dueTime', 'parentId', 'sectionId', 'header'];
const visible = (items) => items.map((i) => Object.fromEntries(
  VISIBLE.map((key) => [key, i[key] ?? null]),
));

/** Run one op through both implementations and assert they landed together. */
function bothAgree(items, op, label) {
  const server = serverApply(items, op, {
    listId: 'L1', tz: 'UTC', wallClockToMs, now: NOW,
    sectionIds: ['S1'],
  });
  const client = clientApply(items, { ...op, at: NOW }, 'L1');

  if (server === null) {
    // The server refused. The client must have left the list exactly as it was,
    // or the guest is looking at a change that isn't going to survive.
    assert.deepEqual(visible(client), visible(items), `${label}: server refused but client changed the list`);
    return { refused: true };
  }

  assert.deepEqual(visible(client), visible(server.items), `${label}: client and server disagree`);
  return { refused: false, server, client };
}

const base = [
  item({ id: 'H1', name: '📅 MONDAY 📅', header: true, dueDate: '2026-09-07', sectionId: 'S1' }),
  item({ id: 'T1', name: 'EMS class', parentId: 'H1', sectionId: 'S1', dueDate: '2026-09-07', dueTime: '08:00' }),
  item({ id: 'T2', name: 'Return gear', sectionId: 'S1' }),
  item({ id: 'T3', name: 'Old thing', status: 'done', completedAt: '2026-09-01T00:00:00.000Z' }),
  item({ id: 'X1', listId: 'L2', name: "Another list's task" }),
];

test('adding a task lands the same on both sides', () => {
  const { refused, server } = bothAgree(base, {
    type: 'add', itemId: 'new1', fields: { name: 'Milk', notes: 'skim' }, by: 'Chris',
  }, 'add');
  assert.equal(refused, false);
  assert.equal(server.items.at(-1).name, 'Milk');
});

test('adding under a heading lands the same on both sides', () => {
  bothAgree(base, {
    type: 'add', itemId: 'new1',
    fields: { name: 'Bring folder', parentId: 'H1', sectionId: 'S1', dueDate: '2026-09-07' },
  }, 'add under heading');
});

test('an add with no usable name is refused on both sides', () => {
  assert.equal(bothAgree(base, { type: 'add', itemId: 'new1', fields: { name: '  ' } }, 'blank name').refused, true);
  assert.equal(bothAgree(base, { type: 'add', itemId: 'new1', fields: {} }, 'no name').refused, true);
});

test('an add reusing an existing id is refused on both sides', () => {
  assert.equal(bothAgree(base, { type: 'add', itemId: 'T1', fields: { name: 'Dupe' } }, 'dupe id').refused, true);
});

test('renaming, re-dating and clearing notes land the same on both sides', () => {
  bothAgree(base, { type: 'update', itemId: 'T1', fields: { name: 'EMS Instructor Class' } }, 'rename');
  bothAgree(base, { type: 'update', itemId: 'T1', fields: { dueDate: '2026-09-12', dueTime: '09:30' } }, 're-date');
  bothAgree(base, { type: 'update', itemId: 'T1', fields: { notes: null } }, 'clear notes');
  bothAgree(base, { type: 'update', itemId: 'T2', fields: { name: 'Return the gear', notes: 'to the station' } }, 'rename+notes');
});

test('an update that would only re-parent is refused on both sides', () => {
  assert.equal(bothAgree(base, { type: 'update', itemId: 'T2', fields: { parentId: 'H1' } }, 're-parent').refused, true);
});

test('an update to a missing task or another list is refused on both sides', () => {
  assert.equal(bothAgree(base, { type: 'update', itemId: 'ghost', fields: { name: 'x' } }, 'missing').refused, true);
  assert.equal(bothAgree(base, { type: 'update', itemId: 'X1', fields: { name: 'x' } }, 'other list').refused, true);
});

test('ticking off and re-opening land the same on both sides', () => {
  const off = bothAgree(base, { type: 'toggle', itemId: 'T1' }, 'complete');
  assert.equal(off.server.items.find((i) => i.id === 'T1').status, 'done');
  const on = bothAgree(base, { type: 'toggle', itemId: 'T3' }, 'reopen');
  assert.equal(on.server.items.find((i) => i.id === 'T3').status, 'pending');
  assert.equal(on.server.items.find((i) => i.id === 'T3').completedAt, null);
});

test('deleting a parent takes the same subtasks on both sides', () => {
  const { server } = bothAgree(base, { type: 'delete', itemId: 'H1' }, 'delete heading');
  // H1 is a heading, so this is refused — see the next assertion for a real one.
  assert.equal(server, undefined);

  const withParent = [
    item({ id: 'P1', name: 'Parent' }),
    item({ id: 'C1', parentId: 'P1' }),
    item({ id: 'C2', parentId: 'P1' }),
    item({ id: 'G1', parentId: 'C1' }),
    item({ id: 'keep' }),
  ];
  const res = bothAgree(withParent, { type: 'delete', itemId: 'P1' }, 'delete subtree');
  assert.deepEqual(res.server.items.map((i) => i.id), ['keep']);
});

test('a day heading is untouchable on both sides', () => {
  for (const op of [
    { type: 'update', itemId: 'H1', fields: { name: 'FUNDAY' } },
    { type: 'update', itemId: 'H1', fields: { dueDate: '2026-09-08' } },
    { type: 'toggle', itemId: 'H1' },
    { type: 'delete', itemId: 'H1' },
  ]) {
    assert.equal(bothAgree(base, op, `heading ${op.type}`).refused, true);
  }
});

test('a nonsense op changes nothing on either side', () => {
  for (const op of [
    { type: 'nuke', itemId: 'T1' },
    { type: 'add' },
    { type: 'toggle', itemId: 'ghost' },
    { type: 'delete', itemId: 'ghost' },
  ]) {
    assert.equal(bothAgree(base, op, `nonsense ${op.type}`).refused, true);
  }
});

test('over-long text is trimmed identically on both sides', () => {
  bothAgree(base, {
    type: 'add', itemId: 'new1',
    fields: { name: 'x'.repeat(500), notes: 'y'.repeat(4000) },
  }, 'long text');
});
