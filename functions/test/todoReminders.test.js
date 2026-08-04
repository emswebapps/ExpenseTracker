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
  assert.strictEqual(emails[0].tag, `todo-email-T1-${dueAt}-60`);
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
  const sent = { [`todo-email-T1-${dueAt}-60`]: NOW - MIN };
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

// ── Task email lead time ──

test('task email lead time is configurable', () => {
  const prefs = (taskLeadMinutes) => ({ notifPrefs: { email: { enabled: true, taskLeadMinutes } } });
  const dueAt = NOW + 90 * MIN;

  // An hour's lead means the email is still half an hour away...
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], EMAIL_ON), {}, NOW), []);
  // ...while two hours' lead is already past due and fires now.
  const at2h = collectTodoEmails(build([item({ dueAt })], prefs(120)), {}, NOW);
  assert.strictEqual(at2h.length, 1);
  assert.match(at2h[0].title, /due in about 2 hours/);
  assert.strictEqual(at2h[0].tag, `todo-email-T1-${dueAt}-120`);

  // A short lead holds off until the task is nearly due.
  const soon = NOW + 15 * MIN;
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt: soon })], prefs(5)), {}, NOW), []);
  const at15 = collectTodoEmails(build([item({ dueAt: soon })], prefs(15)), {}, NOW);
  assert.strictEqual(at15.length, 1);
  assert.match(at15[0].title, /due in 15 minutes/);

  // Zero lead means the email lands at the due moment itself.
  const atDue = collectTodoEmails(build([item({ dueAt: NOW })], prefs(0)), {}, NOW);
  assert.strictEqual(atDue.length, 1);
  assert.match(atDue[0].title, /is due now/);
});

test('changing the lead re-arms an already-sent email', () => {
  const dueAt = NOW + 60 * MIN;
  const sent = { [`todo-email-T1-${dueAt}-60`]: NOW - MIN };
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], EMAIL_ON), sent, NOW), []);
  const relead = collectTodoEmails(
    build([item({ dueAt })], { notifPrefs: { email: { enabled: true, taskLeadMinutes: 120 } } }), sent, NOW);
  assert.strictEqual(relead.length, 1);
});

test('task emails can be switched off without disabling email', () => {
  const dueAt = NOW + 60 * MIN;
  const off = { notifPrefs: { email: { enabled: true, tasks: false } } };
  assert.deepStrictEqual(collectTodoEmails(build([item({ dueAt })], off), {}, NOW), []);
});

// ── Reminders set on a list as a whole ───────────────────────────────────────
// These fire independently of any item reminder, and every list type can carry
// one — not just to-do and work lists.

/** A data blob with one list carrying its own reminder, plus its items. */
function listBuild(listOver = {}, items = []) {
  return {
    shoppingLists: [{ id: 'L9', name: 'Weekend shop', type: 'grocery', notifyEnabled: true, ...listOver }],
    shoppingItems: items,
  };
}

test('a reminder on the list itself fires at its due time', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW }, [
    { id: 'A', listId: 'L9', name: 'Milk', checked: false },
    { id: 'B', listId: 'L9', name: 'Eggs', checked: false },
  ]), {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].title, 'Due now: Weekend shop');
  assert.strictEqual(msgs[0].body, '2 items left');
  assert.strictEqual(msgs[0].tag, `list-due-L9-${NOW}`);
});

test('a list lead time fires early and names the due time', () => {
  const dueAt = NOW + 45 * MIN;
  const msgs = collectTodoMessages(
    listBuild({ dueAt, remindOffsetMinutes: 45 }, [{ id: 'A', listId: 'L9', name: 'Milk', checked: false }]),
    {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].title, 'Coming up: Weekend shop');
  assert.match(msgs[0].body, /^1 item left — due at 2:45/);
});

test('a list reminder is skipped once every item is done', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW }, [
    { id: 'A', listId: 'L9', name: 'Milk', checked: true },
    { id: 'B', listId: 'L9', name: 'Eggs', checked: true },
  ]), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('an empty list still gets its reminder', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW }, []), {}, NOW);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].body, '0 items left');
});

test('task lists judge completion by status, not the checked flag', () => {
  const done = collectTodoMessages(listBuild({ type: 'todo', dueAt: NOW }, [
    { id: 'A', listId: 'L9', name: 'Call plumber', status: 'done' },
  ]), {}, NOW);
  assert.deepStrictEqual(done, []);

  const blocked = collectTodoMessages(listBuild({ type: 'todo', dueAt: NOW }, [
    { id: 'A', listId: 'L9', name: 'Call plumber', status: 'blocked' },
  ]), {}, NOW);
  assert.strictEqual(blocked.length, 1, 'blocked is not finished, so the list still fires');
});

test('a list with no reminder switched on never fires', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW, notifyEnabled: false }, []), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('an archived list never fires', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW, archived: true }, []), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('a list reminder is not resent once its key is recorded', () => {
  const data = listBuild({ dueAt: NOW }, []);
  const sent = { [`list-due-L9-${NOW}`]: NOW };
  assert.deepStrictEqual(collectTodoMessages(data, sent, NOW), []);
});

test('a list reminder does not fire long after the window has passed', () => {
  const msgs = collectTodoMessages(listBuild({ dueAt: NOW - 7 * 60 * MIN }, []), {}, NOW);
  assert.deepStrictEqual(msgs, []);
});

test('list emails go out with the outstanding items', () => {
  const data = {
    ...listBuild({ dueAt: NOW }, [
      { id: 'A', listId: 'L9', name: 'Milk', checked: false },
      { id: 'B', listId: 'L9', name: 'Eggs', checked: true },
    ]),
    ...EMAIL_ON,
  };
  const emails = collectTodoEmails(data, {}, NOW);
  assert.strictEqual(emails.length, 1);
  assert.strictEqual(emails[0].subject, 'Coming up: Weekend shop');
  assert.match(emails[0].lines[1], /^1 item is still outstanding:/);
  assert.ok(emails[0].lines.includes('Milk'));
  assert.ok(!emails[0].lines.includes('Eggs'), 'finished items are left out');
});

test('a list email uses the lead set on the list, not the global task lead', () => {
  const dueAt = NOW + 120 * MIN;
  const data = {
    ...listBuild({ dueAt, remindOffsetMinutes: 120 }, []),
    notifPrefs: { email: { enabled: true, taskLeadMinutes: 15 } },
  };
  const emails = collectTodoEmails(data, {}, NOW);
  assert.strictEqual(emails.length, 1);
  assert.match(emails[0].title, /due in about 2 hours/);
  assert.strictEqual(emails[0].tag, `list-email-L9-${dueAt}-120`);
});

test('list emails stop when email is off', () => {
  const data = { ...listBuild({ dueAt: NOW }, []), notifPrefs: { email: { enabled: false } } };
  assert.deepStrictEqual(collectTodoEmails(data, {}, NOW), []);
});

test('list emails stop when task emails are switched off', () => {
  const data = { ...listBuild({ dueAt: NOW }, []), notifPrefs: { email: { enabled: true, tasks: false } } };
  assert.deepStrictEqual(collectTodoEmails(data, {}, NOW), []);
});
