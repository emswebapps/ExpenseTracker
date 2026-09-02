// Unit tests for the daily summary: which reminders apply on a given local
// day, and which of them each channel wants.
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
const { _internal } = require('../index');
const {
  collectDailyMessages, filterDailyForPush, filterDailyForEmail,
  localDateAndMinutes, daysBetween, tomorrowDayOfMonth,
} = _internal;

const TODAY = '2026-07-26'; // a Sunday, day 26 of the month

const categories = (msgs) => msgs.map((m) => m.category);
const titles = (msgs) => msgs.map((m) => m.title);

// ── Local clock helpers ──

test('local date and minutes follow the user time zone', () => {
  // 2026-07-26 02:30 UTC is still 2026-07-25 22:30 in New York.
  const at = new Date(Date.UTC(2026, 6, 26, 2, 30));
  assert.deepStrictEqual(
    localDateAndMinutes(at, 'America/New_York'),
    { date: '2026-07-25', minutes: 22 * 60 + 30 });
  assert.deepStrictEqual(
    localDateAndMinutes(at, 'UTC'),
    { date: '2026-07-26', minutes: 150 });
});

test('midnight reads as minute zero, not 1440', () => {
  const at = new Date(Date.UTC(2026, 6, 26, 4, 0)); // 00:00 America/New_York
  assert.deepStrictEqual(
    localDateAndMinutes(at, 'America/New_York'), { date: '2026-07-26', minutes: 0 });
});

test('daysBetween counts whole calendar days', () => {
  assert.strictEqual(daysBetween(TODAY, TODAY), 0);
  assert.strictEqual(daysBetween(TODAY, '2026-07-27'), 1);
  assert.strictEqual(daysBetween(TODAY, '2026-07-25'), -1);
  assert.strictEqual(daysBetween(TODAY, '2026-08-02'), 7);
  assert.strictEqual(daysBetween(TODAY, 'nonsense'), null);
});

test('tomorrow rolls over month and year ends', () => {
  assert.strictEqual(tomorrowDayOfMonth('2026-07-26'), 27);
  assert.strictEqual(tomorrowDayOfMonth('2026-07-31'), 1); // 31-day month
  assert.strictEqual(tomorrowDayOfMonth('2026-02-28'), 1); // non-leap February
  assert.strictEqual(tomorrowDayOfMonth('2026-12-31'), 1); // year end
});

// ── Bills ──

const bill = (over = {}) => ({ id: 'B1', name: 'Rent', amount: 1200, dueDay: 26, ...over });

test('a bill due today, tomorrow, or overdue each produce one message', () => {
  const cases = [
    [26, 'Bill Due Today: Rent', 'sameDay'],
    [27, 'Bill Due Tomorrow: Rent', 'dayBefore'],
    [20, 'Bill Overdue: Rent', 'overdue'],
  ];
  for (const [dueDay, title, kind] of cases) {
    const msgs = collectDailyMessages({ bills: [bill({ dueDay })] }, TODAY)
      .filter((m) => m.category === 'bills');
    assert.strictEqual(msgs.length, 1, `dueDay=${dueDay}`);
    assert.strictEqual(msgs[0].title, title);
    assert.strictEqual(msgs[0].kind, kind);
  }
});

test('an unpaid bill whose day has passed stays overdue for the month', () => {
  // On the 31st, a bill due on the 1st is overdue for *this* month — the
  // month key decides which instance is being judged, not the calendar.
  const msgs = collectDailyMessages({ bills: [bill({ dueDay: 1 })] }, '2026-07-31')
    .filter((m) => m.category === 'bills');
  assert.deepStrictEqual(titles(msgs), ['Bill Overdue: Rent']);
});

test('the last day of a month is still reachable as tomorrow', () => {
  const msgs = collectDailyMessages({ bills: [bill({ dueDay: 31 })] }, '2026-07-30')
    .filter((m) => m.category === 'bills');
  assert.deepStrictEqual(titles(msgs), ['Bill Due Tomorrow: Rent']);
});

test('paid and permanent bills are skipped', () => {
  const paidByStatus = collectDailyMessages(
    { bills: [bill({ statusMonths: { '2026-07': 'paid' } })] }, TODAY);
  const paidByMonth = collectDailyMessages(
    { bills: [bill({ paidMonths: { '2026-07': true } })] }, TODAY);
  const permanent = collectDailyMessages({ bills: [bill({ isPermanent: true })] }, TODAY);
  for (const msgs of [paidByStatus, paidByMonth, permanent]) {
    assert.deepStrictEqual(msgs.filter((m) => m.category === 'bills'), []);
  }
});

// ── Commitments, goals, projects ──

