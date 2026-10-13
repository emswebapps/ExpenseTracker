// 2025/2026 Arkansas paycheck tax estimates (annualized percentage method)
// Based on IRS Pub 15-T (federal) and AR DFA withholding tables

const FICA_WAGE_BASE = 176100; // 2025 SS wage base

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Arkansas SIT withholding (annualized method)
function calcARSIT(taxablePerPeriod, periodsPerYear, filingStatus) {
  const annual = taxablePerPeriod * periodsPerYear;
  const stdDeduction = filingStatus === 'mfj' ? 4400 : 2200;
  const net = Math.max(0, annual - stdDeduction);

  let tax = 0;
  // AR 2025 brackets
  if (net > 89500) tax += (net - 89500) * 0.049;
  if (net > 23800) tax += (Math.min(net, 89500) - 23800) * 0.044;
  if (net > 14100) tax += (Math.min(net, 23800) - 14100) * 0.034;
  if (net > 10000) tax += (Math.min(net, 14100) - 10000) * 0.03;
  if (net > 5000) tax += (Math.min(net, 10000) - 5000) * 0.02;

  // Personal exemption credit ($29 each)
  const credits = filingStatus === 'mfj' ? 2 : 1;
  tax = Math.max(0, tax - credits * 29);

  return Math.max(0, round2(tax / periodsPerYear));
}

// Federal income tax withholding (2025 Pub 15-T percentage method)
function calcFIT(taxablePerPeriod, periodsPerYear, filingStatus) {
  const annual = taxablePerPeriod * periodsPerYear;
  const stdDeduction = filingStatus === 'mfj' ? 30000 : 15000;
  const net = Math.max(0, annual - stdDeduction);

  let tax = 0;
  const brackets = filingStatus === 'mfj'
    ? [
        [0, 23850, 0.10], [23850, 96950, 0.12], [96950, 206700, 0.22],
        [206700, 394600, 0.24], [394600, 501050, 0.32], [501050, 731200, 0.35],
        [731200, Infinity, 0.37],
      ]
    : [
        [0, 11925, 0.10], [11925, 48475, 0.12], [48475, 103350, 0.22],
        [103350, 197300, 0.24], [197300, 250525, 0.32], [250525, 626350, 0.35],
        [626350, Infinity, 0.37],
      ];

  for (const [lo, hi, rate] of brackets) {
    if (net > lo) tax += (Math.min(net, hi) - lo) * rate;
  }

  return Math.max(0, round2(tax / periodsPerYear));
}

// Calculate a full paycheck from hours and job config
export function calcPaycheck({ job, regularHours, overtimeHours }) {
  const periodsPerYear = job.payFrequency === 'weekly' ? 52 : 26;
  const filingStatus = job.filingStatus || 'single';
  const otRate = job.otRate || round2(job.hourlyRate * 1.5);

  const regularPay = round2(regularHours * job.hourlyRate);
  const otPay = round2(overtimeHours * otRate);
  const grossPay = round2(regularPay + otPay);

  // IRA/401k: supports flat $ or % of gross (pre-tax for FIT/SIT, not FICA)
  const iraDeduction = job.iraType === 'percent'
    ? round2(grossPay * ((job.iraPercent || 0) / 100))
    : round2(job.iraPerPeriod || 0);
  const ficaTaxable = grossPay;
  const fitTaxable = round2(grossPay - iraDeduction);

  // FICA capped at wage base
  const ficaCap = round2((FICA_WAGE_BASE / periodsPerYear) * 0.062);
  const fica = Math.min(round2(ficaTaxable * 0.062), ficaCap);
  const medi = round2(ficaTaxable * 0.0145);
  const fit = calcFIT(fitTaxable, periodsPerYear, filingStatus);
  const sitAR = calcARSIT(fitTaxable, periodsPerYear, filingStatus);

  const totalDeductions = round2(iraDeduction + fit + fica + medi + sitAR);
  const netPay = round2(grossPay - totalDeductions);

  return {
    regularHours, overtimeHours, regularPay, otPay, grossPay,
    iraDeduction, iraPercent: job.iraType === 'percent' ? (job.iraPercent || 0) : 0,
    fitTaxable, ficaTaxable,
    fit, fica, medi, sitAR,
    totalDeductions, netPay,
    periodsPerYear,
  };
}

