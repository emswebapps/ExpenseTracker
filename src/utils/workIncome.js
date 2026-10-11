// Paychecks built from the hours logged in Work Time.
//
// Every pay period a job has shifts in becomes one paycheck, filed under the
// month its payday lands in. Nothing here is stored: the entries are worked
// out from jobs + shifts each time, so logging, editing or deleting a shift
// moves the Income tab with it, and there is never a stale copy to clean up.
import { calcPaycheck, calcHoursFromShifts } from './taxCalc.js';

const DAY_MS = 86400000;

// Whole days since the epoch, in UTC, so DST never shifts a date by one.
function toDay(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDay(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function cycleDays(job) {
  return job.payFrequency === 'weekly' ? 7 : 14;
}

/** The { start, end } pay period a date falls in, or null if the job has no schedule. */
export function payPeriodFor(job, dateISO) {
  if (!job?.payPeriodStartDate) return null;
  const cycle = cycleDays(job);
  const ref = toDay(job.payPeriodStartDate);
  const start = ref + Math.floor((toDay(dateISO) - ref) / cycle) * cycle;
  return { start: fromDay(start), end: fromDay(start + cycle - 1) };
}

/**
 * The payday for a period: the first of the job's paydays on or after the day
 * the period closes. Without a payday set, the period's last day stands in.
 */
export function paydayFor(job, periodEnd) {
  if (!job?.payDate) return periodEnd;
  const cycle = cycleDays(job);
  const ref = toDay(job.payDate);
  const k = Math.ceil((toDay(periodEnd) - ref) / cycle);
  return fromDay(ref + k * cycle);
}

/** One paycheck per job and pay period that has logged hours, newest payday last. */
export function buildWorkPaychecks({ jobs = [], shifts = [], paycheckActuals = [] }) {
  const out = [];
  for (const job of jobs) {
    if (!job.payPeriodStartDate || !job.hourlyRate) continue;
    const byPeriod = new Map();
    for (const sh of shifts) {
      if (sh.jobId !== job.id || !sh.date || !(sh.hoursWorked > 0)) continue;
      const { start, end } = payPeriodFor(job, sh.date);
      if (!byPeriod.has(start)) byPeriod.set(start, { start, end, shifts: [] });
      byPeriod.get(start).shifts.push(sh);
    }
    for (const { start, end, shifts: periodShifts } of byPeriod.values()) {
      const { regularHours, overtimeHours } = calcHoursFromShifts(periodShifts, job);
      const pay = calcPaycheck({ job, regularHours, overtimeHours });
      // A logged deposit beats the estimate. Later entries win if there are several.
      const actual = paycheckActuals.filter((a) => a.jobId === job.id && a.periodStart === start).pop();
      const payDate = paydayFor(job, end);
      out.push({
        id: `worktime-${job.id}-${start}`,
        isWorkTimeAuto: true,
        source: job.name,
        jobId: job.id,
        amount: actual ? actual.amount : pay.netPay,
        estimatedNet: pay.netPay,
        actualNet: actual ? actual.amount : null,
        grossAmount: pay.grossPay,
        regularHours,
        overtimeHours,
        payPeriodStart: start,
        payPeriodEnd: end,
        payDate,
        month: payDate.slice(0, 7),
        // One paycheck, counted once in a month's total.
        frequency: 'paycheck',
        isRecurring: false,
        person: 'me',
        includeInAvailability: job.includeInAvailability !== false,
      });
    }
  }
  return out.sort((a, b) => a.payDate.localeCompare(b.payDate) || a.source.localeCompare(b.source));
}

/** The Work Time paychecks whose payday falls in month `mk` (YYYY-MM). */
export function getWorkIncomeForMonth(data, mk) {
  return buildWorkPaychecks(data).filter((p) => p.month === mk);
}

/**
 * A month's income with its Work Time paychecks added. A paycheck saved by
 * hand from the Estimate tab before this existed covers the same period as an
 * automatic one, so the saved copy steps aside rather than counting twice.
 */
export function withWorkIncome(monthIncome, workIncome) {
  const covered = new Set(workIncome.map((p) => `${p.jobId}|${p.payPeriodStart}`));
  const kept = monthIncome.filter((i) =>
    !(i.isWorkTimeEntry && covered.has(`${i.jobId}|${i.payPeriodStart}`)));
  return [...kept, ...workIncome];
}
