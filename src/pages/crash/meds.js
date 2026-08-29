// The regimen: what you take, when you're meant to take it, and what that does
// to tonight.
//
// `window.js` answers "you took something at 3pm, when does it get hard?" from
// one number on the kit. That's enough when there's one dose a day. It isn't
// enough when a long-acting dose in the morning is followed by a smaller one in
// the afternoon, because then the evening lands in two different places
// depending on whether the second one happened. This module knows the
// difference, and knows it *before* the evening, which is the whole point.
//
// What it does NOT do, and must never do: advise. Every name, time, threshold
// and rule in here was typed in by the user. This file does arithmetic on their
// numbers and hands the result back. There is no default medication, no
// suggested dose and no opinion about either.
//
// Pure and Firebase-free so `node --test` can run it, and so the CommonJS port
// in functions/crashRegimen.js can be held to the same answers.

import {
  HOUR_MS, LOOKBACK_MS, DEFAULT_ONSET_HOURS, DEFAULT_DURATION_HOURS,
} from './window.js';

export const MINUTE_MS = 60 * 1000;
export const DEFAULT_GRACE_MINUTES = 45;
export const DEFAULT_LOW_DAYS = 7;

// How long after a rule's moment it still counts as "now". Past this it's not a
// reminder any more, it's a nag about something you already did or didn't.
export const RULE_GRACE_MS = 60 * MINUTE_MS;

// A schedule chain is user-built, so it can be user-broken. This bounds the
// resolution of `mode: 'offset'` meds pointing at each other.
const MAX_CHAIN_DEPTH = 8;

export const DEFAULT_MED = {
  name: '',
  strength: '',
  kind: 'long', // 'long' | 'booster' | 'other' — affects wording, never the maths
  schedule: { mode: 'clock', time: '08:00', afterMedId: null, offsetHours: 6 },
  graceMinutes: DEFAULT_GRACE_MINUTES,
  onsetHours: DEFAULT_ONSET_HOURS,
  durationHours: DEFAULT_DURATION_HOURS,
  supply: { onHand: null, perDose: 1, lowDays: DEFAULT_LOW_DAYS, refillFrom: '', lastFilledAt: null },
  rules: [],
  active: true,
};

export const MED_KINDS = [
  { key: 'long', label: 'Long-acting' },
  { key: 'booster', label: 'Booster' },
  { key: 'other', label: 'Other' },
];

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegative(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** null, undefined and '' mean "not counting pills" — not "no pills left". */
function countOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Merge a saved med over the defaults, the same way `mergeKit` does for the
 * kit: a med saved before a field existed still reads correctly afterwards.
 */
export function normalizeMed(med = {}) {
  const schedule = { ...DEFAULT_MED.schedule, ...(med.schedule || {}) };
  const supply = { ...DEFAULT_MED.supply, ...(med.supply || {}) };
  return {
    ...DEFAULT_MED,
    ...med,
    schedule,
    supply,
    graceMinutes: nonNegative(med.graceMinutes, DEFAULT_GRACE_MINUTES),
    onsetHours: positive(med.onsetHours, DEFAULT_ONSET_HOURS),
    durationHours: positive(med.durationHours, DEFAULT_DURATION_HOURS),
    rules: Array.isArray(med.rules) ? med.rules : [],
  };
}

export function activeMeds(meds) {
  if (!Array.isArray(meds)) return [];
  return meds.filter(Boolean).map(normalizeMed).filter((m) => m.active !== false);
}

// ── Clock helpers ───────────────────────────────────────────────────────────
// Everything here is in the device's local time, which is the time the user
// typed and the time they live in.

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sameLocalDay(a, b) {
  return startOfDay(a) === startOfDay(b);
}

/** "08:00" on the local day containing `dayTs`. Null if the string is unusable. */
export function atClock(dayTs, time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(dayTs);
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

// ── Doses ───────────────────────────────────────────────────────────────────

/** Doses actually taken, newest first. A dose marked skipped is not a dose. */
export function takenDoses(doses) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number' && d.status !== 'skipped')
    .sort((a, b) => b.takenAt - a.takenAt);
}

/** The dose logged for this med on the local day containing `dayTs`, if any. */
export function doseForMedOnDay(medId, doses, dayTs) {
  return takenDoses(doses).find(
    (d) => d.medId === medId && sameLocalDay(d.takenAt, dayTs),
  ) || null;
}

/**
 * When each med was due on the day containing `now`, and whether it happened.
 *
 * `mode: 'clock'` reads straight off the wall clock. `mode: 'offset'` hangs off
 * another med: the anchor's *actual* logged time when there is one, so a late
 * morning dose pushes the booster late too, and the anchor's scheduled time as
 * a fallback so the row still says something before anything is logged.
 *
 * States: 'upcoming' (not yet), 'due' (now, or inside the grace), 'taken',
 * 'skipped' (past the grace with nothing logged), 'unknown' (an offset med
 * whose anchor can't be resolved — a broken chain, or a deleted anchor).
 */
export function expectedDosesToday(meds, doses, now = Date.now()) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const resolve = (med, depth) => {
    if (depth > MAX_CHAIN_DEPTH) return null;
    if (med.schedule.mode === 'offset') {
      const anchor = byId.get(med.schedule.afterMedId);
      if (!anchor) return null;
      const logged = doseForMedOnDay(anchor.id, doses, now);
      const base = logged ? logged.takenAt : resolve(anchor, depth + 1);
      if (base == null) return null;
      return base + positive(med.schedule.offsetHours, 6) * HOUR_MS;
    }
    return atClock(now, med.schedule.time);
  };

  return list.map((med) => {
    const expectedAt = resolve(med, 0);
    const dose = doseForMedOnDay(med.id, doses, now);
    const graceEnds = expectedAt == null ? null : expectedAt + med.graceMinutes * MINUTE_MS;

    let state;
    if (dose) state = 'taken';
    else if (expectedAt == null) state = 'unknown';
    else if (now < expectedAt) state = 'upcoming';
    else if (now <= graceEnds) state = 'due';
    else state = 'skipped';

    return { med, medId: med.id, expectedAt, graceEnds, dose, state };
  });
}

