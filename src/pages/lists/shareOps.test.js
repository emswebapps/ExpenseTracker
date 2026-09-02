import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOp, applyOps, cleanFields, opSettled, pruneOverlay, OVERLAY_TTL_MS,
} from './shareOps.js';

const NOW = Date.UTC(2026, 8, 7, 14, 0, 0);
const item = (over = {}) => ({
  id: 'T1', listId: 'L1', name: 'Existing', status: 'pending', notes: null,
  parentId: null, sectionId: null, dueDate: null, dueTime: null, completedAt: null, ...over,
});

test('an added task shows up straight away', () => {
  const next = applyOp([], { type: 'add', itemId: 'n1', fields: { name: 'Milk' }, at: NOW, by: 'Chris' }, 'L1');
  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'Milk');
  assert.equal(next[0].listId, 'L1');
  assert.equal(next[0].addedBy, 'Chris');
  assert.equal(next[0].notifyEnabled, false);
});

test('ops apply in order', () => {
  const next = applyOps([], [
    { type: 'add', itemId: 'n1', fields: { name: 'Milk' }, at: NOW },
    { type: 'update', itemId: 'n1', fields: { name: 'Oat milk' }, at: NOW },
    { type: 'toggle', itemId: 'n1', at: NOW },
  ], 'L1');
  assert.equal(next[0].name, 'Oat milk');
  assert.equal(next[0].status, 'done');
});

test('cleanFields keeps only what a guest may set', () => {
  assert.deepEqual(
    cleanFields({ name: ' Milk ', notes: '', flagged: true, notifyEnabled: true }),
    { name: 'Milk', notes: null },
  );
});

// ── Settling the overlay against the mirror ─────────────────────────────────

test('an add settles once the mirror has the task', () => {
  const op = { type: 'add', itemId: 'n1', fields: { name: 'Milk' }, at: NOW };
  assert.equal(opSettled(op, []), false);
  assert.equal(opSettled(op, [item({ id: 'n1', name: 'Milk' })]), true);
});

test('a delete settles once the mirror has lost the task', () => {
  const op = { type: 'delete', itemId: 'T1', at: NOW };
  assert.equal(opSettled(op, [item({ id: 'T1' })]), false);
  assert.equal(opSettled(op, []), true);
});

test('a toggle settles on the state it moved to, not on a clock', () => {
  // Ticking off something that was open.
  const off = { type: 'toggle', itemId: 'T1', wasDone: false, at: NOW };
  assert.equal(opSettled(off, [item({ status: 'pending' })]), false);
  assert.equal(opSettled(off, [item({ status: 'done' })]), true);

  // Re-opening something that was done.
  const on = { type: 'toggle', itemId: 'T1', wasDone: true, at: NOW };
  assert.equal(opSettled(on, [item({ status: 'done' })]), false);
  assert.equal(opSettled(on, [item({ status: 'pending' })]), true);
});

test('a toggle whose task has vanished is settled rather than stuck', () => {
  assert.equal(opSettled({ type: 'toggle', itemId: 'gone', wasDone: false, at: NOW }, []), true);
});

test('an update settles once every field it set is in the mirror', () => {
  const op = { type: 'update', itemId: 'T1', fields: { name: 'New', notes: 'x' }, at: NOW };
  assert.equal(opSettled(op, [item({ name: 'Old', notes: null })]), false);
  assert.equal(opSettled(op, [item({ name: 'New', notes: null })]), false);
  assert.equal(opSettled(op, [item({ name: 'New', notes: 'x' })]), true);
});

test('an update clearing a field settles when the mirror shows it cleared', () => {
  const op = { type: 'update', itemId: 'T1', fields: { notes: null }, at: NOW };
  assert.equal(opSettled(op, [item({ notes: 'still here' })]), false);
  assert.equal(opSettled(op, [item({ notes: null })]), true);
});

test('a clock running fast cannot strand an overlay entry', () => {
  // The op is stamped in the future relative to the server; settling looks at
  // content, so it makes no difference.
  const op = { type: 'toggle', itemId: 'T1', wasDone: false, at: NOW + 10 * 60 * 1000 };
  assert.equal(opSettled(op, [item({ status: 'done' })]), true);
});

test('pruneOverlay keeps unsettled entries and drops stale ones', () => {
  const fresh = { type: 'add', itemId: 'n1', fields: { name: 'Milk' }, at: NOW };
  const settled = { type: 'add', itemId: 'T1', fields: { name: 'Existing' }, at: NOW };
  const stale = { type: 'add', itemId: 'n2', fields: { name: 'Refused' }, at: NOW - OVERLAY_TTL_MS - 1 };

  const kept = pruneOverlay([fresh, settled, stale], [item({ id: 'T1' })], NOW);
  assert.deepEqual(kept.map((o) => o.itemId), ['n1']);
});