test('commitments fire inside their configured window only', () => {
  const data = (endDate, daysBefore) => ({
    commitments: [{ id: 'C1', description: 'Gym', endDate }],
    notifPrefs: { commitments: { daysBefore } },
  });
  const commits = (d) => collectDailyMessages(d, TODAY).filter((m) => m.category === 'commitments');

  assert.strictEqual(commits(data('2026-07-28', 3)).length, 1);
  assert.strictEqual(commits(data('2026-07-30', 3)).length, 0); // 4 days out
  assert.strictEqual(commits(data('2026-07-30', 7)).length, 1); // wider window
  assert.strictEqual(commits(data('2026-07-25', 3)).length, 0); // already past
  assert.match(commits(data(TODAY, 3))[0].body, /Expires today/);
});

test('goals fire within a week and projects within three days', () => {
  const data = {
    plannedExpenses: [
      { id: 'G1', name: 'New laptop', targetDate: '2026-08-02' }, // 7 days
      { id: 'G2', name: 'Too far', targetDate: '2026-08-03' },    // 8 days
    ],
    projects: [
      { id: 'P1', name: 'Kitchen', reviewDate: '2026-07-29', dueDate: '2026-07-27' },
      { id: 'P2', name: 'Later', dueDate: '2026-07-30' }, // 4 days
    ],
  };
  const msgs = collectDailyMessages(data, TODAY);
  assert.deepStrictEqual(titles(msgs.filter((m) => m.category === 'goals')), ['Goal: New laptop']);
  // One project contributes both its review date and its due date.
  assert.deepStrictEqual(
    titles(msgs.filter((m) => m.category === 'projects')), ['Project: Kitchen', 'Project: Kitchen']);
});

test('completed goals and projects are skipped', () => {
  const msgs = collectDailyMessages({
    plannedExpenses: [{ id: 'G1', name: 'Done', targetDate: TODAY, status: 'completed' }],
    projects: [{ id: 'P1', name: 'Done', dueDate: TODAY, completed: true }],
  }, TODAY);
  assert.deepStrictEqual(categories(msgs), ['workLog']);
});

// ── Channel filtering ──

const everything = () => collectDailyMessages({
  bills: [bill()],
  commitments: [{ id: 'C1', description: 'Gym', endDate: TODAY }],
  plannedExpenses: [{ id: 'G1', name: 'Laptop', targetDate: TODAY }],
  projects: [{ id: 'P1', name: 'Kitchen', dueDate: TODAY }],
}, TODAY);

test('every category is collected before any filtering', () => {
  assert.deepStrictEqual(
    categories(everything()), ['bills', 'commitments', 'goals', 'projects', 'workLog']);
});

test('push filtering honours each push toggle', () => {
  const msgs = everything();
  // Defaults: everything except the work log, which is opt-in.
  assert.deepStrictEqual(
    categories(filterDailyForPush(msgs, {})), ['bills', 'commitments', 'goals', 'projects']);

  assert.deepStrictEqual(
    categories(filterDailyForPush(msgs, { bills: { sameDay: false } })),
    ['commitments', 'goals', 'projects']);
  assert.deepStrictEqual(
    categories(filterDailyForPush(msgs, { goals: { enabled: false }, projects: { enabled: false } })),
    ['bills', 'commitments']);
  assert.deepStrictEqual(
    categories(filterDailyForPush(msgs, { shifts: { reminder: true } })),
    ['bills', 'commitments', 'goals', 'projects', 'workLog']);
});

test('email filtering is independent of the push toggles', () => {
  const msgs = everything();
  const prefs = {
    // Push is silenced for bills; email should still carry them.
    bills: { overdue: false, sameDay: false, dayBefore: false },
    shifts: { reminder: false },
    email: { enabled: true },
  };
  assert.deepStrictEqual(categories(filterDailyForPush(msgs, prefs)), ['commitments', 'goals', 'projects']);
  assert.deepStrictEqual(
    categories(filterDailyForEmail(msgs, prefs)),
    ['bills', 'commitments', 'goals', 'projects', 'workLog']);
});

test('each email category can be turned off on its own', () => {
  const msgs = everything();
  assert.deepStrictEqual(
    categories(filterDailyForEmail(msgs, { email: { enabled: true, goals: false, workLog: false } })),
    ['bills', 'commitments', 'projects']);
});

test('email filtering yields nothing when the channel is off', () => {
  assert.deepStrictEqual(filterDailyForEmail(everything(), { email: { enabled: false } }), []);
  assert.deepStrictEqual(filterDailyForEmail(everything(), {}), []);
});

// ── Today's plan ─────────────────────────────────────────────────────────────

