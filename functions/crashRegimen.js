// The regimen maths, for the scheduler.
//
// A CommonJS port of src/pages/crash/meds.js. The split is structural rather
// than chosen: the client is ESM and this deployment is CommonJS, and only the
// functions/ directory is uploaded, so the client module cannot be required
// from here.
//
// The old inline mirror of `latestDose` in index.js carried a comment asking
// whoever touched it to keep the two in step by hand. That was survivable for
// one subtraction. It isn't survivable for this, so the two implementations are
// pinned to the same recorded answers instead:
//
//   functions/fixtures/regimen-cases.json   inputs + expected outputs
//   functions/test/crashRegimen.test.js     asserts THIS file matches them
//   src/pages/crash/regimen.parity.test.js  asserts meds.js matches them
//
// Change one implementation without the other and one of those two tests goes
// red. Change the fixture and both do.
//
// One deliberate difference from the client: every day and clock calculation
// here is done in the user's configured time zone, not the server's. The client
// can use the device clock because the device is where the user is; this
// process runs in UTC and would otherwise schedule an 8 AM dose for 3 AM.

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const LOOKBACK_MS = 24 * HOUR_MS;
const DEFAULT_ONSET_HOURS = 4;
const DEFAULT_DURATION_HOURS = 5;
const DEFAULT_GRACE_MINUTES = 45;
const DEFAULT_LOW_DAYS = 7;
const RULE_GRACE_MS = 60 * MINUTE_MS;
const MAX_CHAIN_DEPTH = 8;

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

// ── Time zone helpers ───────────────────────────────────────────────────────

function tzParts(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function tzOffsetMs(ts, tz) {
  const p = tzParts(ts, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(ts / 1000) * 1000;
}

/** The instant of a wall-clock time on a given local date. Two passes so an
 *  instant near a DST transition resolves to the right side of it. */
function wallClock(year, month, day, hour, minute, tz) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive - tzOffsetMs(naive, tz);
  ts = naive - tzOffsetMs(ts, tz);
  return ts;
}

function startOfDay(ts, tz) {
  const p = tzParts(ts, tz);
  return wallClock(p.year, p.month, p.day, 0, 0, tz);
}

function sameLocalDay(a, b, tz) {
  return tzParts(a, tz).date === tzParts(b, tz).date;
}

/** "08:00" on the local day containing `dayTs`. Null if unusable. */
function atClock(dayTs, time, tz) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const p = tzParts(dayTs, tz);
  return wallClock(p.year, p.month, p.day, h, min, tz);
}

/** "2026-09-04" as local midnight in `tz`. */
function parseISODate(iso, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return NaN;
  return wallClock(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, tz);
}

// ── Meds ────────────────────────────────────────────────────────────────────

const DEFAULT_SCHEDULE = { mode: 'clock', time: '08:00', afterMedId: null, offsetHours: 6 };
const DEFAULT_SUPPLY = { onHand: null, perDose: 1, lowDays: DEFAULT_LOW_DAYS, refillFrom: '', lastFilledAt: null };

function normalizeMed(med) {
  const m = med || {};
  return {
    name: '', strength: '', kind: 'long', active: true,
    ...m,
    schedule: { ...DEFAULT_SCHEDULE, ...(m.schedule || {}) },
    supply: { ...DEFAULT_SUPPLY, ...(m.supply || {}) },
    graceMinutes: nonNegative(m.graceMinutes, DEFAULT_GRACE_MINUTES),
    onsetHours: positive(m.onsetHours, DEFAULT_ONSET_HOURS),
    durationHours: positive(m.durationHours, DEFAULT_DURATION_HOURS),
    rules: Array.isArray(m.rules) ? m.rules : [],
  };
}

function activeMeds(meds) {
  if (!Array.isArray(meds)) return [];
  return meds.filter(Boolean).map(normalizeMed).filter((m) => m.active !== false);
}

function takenDoses(doses) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number' && d.status !== 'skipped')
    .sort((a, b) => b.takenAt - a.takenAt);
}

function doseForMedOnDay(medId, doses, dayTs, tz) {
  return takenDoses(doses).find(
    (d) => d.medId === medId && sameLocalDay(d.takenAt, dayTs, tz),
  ) || null;
}