/** The next dose still to come today, for a one-line summary. */
export function nextExpected(meds, doses, now = Date.now()) {
  return expectedDosesToday(meds, doses, now)
    .filter((e) => (e.state === 'upcoming' || e.state === 'due') && e.expectedAt != null)
    .sort((a, b) => a.expectedAt - b.expectedAt)[0] || null;
}

// ── The window ──────────────────────────────────────────────────────────────

/** The span a single logged dose is responsible for. */
function spanFor(dose, med, kit) {
  const onset = positive(med?.onsetHours, positive(kit.onsetHours, DEFAULT_ONSET_HOURS));
  const duration = positive(med?.durationHours, positive(kit.durationHours, DEFAULT_DURATION_HOURS));
  const start = dose.takenAt + onset * HOUR_MS;
  return {
    start,
    end: start + duration * HOUR_MS,
    doseId: dose.id,
    takenAt: dose.takenAt,
    medId: dose.medId || null,
  };
}

/**
 * Tonight's window, read off the whole regimen rather than off one dose.
 *
 * The governing span is the one that ends last — the last thing still working.
 * A morning long-acting dose and an afternoon booster produce two spans, and
 * taking the booster is exactly what moves the evening later.
 *
 * The interesting case is the one that hasn't happened yet. While a booster is
 * still expected — not yet due, or inside its grace — the honest answer is "it
 * depends": the window is the long-acting one, marked `provisional`, with
 * `wouldBecome` carrying where it moves to if the booster gets logged. Once the
 * grace passes with nothing logged the booster is treated as skipped, the flag
 * clears, and the earlier window is the real one. Logging it late, at any
 * point, recomputes straight back out.
 *
 * A dose with no `medId` — anything logged before medications existed — falls
 * back to the kit's own onset and duration, so old rows keep working untouched.
 */
export function effectiveWindow(meds, doses, kit = {}, now = Date.now()) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const spans = takenDoses(doses)
    .filter((d) => d.takenAt <= now && now - d.takenAt <= LOOKBACK_MS)
    .map((d) => spanFor(d, byId.get(d.medId), kit));

  if (spans.length === 0) return null;

  const governing = spans.reduce((a, b) => (b.end > a.end ? b : a));

  // A dose still expected today can only move the window later, never earlier.
  let wouldBecome = null;
  let pending = null;
  for (const e of expectedDosesToday(meds, doses, now)) {
    if (e.state !== 'upcoming' && e.state !== 'due') continue;
    if (e.expectedAt == null) continue;
    const hypothetical = spanFor(
      { id: `pending-${e.medId}`, takenAt: e.expectedAt, medId: e.medId },
      e.med,
      kit,
    );
    if (hypothetical.end <= governing.end) continue;
    if (!wouldBecome || hypothetical.end > wouldBecome.end) {
      wouldBecome = hypothetical;
      pending = e;
    }
  }

  return {
    ...governing,
    provisional: wouldBecome != null,
    wouldBecome,
    pendingMedId: pending ? pending.medId : null,
    pendingExpectedAt: pending ? pending.expectedAt : null,
  };
}

