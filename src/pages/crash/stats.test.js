import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, historySentence, pruneSessions, compactSession, FULL_SESSION_CAP } from './stats.js';

const session = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_100_000,
  intensity: 8,
  intensityAfter: 3,
  outcome: 'let-it-go',
  facts: [{ id: 'f', text: 'he walked into the other room' }],
  ...over,
});

test('an empty history does not divide by zero', () => {
  const s = summarize([], []);
  assert.equal(s.total, 0);
  assert.equal(s.avgBefore, null);
  assert.equal(s.avgAfter, null);
  assert.equal(s.avgDrop, null);
  assert.equal(historySentence(s), null);
});

test('undefined inputs are treated as empty', () => {
  const s = summarize(undefined, undefined);
  assert.equal(s.total, 0);
  assert.equal(historySentence(s), null);
});

test('intensity before and after average correctly', () => {
  const s = summarize([session({ intensity: 8, intensityAfter: 4 }), session({ intensity: 7, intensityAfter: 2 })]);
  assert.equal(s.avgBefore, 7.5);
  assert.equal(s.avgAfter, 3);
  assert.equal(s.avgDrop, 4.5);
});

test('a session missing the second rating does not drag the drop down', () => {
  const s = summarize([session({ intensity: 8, intensityAfter: 4 }), session({ intensity: 9, intensityAfter: null })]);
  assert.equal(s.avgDrop, 4);
  assert.equal(s.avgBefore, 8.5);
});

test('settled counts both let-go sessions and dropped drafts', () => {
  const s = summarize(
    [session({ outcome: 'let-it-go' }), session({ outcome: 'still-matters' })],
    [{ id: 'd1', status: 'dropped' }, { id: 'd2', status: 'sent' }, { id: 'd3', status: 'held' }],
  );
  assert.equal(s.letGoCount, 1);
  assert.equal(s.draftsDropped, 1);
  assert.equal(s.settledCount, 2);
  // held drafts aren't resolved yet, so they aren't part of the denominator
  assert.equal(s.settledOf, 4);
});

test('the history sentence reads as plain language', () => {
  const s = summarize([session()], []);
  const line = historySentence(s);
  assert.ok(line.includes('once'));
  assert.ok(line.includes('8'));
  assert.ok(line.includes('3'));
});

test('pruning keeps the newest sessions whole and compacts the rest', () => {
  const many = Array.from({ length: FULL_SESSION_CAP + 5 }, (_, i) =>
    session({ id: `s${i}`, startedAt: 1_700_000_000_000 + i * 1000 }),
  );
  const pruned = pruneSessions(many);
  assert.equal(pruned.length, FULL_SESSION_CAP + 5);
  // newest first
  assert.equal(pruned[0].id, `s${FULL_SESSION_CAP + 4}`);
  assert.ok(pruned[0].facts, 'newest session should keep its detail');
  assert.equal(pruned[FULL_SESSION_CAP].compact, true);
  assert.equal(pruned[FULL_SESSION_CAP].facts, undefined);
});

test('compacted sessions keep the fields the history screen reads', () => {
  const c = compactSession(session({ id: 'x' }));
  assert.deepEqual(Object.keys(c).sort(), ['compact', 'id', 'intensity', 'intensityAfter', 'outcome', 'startedAt']);
  assert.equal(c.intensity, 8);
  assert.equal(c.outcome, 'let-it-go');
});

test('pruning is stable — compacting twice does not lose the archive', () => {
  const many = Array.from({ length: FULL_SESSION_CAP + 3 }, (_, i) =>
    session({ id: `s${i}`, startedAt: 1_700_000_000_000 + i * 1000 }),
  );
  const once = pruneSessions(many);
  const twice = pruneSessions(once);
  assert.equal(twice.length, once.length);
  assert.equal(summarize(twice).total, summarize(once).total);
});

test('the session you are currently inside is never compacted', () => {
  const many = Array.from({ length: FULL_SESSION_CAP + 5 }, (_, i) =>
    session({ id: `s${i}`, startedAt: 1_700_000_000_000 + i * 1000 }),
  );
  // An open session, deliberately the oldest so it sorts last of all.
  many.push(session({ id: 'live', startedAt: 1, endedAt: null }));
  const pruned = pruneSessions(many);
  const live = pruned.find((s) => s.id === 'live');
  assert.equal(live.compact, undefined);
  assert.ok(live.facts, 'the live session must keep its facts column');
});
