// Unit tests for quick-add date parsing.
// Run with: npm run test:unit  (from the repo root)
import assert from 'node:assert';
import { test } from 'node:test';
import { parseTaskInput } from './parseTaskInput.js';

// A Wednesday, so weekday maths has somewhere unambiguous to land.
const NOW = new Date('2026-08-12T09:00:00');

const parse = (s) => parseTaskInput(s, NOW);

test('plain text is left completely alone', () => {
  assert.deepStrictEqual(parse('buy milk'), { name: 'buy milk', dueDate: null, dueTime: null });
});

test('today and tomorrow', () => {
  assert.deepStrictEqual(parse('call mum today'), { name: 'call mum', dueDate: '2026-08-12', dueTime: null });
  assert.deepStrictEqual(parse('bins out tomorrow'), { name: 'bins out', dueDate: '2026-08-13', dueTime: null });
});

test('a date phrase only counts at the end of the line', () => {
  assert.deepStrictEqual(parse('call the tomorrow people'),
    { name: 'call the tomorrow people', dueDate: null, dueTime: null });
});

test('date and time together', () => {
  assert.deepStrictEqual(parse('trash out tomorrow 7pm'),
    { name: 'trash out', dueDate: '2026-08-13', dueTime: '19:00' });
});

test('time formats: 2:30pm, 7 pm, at 14:00', () => {
  assert.deepStrictEqual(parse('dentist tomorrow 2:30pm'),
    { name: 'dentist', dueDate: '2026-08-13', dueTime: '14:30' });
  assert.deepStrictEqual(parse('dinner tomorrow 7 pm'),
    { name: 'dinner', dueDate: '2026-08-13', dueTime: '19:00' });
  assert.deepStrictEqual(parse('standup tomorrow at 14:00'),
    { name: 'standup', dueDate: '2026-08-13', dueTime: '14:00' });
});

test('a time on its own leaves the date unset', () => {
  assert.deepStrictEqual(parse('leave at 5pm'), { name: 'leave', dueDate: null, dueTime: '17:00' });
});

test('midnight and noon convert correctly', () => {
  assert.strictEqual(parse('x today 12am').dueTime, '00:00');
  assert.strictEqual(parse('x today 12pm').dueTime, '12:00');
});

test('weekday names land on the next such day', () => {
  // NOW is a Wednesday.
  assert.strictEqual(parse('gym friday').dueDate, '2026-08-14');
  assert.strictEqual(parse('gym fri').dueDate, '2026-08-14');
  // The same weekday means a week out, not today.
  assert.strictEqual(parse('gym wednesday').dueDate, '2026-08-19');
});

test('"next friday" skips a further week', () => {
  assert.strictEqual(parse('report next friday').dueDate, '2026-08-21');
});

test('next week', () => {
  assert.strictEqual(parse('review next week').dueDate, '2026-08-19');
});

test('in N days / weeks', () => {
  assert.strictEqual(parse('follow up in 3 days').dueDate, '2026-08-15');
  assert.strictEqual(parse('follow up in 2 weeks').dueDate, '2026-08-26');
});

test('numeric dates, with and without a year', () => {
  assert.strictEqual(parse('mot 8/14').dueDate, '2026-08-14');
  assert.strictEqual(parse('mot 8/14/27').dueDate, '2027-08-14');
  // A date already past this year rolls to next year.
  assert.strictEqual(parse('taxes 1/15').dueDate, '2027-01-15');
});

test('month-name dates in either order', () => {
  assert.strictEqual(parse('holiday aug 20').dueDate, '2026-08-20');
  assert.strictEqual(parse('holiday 20 aug').dueDate, '2026-08-20');
});

test('lead-in words are dropped from the name', () => {
  assert.deepStrictEqual(parse('submit report due friday'),
    { name: 'submit report', dueDate: '2026-08-14', dueTime: null });
  assert.deepStrictEqual(parse('pay rent on 9/1'),
    { name: 'pay rent', dueDate: '2026-09-01', dueTime: null });
});

test('a line that is nothing but a date stays a literal task', () => {
  assert.deepStrictEqual(parse('tomorrow'), { name: 'tomorrow', dueDate: null, dueTime: null });
  assert.deepStrictEqual(parse('friday 3pm'), { name: 'friday 3pm', dueDate: null, dueTime: null });
});

test('nonsense times are not treated as times', () => {
  assert.deepStrictEqual(parse('order 25 widgets'), { name: 'order 25 widgets', dueDate: null, dueTime: null });
  assert.deepStrictEqual(parse('invoice 1500'), { name: 'invoice 1500', dueDate: null, dueTime: null });
  assert.deepStrictEqual(parse('meet at 99pm'), { name: 'meet at 99pm', dueDate: null, dueTime: null });
});

test('an impossible calendar date is left as text', () => {
  assert.deepStrictEqual(parse('ship 13/45'), { name: 'ship 13/45', dueDate: null, dueTime: null });
});

test('empty input is handled', () => {
  assert.deepStrictEqual(parse(''), { name: '', dueDate: null, dueTime: null });
  assert.deepStrictEqual(parseTaskInput(null, NOW), { name: '', dueDate: null, dueTime: null });
});
