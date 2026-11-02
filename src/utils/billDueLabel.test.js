import { test } from 'node:test';
import assert from 'node:assert';
import { getBillDueLabel } from './helpers.js';

// 2 Nov 2026, mid-morning.
const NOW = new Date(2026, 10, 2, 9, 30);
const recurring = (dueDay) => ({ isRecurring: true, dueDay });

test('counts down to the date in the viewed month and names it', () => {
  assert.strictEqual(getBillDueLabel(recurring(23), '2026-11', NOW), 'Due in 21 days · November 23');
  assert.strictEqual(getBillDueLabel(recurring(2), '2026-11', NOW), 'Due today · November 2');
  assert.strictEqual(getBillDueLabel(recurring(3), '2026-11', NOW), 'Due tomorrow · November 3');
});

test('a past date this month is overdue, with the date', () => {
  assert.strictEqual(getBillDueLabel(recurring(1), '2026-11', NOW), '1 day overdue · November 1');
});

test('future months count across the month boundary', () => {
  assert.strictEqual(getBillDueLabel(recurring(5), '2026-12', NOW), 'Due in 33 days · December 5');
  assert.strictEqual(getBillDueLabel(recurring(5), '2027-01', NOW), 'Due in 64 days · January 5, 2027');
});

test('earlier months just name the date', () => {
  assert.strictEqual(getBillDueLabel(recurring(23), '2026-09', NOW), 'Due September 23');
});

test('one-time bills use their own month and clamp the day to its length', () => {
  const bill = { isRecurring: false, month: '2027-02', dueDay: 31 };
  assert.strictEqual(getBillDueLabel(bill, '2027-02', NOW), 'Due in 118 days · February 28, 2027');
});
