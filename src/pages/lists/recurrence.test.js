// Unit tests for repeating tasks.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert';
import { test } from 'node:test';
import { nextOccurrence, buildNextOccurrence, repeatLabel } from './recurrence.js';

const at = (iso) => new Date(iso).getTime();
const NOW = at('2026-08-12T09:00:00');

const task = (o = {}) => ({
  id: 'T1', listId: 'L1', name: 'Take out trash', status: 'pending',
  dueDate: '2026-08-12', dueTime: '19:00', repeat: { freq: 'weekly', interval: 1 }, ...o,
});

test('a task with no repeat has no next occurrence', () => {
  assert.strictEqual(nextOccurrence(task({ repeat: null }), NOW), null);
  assert.strictEqual(nextOccurrence(task({ repeat: { freq: null } }), NOW), null);
});

test('a repeat with no due date has nothing to step from', () => {
  assert.strictEqual(nextOccurrence(task({ dueDate: null }), NOW), null);
});

test('daily, weekly and monthly steps', () => {
  assert.strictEqual(nextOccurrence(task({ repeat: { freq: 'daily', interval: 1 } }), NOW), '2026-08-13');
  assert.strictEqual(nextOccurrence(task(), NOW), '2026-08-19');
  assert.strictEqual(nextOccurrence(task({ repeat: { freq: 'monthly', interval: 1 } }), NOW), '2026-09-12');
});

test('intervals greater than one', () => {
  assert.strictEqual(nextOccurrence(task({ repeat: { freq: 'weekly', interval: 2 } }), NOW), '2026-08-26');
  assert.strictEqual(nextOccurrence(task({ repeat: { freq: 'daily', interval: 10 } }), NOW), '2026-08-22');
});

test('a long-ignored chore yields one upcoming date, not a backlog', () => {
  // Due in early July, weekly, finally dealt with on 12 Aug at 9am. The steps
  // land on 15 Jul, 22 Jul, 29 Jul, 5 Aug, 12 Aug — and stop there, because
  // 7pm today is still ahead of us.
  assert.strictEqual(nextOccurrence(task({ dueDate: '2026-07-08' }), NOW), '2026-08-12');
});

test('rolling forward skips today once its due time has passed', () => {
  // Same chore, ticked off at 11pm: today's 7pm slot is gone, so the next one
  // is a week out.
  const tonight = at('2026-08-12T23:00:00');
  assert.strictEqual(nextOccurrence(task({ dueDate: '2026-07-08' }), tonight), '2026-08-19');
});

test('monthly clamps rather than overflowing a short month', () => {
  const next = nextOccurrence(
    task({ dueDate: '2026-01-31', repeat: { freq: 'monthly', interval: 1 } }),
    at('2026-01-31T20:00:00'),
  );
  assert.strictEqual(next, '2026-02-28');
});

test('an undated time still steps by the calendar day', () => {
  const next = nextOccurrence(task({ dueTime: null, repeat: { freq: 'daily', interval: 1 } }), NOW);
  assert.strictEqual(next, '2026-08-13');
});

test('the follow-up carries the details but not the receipts', () => {
  const source = task({
    notes: 'blue bin', address: '10 Main St', flagged: true,
    notifyEnabled: true, remindOffsetMinutes: 30,
    attachments: [{ id: 'A1', name: 'photo.png' }],
    completedAt: '2026-08-12T19:05:00.000Z',
    spawnedNextId: 'ignored',
  });
  const next = buildNextOccurrence(source, 'NEW', NOW);

  assert.strictEqual(next.id, 'NEW');
  assert.strictEqual(next.name, 'Take out trash');
  assert.strictEqual(next.notes, 'blue bin');
  assert.strictEqual(next.address, '10 Main St');
  assert.strictEqual(next.flagged, true);
  assert.strictEqual(next.notifyEnabled, true);
  assert.strictEqual(next.remindOffsetMinutes, 30);
  assert.strictEqual(next.dueDate, '2026-08-19');
  assert.strictEqual(next.dueTime, '19:00');
  assert.deepStrictEqual(next.repeat, { freq: 'weekly', interval: 1 });

  // A fresh occurrence, not a copy of a finished one.
  assert.deepStrictEqual(next.attachments, []);
  assert.strictEqual(next.status, 'pending');
  assert.strictEqual(next.completedAt, null);
  assert.strictEqual('spawnedNextId' in next, false);
});

test('no follow-up is built for a non-repeating task', () => {
  assert.strictEqual(buildNextOccurrence(task({ repeat: null }), 'NEW', NOW), null);
});

test('labels read naturally for both single and multiple intervals', () => {
  assert.strictEqual(repeatLabel({ freq: 'weekly', interval: 1 }), 'Repeats weekly');
  assert.strictEqual(repeatLabel({ freq: 'daily', interval: 3 }), 'Repeats every 3 days');
  assert.strictEqual(repeatLabel({ freq: 'monthly', interval: 2 }), 'Repeats every 2 months');
  assert.strictEqual(repeatLabel(null), null);
  assert.strictEqual(repeatLabel({ freq: null }), null);
});