// ── Rules ───────────────────────────────────────────────────────────────────

/**
 * Every rule on the regimen, with the moment it applies to today.
 *
 * A negative `offsetMinutes` is before the dose ("eat first"), zero is at it,
 * positive is after. Rules attached to a dose whose time can't be resolved get
 * `at: null` and are simply not due.
 */
export function ruleMoments(meds, doses, now = Date.now()) {
  const out = [];
  for (const e of expectedDosesToday(meds, doses, now)) {
    for (const rule of e.med.rules || []) {
      if (!rule || !String(rule.text || '').trim()) continue;
      const offset = Number(rule.offsetMinutes);
      const at = e.expectedAt == null || !Number.isFinite(offset)
        ? null
        : e.expectedAt + offset * MINUTE_MS;
      out.push({
        medId: e.medId, med: e.med, rule, ruleId: rule.id,
        at, offsetMinutes: Number.isFinite(offset) ? offset : 0,
        doseState: e.state,
      });
    }
  }
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

/**
 * The rules whose moment has just arrived.
 *
 * A rule about what to do *before* a dose stops being due once the dose is
 * taken — telling you to eat first, after you've swallowed it, is worse than
 * saying nothing.
 */
export function dueRules(meds, doses, now = Date.now(), grace = RULE_GRACE_MS) {
  return ruleMoments(meds, doses, now).filter((r) => {
    if (r.at == null) return false;
    if (now < r.at || now - r.at > grace) return false;
    if (r.offsetMinutes < 0 && r.doseState === 'taken') return false;
    return true;
  });
}

/** The rules to show on a dose card that hasn't been logged yet. */
export function rulesForMed(med) {
  const m = normalizeMed(med);
  return (m.rules || [])
    .filter((r) => r && String(r.text || '').trim())
    .sort((a, b) => Number(a.offsetMinutes || 0) - Number(b.offsetMinutes || 0));
}

/** "1h before" / "at the dose" / "4h after" — an offset in words. */
export function formatOffset(minutes) {
  const n = Number(minutes) || 0;
  if (n === 0) return 'at the dose';
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return `${parts.join(' ')} ${n < 0 ? 'before' : 'after'}`;
}

// ── Supply ──────────────────────────────────────────────────────────────────

/**
 * What's left, in days rather than pills, because days are the unit the
 * pharmacy conversation happens in.
 *
 * One scheduled dose per med per day is the model, so doses left and days left
 * are the same number. `refillFrom` is the date the fill window opens — for a
 * controlled substance that date is the constraint, not the pill count.
 */
export function supplyStatus(med, now = Date.now()) {
  const m = normalizeMed(med);
  const s = m.supply || {};
  const onHand = countOrNull(s.onHand);
  const perDose = positive(s.perDose, 1);
  const lowDays = nonNegative(s.lowDays, DEFAULT_LOW_DAYS);
  const tracked = onHand != null;

  const parsed = parseISODate(s.refillFrom);
  const refillAt = Number.isFinite(parsed) ? parsed : null;
  const refillOpen = refillAt != null && now >= refillAt;
  const daysUntilRefill = refillAt == null
    ? null
    : Math.round((refillAt - startOfDay(now)) / (24 * HOUR_MS));

  if (!tracked) {
    return {
      tracked: false, onHand: null, perDose, dosesLeft: null, daysLeft: null,
      low: false, lowDays, refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
    };
  }

  const dosesLeft = Math.floor(onHand / perDose);
  return {
    tracked: true, onHand, perDose, dosesLeft, daysLeft: dosesLeft,
    low: dosesLeft <= lowDays, lowDays,
    refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
  };
}

/** "2026-09-04" as a local midnight, rather than the UTC one `new Date()` gives. */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** The supply after one dose is logged, or null when nothing is being counted. */
export function supplyAfterDose(med) {
  const m = normalizeMed(med);
  const onHand = countOrNull(m.supply.onHand);
  if (onHand == null) return null;
  const perDose = positive(m.supply.perDose, 1);
  return { ...m.supply, onHand: Math.max(0, onHand - perDose) };
}
