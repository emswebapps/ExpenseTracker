// Income that comes from logged work hours.
//
// Paychecks used to reach the Income tab only when someone pressed "Save to
// Income" on the Estimate screen. That froze a copy of the estimate, so every
// extra shift meant deleting the old entry and saving a new one. Instead, the
// paychecks are now worked out from the shifts themselves each time they're
// read: add, edit or delete a shift and the income moves with it.
//
// Nothing here is stored. Each entry is rebuilt from jobs + shifts (+ any
// actual paycheck amounts recorded on the Hours tab), and carries
// `isAutoWorkIncome: true` so the UI knows it can't be edited by hand.

import { calcPaycheck, calcHoursFromShifts, getPaydayForPeriod } from './taxCalc.js';

const DAY_MS = 86400000;

/** Whole days since the epoch for a "YYYY-MM-DD" string, in UTC. */
function dayNum(s) {
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;
}

function dayStr(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The pay period a date falls in. With a Pay Period Start Date on the job,
 * that's its weekly/biweekly cycle; without one there is no cycle to follow,
 * so the hours are grouped by calendar month.
 */
export function payPeriodFor(job, date) {
  if (job.payPeriodStartDate) {
    const cycle = job.payFrequency === 'weekly' ? 7 : 14;
    const ref = dayNum(job.payPeriodStartDate);
    const idx = Math.floor((dayNum(date) - ref) / cycle);
    return {
      start: dayStr(ref + idx * cycle),
      end: dayStr(ref + (idx + 1) * cycle - 1),
      byMonth: false,
    };
  }
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mk = date.slice(0, 7);
  return { start: `${mk}-01`, end: `${mk}-${String(last).padStart(2, '0')}`, byMonth: true };
}

function shortDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

/**
 * One income entry per job per pay period that has hours logged in it.
 * The entry lands in the month the money arrives (the job's payday for that
 * period), or the period's last day when the job has no payday set.
 * When an actual paycheck amount was recorded for the period, that replaces
 * the estimate.
 */
export function deriveWorkIncome(jobs = [], shifts = [], paycheckActuals = []) {
  const out = [];
  for (const job of jobs) {
    if (!job || !job.id || !(job.hourlyRate > 0)) continue;

    const periods = new Map();
    for (const sh of shifts) {
      if (sh.jobId !== job.id || !sh.date || !(sh.hoursWorked > 0)) continue;
      const p = payPeriodFor(job, sh.date);
      if (!periods.has(p.start)) periods.set(p.start, { ...p, shifts: [] });
      periods.get(p.start).shifts.push(sh);
    }

    for (const p of periods.values()) {
      const { regularHours, overtimeHours } = calcHoursFromShifts(p.shifts, job);
      const pay = calcPaycheck({ job, regularHours, overtimeHours });
      const actual = (paycheckActuals || []).find((a) => a.jobId === job.id && a.periodStart === p.start);
      const actualAmount = actual ? parseFloat(actual.amount) : NaN;
      const hasActual = Number.isFinite(actualAmount);
      const payday = p.byMonth ? null : getPaydayForPeriod(job, p.end);
      const hours = round2(regularHours + overtimeHours);
      const net = hasActual ? round2(actualAmount) : pay.netPay;

      const range = p.byMonth
        ? new Date(p.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${shortDate(p.start)} – ${shortDate(p.end)}`;
      const notes = [
        range,
        `${hours}h${overtimeHours > 0 ? ` (${overtimeHours}h OT)` : ''}`,
        `Gross ${money(pay.grossPay)}`,
        payday ? `Paid ${shortDate(payday)}` : null,
      ].filter(Boolean).join(' · ');

      out.push({
        id: `work:${job.id}:${p.start}`,
        source: `${job.name} — ${hasActual ? 'Paycheck' : 'Paycheck Est.'}`,
        amount: net,
        grossAmount: pay.grossPay,
        frequency: 'monthly',
        isRecurring: false,
        month: (payday || p.end).slice(0, 7),
        person: 'me',
        notes,
        includeInAvailability: job.includeInAvailability !== false,
        isAutoWorkIncome: true,
        isEstimate: !hasActual,
        jobId: job.id,
        payFrequency: p.byMonth ? 'monthly' : (job.payFrequency === 'weekly' ? 'weekly' : 'biweekly'),
        payPeriodStart: p.start,
        payPeriodEnd: p.end,
        payday,
        hours,
        regularHours,
        overtimeHours,
        shiftCount: p.shifts.length,
      });
    }
  }
  return out.sort((a, b) => (a.payday || a.payPeriodEnd).localeCompare(b.payday || b.payPeriodEnd));
}

/**
 * Stored income plus the paychecks worked out from hours.
 *
 * Paycheck estimates saved the old way ("Save to Income") are left in storage
 * but hidden while their job still exists — those hours are now counted
 * automatically, and showing both would count the same pay twice.
 */
export function mergeWorkIncome(income = [], jobs = [], derived = []) {
  const jobIds = new Set(jobs.map((j) => j.id));
  const kept = income.filter((i) => !(i.isWorkTimeEntry && i.jobId && jobIds.has(i.jobId)));
  return [...kept, ...derived];
}

/**
 * A yearly figure from the hours-based paychecks: the average paycheck for
 * each job this year (or overall, if none yet this year), times how many
 * paychecks that job pays in a year. Adding every paycheck up and multiplying
 * by 12 — what one-off monthly entries otherwise get — would wildly overstate it.
 */
export function annualizeWorkIncome(entries = [], useGross = true, year = new Date().getFullYear()) {
  const byJob = new Map();
  for (const e of entries) {
    if (!e.isAutoWorkIncome) continue;
    if (!byJob.has(e.jobId)) byJob.set(e.jobId, []);
    byJob.get(e.jobId).push(e);
  }
  let total = 0;
  for (const list of byJob.values()) {
    const thisYear = list.filter((e) => e.month.startsWith(String(year)));
    const pool = thisYear.length ? thisYear : list;
    const avg = pool.reduce((s, e) => s + ((useGross ? e.grossAmount : e.amount) || 0), 0) / pool.length;
    const freq = list[0].payFrequency;
    const perYear = freq === 'weekly' ? 52 : freq === 'biweekly' ? 26 : 12;
    total += avg * perYear;
  }
  return round2(total);
}
