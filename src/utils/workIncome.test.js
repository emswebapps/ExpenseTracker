// Unit tests for the Work Time → Income paychecks.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  payPeriodFor, paydayFor, buildWorkPaychecks, getWorkIncomeForMonth, withWorkIncome,
} from './workIncome.js';
import { calcPaycheck } from './taxCalc.js';

// Biweekly periods Sun 2026-09-06 → Sat 09-19, paid the Friday after (09-25).
const job = {
  id: 'ems', name: 'EMS', hourlyRate: 20, payFrequency: 'biweekly',
  payPeriodStartDate: '2026-09-06', payDate: '2026-09-25', weekStartDay: 0,
};
const shift = (date, hoursWorked, extra = {}) => ({ id: date, jobId: 'ems', date, hoursWorked, ...extra });

test('payPeriodFor finds the period a day sits in, before or after the anchor', () => {
  assert.deepEqual(payPeriodFor(job, '2026-09-06'), { start: '2026-09-06', end: '2026-09-19' });
  assert.deepEqual(payPeriodFor(job, '2026-09-19'), { start: '2026-09-06', end: '2026-09-19' });
  assert.deepEqual(payPeriodFor(job, '2026-09-20'), { start: '2026-09-20', end: '2026-10-03' });
  assert.deepEqual(payPeriodFor(job, '2026-09-05'), { start: '2026-08-23', end: '2026-09-05' });
  // Across the November DST change.
  assert.deepEqual(payPeriodFor(job, '2026-11-02'), { start: '2026-11-01', end: '2026-11-14' });
  assert.equal(payPeriodFor({ ...job, payPeriodStartDate: '' }, '2026-09-10'), null);
});

test('payPeriodFor steps by a week for weekly jobs', () => {
  const weekly = { ...job, payFrequency: 'weekly' };
  assert.deepEqual(payPeriodFor(weekly, '2026-09-14'), { start: '2026-09-13', end: '2026-09-19' });
});

test('paydayFor picks the first payday on or after the period closes', () => {
  assert.equal(paydayFor(job, '2026-09-19'), '2026-09-25');
  assert.equal(paydayFor(job, '2026-10-03'), '2026-10-09');
  assert.equal(paydayFor(job, '2026-09-05'), '2026-09-11');
  // Paid on the closing day itself.
  assert.equal(paydayFor({ ...job, payDate: '2026-09-19' }, '2026-09-19'), '2026-09-19');
  // No payday set: the period's last day stands in.
  assert.equal(paydayFor({ ...job, payDate: '' }, '2026-09-19'), '2026-09-19');
});

test('each pay period with hours becomes one paycheck, with overtime worked out per week', () => {
  const shifts = [
    // Week 1: 48h → 8h OT. Week 2: 24h.
    shift('2026-09-07', 24), shift('2026-09-09', 24), shift('2026-09-14', 24),
    // Next period.
    shift('2026-09-21', 12),
  ];
  const checks = buildWorkPaychecks({ jobs: [job], shifts });
  assert.equal(checks.length, 2);
  const [first, second] = checks;
  assert.equal(first.payPeriodStart, '2026-09-06');
  assert.equal(first.payDate, '2026-09-25');
  assert.equal(first.month, '2026-09');
  assert.equal(first.regularHours, 64);
  assert.equal(first.overtimeHours, 8);
  const expected = calcPaycheck({ job, regularHours: 64, overtimeHours: 8 });
  assert.equal(first.amount, expected.netPay);
  assert.equal(first.grossAmount, expected.grossPay);
  assert.equal(first.frequency, 'paycheck');
  assert.equal(first.isRecurring, false);
  assert.equal(second.payPeriodStart, '2026-09-20');
  assert.equal(second.month, '2026-10');
});

test('a month gets the paychecks whose payday falls in it', () => {
  const shifts = [shift('2026-09-08', 10), shift('2026-09-22', 10), shift('2026-10-06', 10)];
  const sept = getWorkIncomeForMonth({ jobs: [job], shifts }, '2026-09');
  const oct = getWorkIncomeForMonth({ jobs: [job], shifts }, '2026-10');
  assert.deepEqual(sept.map((p) => p.payDate), ['2026-09-25']);
  assert.deepEqual(oct.map((p) => p.payDate), ['2026-10-09', '2026-10-23']);
});

test('a logged deposit replaces the estimate', () => {
  const shifts = [shift('2026-09-08', 10)];
  const actuals = [
    { jobId: 'ems', periodStart: '2026-09-06', amount: 150 },
    { jobId: 'ems', periodStart: '2026-09-06', amount: 161.5 },
  ];
  const [check] = buildWorkPaychecks({ jobs: [job], shifts, paycheckActuals: actuals });
  assert.equal(check.amount, 161.5);
  assert.equal(check.actualNet, 161.5);
  assert.notEqual(check.estimatedNet, 161.5);
});

test('jobs without a pay schedule, other jobs\' shifts and empty shifts are left out', () => {
  const shifts = [shift('2026-09-08', 0), shift('2026-09-09', 8, { jobId: 'other' })];
  assert.deepEqual(buildWorkPaychecks({ jobs: [job], shifts }), []);
  assert.deepEqual(buildWorkPaychecks({ jobs: [{ ...job, payPeriodStartDate: '' }], shifts: [shift('2026-09-08', 8)] }), []);
});

test('the availability toggle follows the job', () => {
  const [check] = buildWorkPaychecks({ jobs: [{ ...job, includeInAvailability: false }], shifts: [shift('2026-09-08', 8)] });
  assert.equal(check.includeInAvailability, false);
});

test('withWorkIncome drops a hand-saved estimate for a period that is now automatic', () => {
  const work = getWorkIncomeForMonth({ jobs: [job], shifts: [shift('2026-09-08', 8)] }, '2026-09');
  const saved = { id: 'old', isWorkTimeEntry: true, jobId: 'ems', payPeriodStart: '2026-09-06', amount: 100 };
  const savedOther = { id: 'old2', isWorkTimeEntry: true, jobId: 'ems', payPeriodStart: '2026-08-23', amount: 90 };
  const salary = { id: 'pay', source: 'Salary', amount: 2000, isRecurring: true };
  const merged = withWorkIncome([salary, saved, savedOther], work);
  assert.deepEqual(merged.map((i) => i.id), ['pay', 'old2', work[0].id]);
});
