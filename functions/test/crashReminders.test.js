// Unit tests for the Crash Protocol reminders: which of the two notifications
// is due, and — the one that really matters — that neither ever carries the
// user's own words.
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
const { _internal } = require('../index');
const { collectCrashMessages, crashLatestDose, RESET_APP_URL } = _internal;

const TZ = 'America/New_York';
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-07-26T18:00:00Z').getTime();

const withDose = (takenAt, over = {}) => ({
  fcmToken: 'tok',
  crashKit: { onsetHours: 4, durationHours: 5, doseTracking: true },
  crashDoses: [{ id: 'd1', takenAt }],
  crashDrafts: [],
  notifPrefs: { crash: { timerEnd: true, windowHeadsUp: true, escrowOpened: true } },
  ...over,
});

const tags = (msgs) => msgs.map((m) => m.tag);

// ── the dose that governs ───────────────────────────────────────────────────

test('the most recent dose already taken is the one that governs', () => {
  const doses = [
    { id: 'early', takenAt: NOW - 6 * HOUR },
    { id: 'late', takenAt: NOW - 2 * HOUR },
    { id: 'future', takenAt: NOW + HOUR },
  ];
  assert.strictEqual(crashLatestDose(doses, NOW).id, 'late');
});

test('a dose older than a day governs nothing', () => {
  assert.strictEqual(crashLatestDose([{ id: 'a', takenAt: NOW - 30 * HOUR }], NOW), null);
  assert.strictEqual(crashLatestDose([], NOW), null);
  assert.strictEqual(crashLatestDose(undefined, NOW), null);
});

// ── window heads-up ─────────────────────────────────────────────────────────

test('fires in the half hour before the window opens', () => {
  // Dose 3h40m ago, onset 4h → the window opens in 20 minutes.
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000));
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, NOW, TZ)), ['crash-window-d1']);
});

test('does not fire while the window is still hours away', () => {
  const data = withDose(NOW - HOUR); // opens in 3 hours
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('does not fire once the window is already open', () => {
  const data = withDose(NOW - 5 * HOUR); // opened an hour ago
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('fires once and not again on the next tick', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000));
  const first = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(first.length, 1);
  const sent = { [first[0].tag]: NOW };
  assert.deepStrictEqual(collectCrashMessages(data, sent, NOW + 15 * 60 * 1000, TZ), []);
});

test('respects the user turning the heads-up off', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000), {
    notifPrefs: { crash: { windowHeadsUp: false, escrowOpened: true } },
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('respects dose tracking being switched off entirely', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000), {
    crashKit: { onsetHours: 4, doseTracking: false },
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('a user who has never logged a dose gets nothing', () => {
  const data = withDose(NOW, { crashDoses: [] });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

// ── escrow opened ───────────────────────────────────────────────────────────

const withDraft = (over = {}) => ({
  fcmToken: 'tok',
  crashKit: { doseTracking: false },
  crashDoses: [],
  crashDrafts: [{ id: 'x1', text: 'the giant text I nearly sent', status: 'held', releaseAt: NOW - HOUR }],
  notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  ...over,
});

test('fires once a held draft has passed its release time', () => {
  const msgs = collectCrashMessages(withDraft(), {}, NOW, TZ);
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0].tag, /^crash-escrow-/);
});

test('does not fire before the release time', () => {
  const data = withDraft({
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW + HOUR }],
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('a draft already dealt with does not fire', () => {
  for (const status of ['sent', 'dropped']) {
    const data = withDraft({
      crashDrafts: [{ id: 'x1', text: 'held', status, releaseAt: NOW - HOUR }],
    });
    assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), [], status);
  }
});

test('an ignored draft nudges the next morning and then stops nagging', () => {
  const data = withDraft({
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW - 3 * 24 * HOUR }],
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('several held drafts produce one nudge, not one each', () => {
  const data = withDraft({
    crashDrafts: [
      { id: 'a', text: 'one', status: 'held', releaseAt: NOW - HOUR },
      { id: 'b', text: 'two', status: 'held', releaseAt: NOW - HOUR },
    ],
  });
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0].body, /2 things/);
});

test('respects the user turning the escrow nudge off', () => {
  const data = withDraft({ notifPrefs: { crash: { escrowOpened: false } } });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

// ── the guarantee ───────────────────────────────────────────────────────────

test('no notification ever contains the user’s own words', () => {
  const secret = 'he doesn’t care about me and I am going to say so';
  const data = {
    fcmToken: 'tok',
    crashKit: { onsetHours: 4, doseTracking: true },
    crashDoses: [{ id: 'd1', takenAt: NOW - (3 * HOUR + 40 * 60 * 1000) }],
    crashDrafts: [{ id: 'x1', text: secret, status: 'held', releaseAt: NOW - HOUR }],
    crashSessions: [{ id: 's1', stories: [{ id: 'st', text: secret }], outcomeNote: secret }],
    notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  };
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 2, 'both notifications should be due here');
  for (const m of msgs) {
    const blob = `${m.title} ${m.body}`;
    assert.ok(!blob.includes(secret), `${m.tag} leaked the draft text`);
    assert.ok(!blob.includes('doesn’t care'), `${m.tag} leaked a fragment`);
  }
});

test('missing prefs default to on rather than crashing', () => {
  const data = withDraft({ notifPrefs: undefined });
  assert.strictEqual(collectCrashMessages(data, {}, NOW, TZ).length, 1);
});

test('both notifications open the installed Reset app', () => {
  const data = {
    fcmToken: 'tok',
    crashKit: { onsetHours: 4, doseTracking: true },
    crashDoses: [{ id: 'd1', takenAt: NOW - (3 * HOUR + 40 * 60 * 1000) }],
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW - HOUR }],
    notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  };
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 2);
  for (const m of msgs) {
    assert.strictEqual(m.url, RESET_APP_URL);
    // Inside the standalone app's manifest scope, or the tap opens the finance
    // app in a browser tab instead of the installed one.
    assert.ok(m.url.startsWith('/ExpenseTracker/reset/'), m.tag);
  }
});