/** See expectedDosesToday in src/pages/crash/meds.js. */
function expectedDosesToday(meds, doses, now, tz) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const resolve = (med, depth) => {
    if (depth > MAX_CHAIN_DEPTH) return null;
    if (med.schedule.mode === 'offset') {
      const anchor = byId.get(med.schedule.afterMedId);
      if (!anchor) return null;
      const logged = doseForMedOnDay(anchor.id, doses, now, tz);
      const base = logged ? logged.takenAt : resolve(anchor, depth + 1);
      if (base == null) return null;
      return base + positive(med.schedule.offsetHours, 6) * HOUR_MS;
    }
    return atClock(now, med.schedule.time, tz);
  };

  return list.map((med) => {
    const expectedAt = resolve(med, 0);
    const dose = doseForMedOnDay(med.id, doses, now, tz);
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

function spanFor(dose, med, kit) {
  const onset = positive(med && med.onsetHours, positive(kit.onsetHours, DEFAULT_ONSET_HOURS));
  const duration = positive(med && med.durationHours, positive(kit.durationHours, DEFAULT_DURATION_HOURS));
  const start = dose.takenAt + onset * HOUR_MS;
  return {
    start, end: start + duration * HOUR_MS,
    doseId: dose.id, takenAt: dose.takenAt, medId: dose.medId || null,
  };
}

/** See effectiveWindow in src/pages/crash/meds.js. */
function effectiveWindow(meds, doses, kit, now, tz) {
  const k = kit || {};
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const spans = takenDoses(doses)
    .filter((d) => d.takenAt <= now && now - d.takenAt <= LOOKBACK_MS)
    .map((d) => spanFor(d, byId.get(d.medId), k));

  if (spans.length === 0) return null;

  const governing = spans.reduce((a, b) => (b.end > a.end ? b : a));

  let wouldBecome = null;
  let pending = null;
  for (const e of expectedDosesToday(meds, doses, now, tz)) {
    if (e.state !== 'upcoming' && e.state !== 'due') continue;
    if (e.expectedAt == null) continue;
    const hypothetical = spanFor(
      { id: `pending-${e.medId}`, takenAt: e.expectedAt, medId: e.medId },
      e.med, k,
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

/** See ruleMoments in src/pages/crash/meds.js. */
function ruleMoments(meds, doses, now, tz) {
  const out = [];
  for (const e of expectedDosesToday(meds, doses, now, tz)) {
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
  return out.sort((a, b) => (a.at == null ? Infinity : a.at) - (b.at == null ? Infinity : b.at));
}

/** See dueRules in src/pages/crash/meds.js. */
function dueRules(meds, doses, now, tz, grace) {
  const g = typeof grace === 'number' ? grace : RULE_GRACE_MS;
  return ruleMoments(meds, doses, now, tz).filter((r) => {
    if (r.at == null) return false;
    if (now < r.at || now - r.at > g) return false;
    if (r.offsetMinutes < 0 && r.doseState === 'taken') return false;
    return true;
  });
}

/** See supplyStatus in src/pages/crash/meds.js. */
function supplyStatus(med, now, tz) {
  const m = normalizeMed(med);
  const s = m.supply || {};
  const onHand = countOrNull(s.onHand);
  const perDose = positive(s.perDose, 1);
  const lowDays = nonNegative(s.lowDays, DEFAULT_LOW_DAYS);
  const tracked = onHand != null;

  const parsed = parseISODate(s.refillFrom, tz);
  const refillAt = Number.isFinite(parsed) ? parsed : null;
  const refillOpen = refillAt != null && now >= refillAt;
  const daysUntilRefill = refillAt == null
    ? null
    : Math.round((refillAt - startOfDay(now, tz)) / (24 * HOUR_MS));

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

module.exports = {
  HOUR_MS, MINUTE_MS, LOOKBACK_MS, RULE_GRACE_MS,
  DEFAULT_ONSET_HOURS, DEFAULT_DURATION_HOURS, DEFAULT_GRACE_MINUTES, DEFAULT_LOW_DAYS,
  normalizeMed, activeMeds, takenDoses, doseForMedOnDay,
  startOfDay, sameLocalDay, atClock, parseISODate,
  expectedDosesToday, effectiveWindow, ruleMoments, dueRules, supplyStatus,
};
