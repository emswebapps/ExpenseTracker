import { test } from 'node:test';
import assert from 'node:assert';
import { getPaydayForPeriod } from './taxCalc.js';

// Biweekly, paid on Fridays: Oct 16, Oct 30, Nov 13, ...
const job = { payFrequency: 'biweekly', payDate: '2026-10-16' };

test('a period is paid on the first payday on or after its last day', () => {
  assert.strictEqual(getPaydayForPeriod(job, '2026-11-07'), '2026-11-13');
  assert.strictEqual(getPaydayForPeriod(job, '2026-10-24'), '2026-10-30');
});

test('a period ending late in a month can be paid in the next one', () => {
  assert.strictEqual(getPaydayForPeriod(job, '2026-10-31'), '2026-11-13');
});

test('a payday on the period end counts, and paydays before the reference date work', () => {
  assert.strictEqual(getPaydayForPeriod(job, '2026-10-30'), '2026-10-30');
  assert.strictEqual(getPaydayForPeriod(job, '2026-09-20'), '2026-10-02');
});

test('weekly jobs step by a week', () => {
  assert.strictEqual(getPaydayForPeriod({ payFrequency: 'weekly', payDate: '2026-10-16' }, '2026-10-17'), '2026-10-23');
});

test('no payday set on the job means no answer', () => {
  assert.strictEqual(getPaydayForPeriod({ payFrequency: 'biweekly' }, '2026-10-31'), null);
  assert.strictEqual(getPaydayForPeriod(null, '2026-10-31'), null);
});
