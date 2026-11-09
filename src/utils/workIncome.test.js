import { test } from 'node:test';
import assert from 'node:assert';
import { deriveWorkIncome, mergeWorkIncome, annualizeWorkIncome, payPeriodFor } from './workIncome.js';

// Biweekly, periods start on Sundays from Oct 4 2026, paid the Friday after.
const job = {
  id: 'j1', name: 'EMS', hourlyRate: 20, payFrequency: 'biweekly', weekStartDay: 0,
  payPeriodStartDate: '2026-10-04', payDate: '2026-10-23', filingStatus: 'single',
};

const shift = (id, date, hoursWorked, extra = {}) => ({ id, jobId: 'j1', date, hoursWorked, ...extra });

test('one paycheck per pay period, placed in the payday month', () => {
  const shifts = [
    shift('a', '2026-10-05', 12),
    shift('b', '2026-10-12', 12),
    shift('c', '2026-10-26', 12), // next period: Oct 18 – Oct 31, paid Nov 6
  ];
  const out = deriveWorkIncome([job], shifts);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out.map((e) => [e.payPeriodStart, e.payPeriodEnd, e.payday, e.month]), [
    ['2026-10-04', '2026-10-17', '2026-10-23', '2026-10'],
    ['2026-10-18', '2026-10-31', '2026-11-06', '2026-11'],
  ]);
  assert.strictEqual(out[0].hours, 24);
  assert.strictEqual(out[0].grossAmount, 480);
  assert.ok(out[0].amount > 0 && out[0].amount < 480);
  assert.ok(out.every((e) => e.isAutoWorkIncome && e.isEstimate && !e.isRecurring));
});

test('adding and deleting shifts changes the paycheck with no manual step', () => {
  const before = deriveWorkIncome([job], [shift('a', '2026-10-05', 8)]);
  const added = deriveWorkIncome([job], [shift('a', '2026-10-05', 8), shift('b', '2026-10-06', 8)]);
  assert.strictEqual(before.length, 1);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].id, before[0].id);
  assert.strictEqual(added[0].grossAmount, before[0].grossAmount * 2);
  assert.deepStrictEqual(deriveWorkIncome([job], []), []);
});

test('overtime is counted per OT week inside the period', () => {
  const shifts = [0, 1, 2, 3].map((d) => shift(`s${d}`, `2026-10-0${5 + d}`, 12)); // 48h in one week
  const [e] = deriveWorkIncome([job], shifts);
  assert.strictEqual(e.regularHours, 40);
  assert.strictEqual(e.overtimeHours, 8);
  assert.strictEqual(e.grossAmount, 40 * 20 + 8 * 30);
});

test('a recorded actual paycheck replaces the estimate', () => {
  const actuals = [{ jobId: 'j1', periodStart: '2026-10-04', amount: 401.5 }];
  const [e] = deriveWorkIncome([job], [shift('a', '2026-10-05', 24)], actuals);
  assert.strictEqual(e.amount, 401.5);
  assert.strictEqual(e.isEstimate, false);
});

test('jobs without a pay period are grouped by calendar month', () => {
  const loose = { ...job, payPeriodStartDate: '', payDate: '' };
  assert.deepStrictEqual(payPeriodFor(loose, '2026-02-14'), { start: '2026-02-01', end: '2026-02-28', byMonth: true });
  const out = deriveWorkIncome([loose], [shift('a', '2026-10-05', 8), shift('b', '2026-10-30', 8), shift('c', '2026-11-02', 8)]);
  assert.deepStrictEqual(out.map((e) => [e.month, e.hours]), [['2026-10', 16], ['2026-11', 8]]);
});

test('jobs excluded from availability carry that through', () => {
  const [e] = deriveWorkIncome([{ ...job, includeInAvailability: false }], [shift('a', '2026-10-05', 8)]);
  assert.strictEqual(e.includeInAvailability, false);
});

test('old saved estimates are hidden while their job still exists', () => {
  const income = [
    { id: 'i1', source: 'Salary', amount: 100, isRecurring: true },
    { id: 'i2', source: 'EMS — Paycheck Est.', amount: 50, isWorkTimeEntry: true, jobId: 'j1' },
    { id: 'i3', source: 'Old job — Paycheck Est.', amount: 50, isWorkTimeEntry: true, jobId: 'gone' },
  ];
  const derived = deriveWorkIncome([job], [shift('a', '2026-10-05', 8)]);
  const merged = mergeWorkIncome(income, [job], derived);
  assert.deepStrictEqual(merged.map((i) => i.id), ['i1', 'i3', derived[0].id]);
});

test('annualizing uses the average paycheck, not every paycheck ×12', () => {
  const shifts = [shift('a', '2026-10-05', 10), shift('b', '2026-10-19', 30)];
  const entries = deriveWorkIncome([job], shifts);
  // average gross (200 + 600) / 2 = 400, 26 paychecks a year
  assert.strictEqual(annualizeWorkIncome(entries, true, 2026), 400 * 26);
  assert.strictEqual(annualizeWorkIncome([{ id: 'x', amount: 5 }], true, 2026), 0);
});
