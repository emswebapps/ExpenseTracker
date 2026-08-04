// Unit tests for the to-do / work item due reminder selection logic.
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
const { _internal } = require('../index');
const { collectTodoMessages, collectTodoEmails, wallClockToMs } = _internal;

const EMAIL_ON = { notifPrefs: { email: { enabled: true } } };

const NOW = Date.UTC(2026, 6, 26, 18, 0, 0); // 2026-07-26 14:00 America/New_York
const MIN = 60 * 1000;

function build(items, extra = {}) {
  return {
    shoppingLists: [
      { id: 'L1', name: 'Errands', type: 'todo' },
      { id: 'L2', name: 'Old stuff', type: 'todo', archived: true },
      { id: 'L3', name: 'Groceries', type: 'grocery' },
      { id: 'L4', name: 'Shift prep', type: 'work' },
    ],
    shoppingItems: items,
    ...extra,
  };
}

const item = (over = {}) => ({ id: 'T1', listId: 'L1', name: 'Call plumber', status: 'pending', ...over });

test('due reminder fires at the due time', () => {
  const msgs = collectTodoMessages(build([item({ notifyEnabled: true, dueAt: NOW })]), {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].title, 'Due now: Call plumber');
  assert.strictEqual(msgs[0].body, 'Errands');
  assert.strictEqual(msgs[0].tag, `todo-due-T1-${NOW}`);
});

test('lead time fires early and names the due time', () => {
  const dueAt = NOW + 30 * MIN;
  const msgs = collectTodoMessages(
    build([item({ notifyEnabled: true, dueAt, remindOffsetMinutes: 30 })]), {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].title, 'Due soon: Call plumber');
  assert.match(msgs[0].body, /Errands — due at 2:30/);
});

test('does not fire before the reminder moment', () => {
  const dueAt = NOW + 31 * MIN;
  const msgs = collectTodoMessages(
    build([item({ notifyEnabled: true, dueAt, remindOffsetMinutes: 30 })]), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('does not fire for a due time long past the grace window', () => {
  const msgs = collectTodoMessages(
    build([item({ notifyEnabled: true, dueAt: NOW - 7 * 60 * MIN })]), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('already-sent keys are suppressed', () => {
  const data = build([item({ notifyEnabled: true, dueAt: NOW })]);
  const sent = { [`todo-due-T1-${NOW}`]: NOW - MIN };
  assert.deepStrictEqual(collectTodoMessages(data, sent, NOW), []);
});

test('changing the due date re-arms the reminder', () => {
  const oldDue = NOW - 10 * MIN;
  const sent = { [`todo-due-T1-${oldDue}`]: oldDue };
  const msgs = collectTodoMessages(build([item({ notifyEnabled: true, dueAt: NOW })]), sent, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].tag, `todo-due-T1-${NOW}`);
});

test('notifyEnabled off means no due reminder', () => {
  assert.deepStrictEqual(
    collectTodoMessages(build([item({ notifyEnabled: false, dueAt: NOW })]), {}, NOW), []);
});

test('completed and blocked tasks are skipped', () => {
  for (const status of ['done', 'blocked']) {
    const msgs = collectTodoMessages(
      build([item({ status, notifyEnabled: true, dueAt: NOW })]), {}, NOW);
    assert.deepStrictEqual(msgs, [], `status=${status}`);
  }
});

test('work list items get due reminders too', () => {
  const msgs = collectTodoMessages(
    build([item({ listId: 'L4', notifyEnabled: true, dueAt: NOW })]), {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].body, 'Shift prep');
});

test('archived lists and grocery lists are skipped', () => {
  const msgs = collectTodoMessages(build([
    item({ id: 'A', listId: 'L2', notifyEnabled: true, dueAt: NOW }),
    item({ id: 'B', listId: 'L3', notifyEnabled: true, dueAt: NOW }),
    item({ id: 'C', listId: 'nope', notifyEnabled: true, dueAt: NOW }),
  ]), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('prefs can disable due reminders entirely', () => {
  const items = [item({ notifyEnabled: true, dueAt: NOW })];
  assert.strictEqual(collectTodoMessages(build(items), {}, NOW).length, 1);
  assert.deepStrictEqual(
    collectTodoMessages(build(items, { notifPrefs: { todos: { enabled: false } } }), {}, NOW), []);
});

test('legacy items without dueAt resolve via the user time zone', () => {
  // 14:00 America/New_York on the same day == NOW
  const legacy = item({ notifyEnabled: true, dueDate: '2026-07-26', dueTime: '14:00' });
  const msgs = collectTodoMessages(build([legacy]), {}, NOW);
  assert.strictEqual(msgs.length, 1);

  // The same wall clock in Los Angeles is three hours later, so it hasn't fired.
  const laMsgs = collectTodoMessages(
    build([legacy], { settings: { timeZone: 'America/Los_Angeles' } }), {}, NOW);
  assert.deepStrictEqual(laMsgs, []);
});

test('a legacy item with no due time defaults to end of day', () => {
  const endOfDay = wallClockToMs('2026-07-26', null, 'America/New_York');
  assert.strictEqual(endOfDay, wallClockToMs('2026-07-26', '23:59', 'America/New_York'));
  const msgs = collectTodoMessages(
    build([item({ notifyEnabled: true, dueDate: '2026-07-26' })]), {}, NOW);
  assert.deepStrictEqual(msgs, []); // 23:59 hasn't arrived at 14:00
});

// ── collectTodoEmails: the "due in an hour, still not done" email ──

test('email fires an hour before the due moment', () => {
  const dueAt = NOW + 60 * MIN;
  const emails = collectTodoEmails(build([item({ dueAt })], EMAIL_ON), {}, NOW);
  assert.strictEqual(emails.length, 1);
  assert.match(emails[0].subject, /Due soon: Call plumber/);
  assert.strictEqual(emails[0].tag, `todo-email-1h-T1-${dueAt}`);
});

test('email does not fire more than an hour out', () => {
  const dueAt = NOW + 61 * MIN;
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], EMAIL_ON), {}, NOW), []);
});

test('email is suppressed when the email channel is off', () => {
  const dueAt = NOW + 60 * MIN;
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })]), {}, NOW), []);
});

test('email is not resent once its key is recorded', () => {
  const dueAt = NOW + 60 * MIN;
  const sent = { [`todo-email-1h-T1-${dueAt}`]: NOW - MIN };
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], EMAIL_ON), sent, NOW), []);
});

test('email skips completed and blocked tasks', () => {
  const dueAt = NOW + 60 * MIN;
  for (const status of ['done', 'blocked']) {
    assert.deepStrictEqual(
      collectTodoEmails(build([item({ status, dueAt })], EMAIL_ON), {}, NOW), [], `status=${status}`);
  }
});

test('email does not fire long after the window has passed', () => {
  const dueAt = NOW - 7 * 60 * MIN;
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], EMAIL_ON), {}, NOW), []);
});

test('work list items are emailed too', () => {
  const dueAt = NOW + 60 * MIN;
  const emails = collectTodoEmails(build([item({ listId: 'L4', dueAt })], EMAIL_ON), {}, NOW);
  assert.strictEqual(emails.length, 1);
  assert.match(emails[0].lines[0], /Shift prep/);
});