// Calculate OT breakdown from an array of shifts for a job
// weekStartDay: 0=Sun (default for EMS/fire/many employers), 1=Mon (FLSA default)
// Shifts with otExempt=true (PTO, holiday pay) are always regular rate and
// never counted toward the weekly OT threshold.
export function calcHoursFromShifts(shifts, job) {
  const weekStartDay = job.weekStartDay ?? 0;
  const byWeek = {};
  let exemptRegular = 0;

  for (const sh of shifts) {
    if (sh.otExempt) {
      exemptRegular += sh.hoursWorked;
      continue;
    }
    const d = new Date(sh.date + 'T12:00:00');
    const dow = d.getDay();
    const daysFromStart = (dow - weekStartDay + 7) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - daysFromStart);
    const wk = weekStart.toISOString().slice(0, 10);
    byWeek[wk] = (byWeek[wk] || 0) + sh.hoursWorked;
  }

  let regularHours = exemptRegular;
  let overtimeHours = 0;
  const weeklyLimit = 40;

  for (const total of Object.values(byWeek)) {
    regularHours += Math.min(total, weeklyLimit);
    overtimeHours += Math.max(0, total - weeklyLimit);
  }

  return { regularHours: round2(regularHours), overtimeHours: round2(overtimeHours) };
}

// Given a job with payPeriodStartDate and payFrequency, return current & previous pay period date ranges
export function getPayPeriodBounds(job) {
  if (!job.payPeriodStartDate) return null;
  const cycle = job.payFrequency === 'weekly' ? 7 : 14;
  const refMs = new Date(job.payPeriodStartDate + 'T12:00:00').getTime();
  const nowMs = new Date().setHours(12, 0, 0, 0);
  const dayMs = 1000 * 60 * 60 * 24;
  const daysDiff = Math.floor((nowMs - refMs) / dayMs);
  const periodIdx = Math.floor(daysDiff / cycle);

  const addD = (base, n) => {
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return {
    current: {
      start: addD(job.payPeriodStartDate, periodIdx * cycle),
      end: addD(job.payPeriodStartDate, (periodIdx + 1) * cycle - 1),
    },
    previous: {
      start: addD(job.payPeriodStartDate, (periodIdx - 1) * cycle),
      end: addD(job.payPeriodStartDate, periodIdx * cycle - 1),
    },
  };
}

// The payday that pays out a period: the first one on or after the period's
// last day, counted from the job's Payday Date. Null when the job has no
// payday set. Day arithmetic is done in UTC so clock changes can't shift it.
export function getPaydayForPeriod(job, periodEnd) {
  if (!job?.payDate || !periodEnd) return null;
  const cycle = job.payFrequency === 'weekly' ? 7 : 14;
  const dayNum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  const ref = dayNum(job.payDate);
  const steps = Math.ceil((dayNum(periodEnd) - ref) / cycle);
  return new Date((ref + steps * cycle) * 86400000).toISOString().slice(0, 10);
}

// Return the pay period { start, end } at a given offset from the current period.
// offset=0: current period, offset=-1: previous period, offset=-2: two periods back, etc.
export function getPayPeriodAtOffset(job, offset) {
  if (!job.payPeriodStartDate) return null;
  const cycle = job.payFrequency === 'weekly' ? 7 : 14;
  const refMs = new Date(job.payPeriodStartDate + 'T12:00:00').getTime();
  const nowMs = new Date().setHours(12, 0, 0, 0);
  const dayMs = 1000 * 60 * 60 * 24;
  const daysDiff = Math.floor((nowMs - refMs) / dayMs);
  const periodIdx = Math.floor(daysDiff / cycle) + offset;

  const addD = (base, n) => {
    const d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  return {
    start: addD(job.payPeriodStartDate, periodIdx * cycle),
    end: addD(job.payPeriodStartDate, (periodIdx + 1) * cycle - 1),
  };
}