const planData = (items, lists) => ({
  shoppingLists: lists || [
    { id: 'L1', name: 'Weekly To Do', type: 'todo' },
    { id: 'L2', name: 'Shift prep', type: 'work' },
    { id: 'L3', name: 'Groceries', type: 'grocery' },
    { id: 'L4', name: 'Old week', type: 'todo', archived: true },
  ],
  shoppingItems: items,
});

const plan = (data) => collectDailyMessages(data, TODAY).filter((m) => m.category === 'todos');

test("today's plan gathers dated tasks across every task list", () => {
  const msgs = plan(planData([
    { id: 'T1', listId: 'L1', name: 'EMS class', status: 'pending', dueDate: TODAY, dueTime: '08:00' },
    { id: 'T2', listId: 'L2', name: 'Pack bag', status: 'pending', dueDate: TODAY },
    { id: 'T3', listId: 'L1', name: 'Next week', status: 'pending', dueDate: '2026-08-01' },
  ]));
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].title, 'Today: 2 tasks');
  assert.strictEqual(msgs[0].body, 'EMS class, Pack bag');
  assert.strictEqual(msgs[0].tag, `todo-plan-${TODAY}`);
});

test("today's plan skips finished work, other list types and archived lists", () => {
  const msgs = plan(planData([
    { id: 'T1', listId: 'L1', name: 'Done', status: 'done', dueDate: TODAY },
    { id: 'T2', listId: 'L1', name: 'Blocked', status: 'blocked', dueDate: TODAY },
    { id: 'T3', listId: 'L3', name: 'Milk', checked: false, dueDate: TODAY },
    { id: 'T4', listId: 'L4', name: 'Archived', status: 'pending', dueDate: TODAY },
    { id: 'T5', listId: 'L1', name: 'Undated', status: 'pending' },
  ]));
  assert.deepStrictEqual(msgs, []);
});

test("today's plan never lists a day heading as a task", () => {
  const msgs = plan(planData([
    { id: 'H1', listId: 'L1', name: '📅 MONDAY 📅', header: true, status: 'pending', dueDate: TODAY },
    { id: 'T1', listId: 'L1', parentId: 'H1', name: 'EMS class', status: 'pending', dueDate: TODAY },
  ]));
  assert.strictEqual(msgs[0].title, 'Today: 1 task');
  assert.strictEqual(msgs[0].body, 'EMS class');
  // The email lines name where it sits.
  assert.match(msgs[0].lines[1], /EMS class — Weekly To Do · 📅 MONDAY 📅/);
});

test("today's plan truncates the push body but not the email", () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => (
    { id: `T${i}`, listId: 'L1', name: `task ${n}`, status: 'pending', dueDate: TODAY }
  ));
  const msgs = plan(planData(items));
  assert.strictEqual(msgs[0].title, 'Today: 6 tasks');
  assert.strictEqual(msgs[0].body, 'task a, task b, task c, task d +2 more');
  // One intro line plus all six.
  assert.strictEqual(msgs[0].lines.length, 7);
});

test("today's plan reports overdue work even when nothing is due today", () => {
  const msgs = plan(planData([
    { id: 'T1', listId: 'L1', name: 'Late thing', status: 'pending', dueDate: '2026-07-20' },
    { id: 'T2', listId: 'L1', name: 'Also late', status: 'pending', dueDate: '2026-07-25' },
  ]));
  assert.strictEqual(msgs[0].title, '2 tasks are overdue');
  assert.strictEqual(msgs[0].body, '2 tasks are overdue');
});

test("today's plan is silent when there is nothing at all", () => {
  assert.deepStrictEqual(plan(planData([])), []);
  assert.deepStrictEqual(plan({}), []);
});

test("today's plan honours both the plan toggle and the to-do master switch", () => {
  const msgs = collectDailyMessages(planData([
    { id: 'T1', listId: 'L1', name: 'EMS class', status: 'pending', dueDate: TODAY },
  ]), TODAY);

  // On by default.
  assert.ok(categories(filterDailyForPush(msgs, {})).includes('todos'));
  // Off on its own…
  assert.ok(!categories(filterDailyForPush(msgs, { todos: { dailyPlan: false } })).includes('todos'));
  // …and off when to-do notifications are off altogether.
  assert.ok(!categories(filterDailyForPush(msgs, { todos: { enabled: false } })).includes('todos'));

  // Email follows the same per-category switch as every other digest entry.
  assert.ok(categories(filterDailyForEmail(msgs, { email: { enabled: true } })).includes('todos'));
  assert.ok(!categories(filterDailyForEmail(msgs, { email: { enabled: true, todos: false } })).includes('todos'));
});
