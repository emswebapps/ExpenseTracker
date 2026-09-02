const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const listOps = require('./listOps');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Where the app is actually served. This repo is emswebapps/ExpenseTracker with
// Pages enabled, so the project site is https://emswebapps.github.io/ExpenseTracker/
// — the old pairamedic host predates a rename. Override with the APP_ORIGIN
// env var at deploy time rather than editing this, and keep it in one place:
// a wrong value here silently breaks every notification icon and every tap.
const SITE_ORIGIN = process.env.APP_ORIGIN || 'https://emswebapps.github.io';
const SITE_BASE = `${SITE_ORIGIN}/ExpenseTracker/`;
const ICON = `${SITE_BASE}app-icon.jpeg`;
const DEFAULT_TZ = 'America/New_York';

/**
 * Send one push to a user, deleting the token if FCM says it's dead.
 * Returns false when the token is gone and further sends should be skipped.
 */
async function sendPush(userPath, token, msg) {
  try {
    await messaging.send({
      token,
      notification: { title: msg.title, body: msg.body },
      data: { tag: msg.tag, url: msg.url || '/ExpenseTracker/' },
      webpush: {
        // fcmOptions.link has to be absolute — msg.url is a site-relative path,
        // so joining it is what makes the tap land anywhere at all.
        fcmOptions: { link: msg.url ? new URL(msg.url, SITE_ORIGIN).href : SITE_BASE },
        notification: {
          icon: ICON,
          badge: ICON,
          tag: msg.tag,
          requireInteraction: !!msg.requireInteraction,
        },
      },
    });
    return true;
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered') {
      await db.doc(`${userPath}/data/app`).update({ fcmToken: admin.firestore.FieldValue.delete() });
      return false;
    }
    console.error('Push send failed:', e.message);
    return true;
  }
}

// ── Email delivery (Firebase "Trigger Email from Firestore" extension) ───────
// Writing a document to this collection makes the extension send it over the
// configured SMTP server (IONOS). Clients can't write here — only the admin
// SDK (which bypasses security rules) and the extension touch this collection.
const MAIL_COLLECTION = 'mail';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A small, email-client-friendly HTML body. */
function emailHtml(title, lines) {
  const body = lines
    .map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(l)}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">`
    + `<tr><td style="background:#4f46e5;padding:16px 20px;color:#ffffff;font-weight:700;font-size:16px;">ExpenseTracker</td></tr>`
    + `<tr><td style="padding:20px;">`
    + `<h1 style="margin:0 0 12px;font-size:18px;color:#0f172a;">${escapeHtml(title)}</h1>`
    + body
    + `<p style="margin:18px 0 0;font-size:12px;color:#94a3b8;">You're receiving this because email notifications are turned on in ExpenseTracker → Settings.</p>`
    + `</td></tr></table></body></html>`;
}

/** Queue one email for the Trigger Email extension to deliver. */
async function enqueueEmail(to, subject, title, lines) {
  await db.collection(MAIL_COLLECTION).add({
    to: Array.isArray(to) ? to : [to],
    message: {
      subject,
      text: [title, '', ...lines].join('\n'),
      html: emailHtml(title, lines),
    },
  });
}

/**
 * The address to email for this user, or null when email delivery is off.
 * Uses the address set in Settings, falling back to the account's auth email.
 */
async function resolveRecipient(uid, data) {
  const pref = data.notifPrefs && data.notifPrefs.email;
  if (!pref || !pref.enabled) return null;
  let addr = (pref.address || '').trim();
  if (!addr) {
    try {
      const u = await admin.auth().getUser(uid);
      addr = (u && u.email) || '';
    } catch (e) {
      console.error(`resolveRecipient: could not read auth email for ${uid}:`, e.message);
    }
  }
  return addr || null;
}

// ── Daily summary (bills, commitments, goals, projects, work log) ───────────
// The scheduler ticks every 15 minutes; each user's summary goes out on the
// first tick at or after the time they picked in their own time zone, once per
// local day. `notifState.dailyRunDate` is what makes it once-per-day.

const DAILY_DEFAULT_TIME = '08:00';
// Last tick of a local day. A later choice than this would never be reached, so
// it fires on this tick instead of being lost.
const LAST_TICK_MINUTES = 23 * 60 + 45;

/** Local calendar date ("YYYY-MM-DD") and minutes past local midnight in `tz`. */
function localDateAndMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

/** Minutes past midnight for an "HH:MM" string, or null if unparseable. */
function timeToMinutes(str) {
  const [h, m] = String(str || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Whole days from one "YYYY-MM-DD" to another. */
function daysBetween(fromISO, toISO) {
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const ms = parse(toISO) - parse(fromISO);
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}

/** The day-of-month that follows `localDate`, handling month ends. */
function tomorrowDayOfMonth(localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).getUTCDate();
}

/**
 * Every reminder that applies to `localDate`, tagged with the category that
 * decides whether each channel wants it. Pure, so the windows are testable.
 * Building the full set here — rather than filtering as we go — is what lets
 * push and email be configured independently of one another.
 *
 * @returns {Array<{title, body, tag, category, kind?}>}
 */
function collectDailyMessages(data, localDate) {
  const {
    bills = [], commitments = [], plannedExpenses = [], projects = [],
    shoppingLists = [], shoppingItems = [], notifPrefs,
  } = data;
  const daysBefore = notifPrefs?.commitments?.daysBefore ?? 3;
  const mk = localDate.slice(0, 7);
  const todayDay = Number(localDate.slice(8, 10));
  const tomorrowDay = tomorrowDayOfMonth(localDate);

  const messages = [];

  // ── Today's plan ──
  // One message for the whole day rather than one per list: the digest sends
  // each message as its own push, and four task lists would otherwise mean four
  // notifications before breakfast.
  //
  // This is the counterpart to a weekly planner list. The per-task reminders
  // fire at their own due times through `todoReminders`; this is the morning
  // read of what the day holds, which is the thing a paper week gave you and a
  // pile of individual alerts doesn't.
  const taskLists = new Map(
    shoppingLists.filter((l) => TASK_LIST_TYPES.includes(l.type) && !l.archived).map((l) => [l.id, l]),
  );
  const dueToday = [];
  let overdueCount = 0;
  for (const item of shoppingItems) {
    if (!taskLists.has(item.listId)) continue;
    if (itemIsHeading(item)) continue;                    // a day label, not work
    if (item.status && item.status !== 'pending') continue;
    if (!item.dueDate) continue;
    if (item.dueDate === localDate) dueToday.push(item);
    else if (item.dueDate < localDate) overdueCount += 1;
  }

  if (dueToday.length > 0 || overdueCount > 0) {
    const named = dueToday.slice(0, 4).map((i) => i.name);
    const unnamed = dueToday.length - named.length;
    const summary = [
      named.join(', '),
      unnamed > 0 ? `+${unnamed} more` : '',
    ].filter(Boolean).join(' ');
    const late = overdueCount > 0
      ? `${overdueCount} ${overdueCount === 1 ? 'task is' : 'tasks are'} overdue`
      : '';

    messages.push({
      title: dueToday.length > 0
        ? `Today: ${dueToday.length} ${dueToday.length === 1 ? 'task' : 'tasks'}`
        : `${overdueCount} ${overdueCount === 1 ? 'task is' : 'tasks are'} overdue`,
      body: [summary, late].filter(Boolean).join(' · ') || 'Nothing due today',
      // The email gets the full list rather than the truncated one — there's
      // room for it there, and the point of the digest is not having to open
      // the app to find out.
      lines: [
        dueToday.length > 0
          ? `${dueToday.length === 1 ? '1 task is' : `${dueToday.length} tasks are`} due today:`
          : 'Nothing is due today.',
        ...dueToday.map((i) => {
          const list = taskLists.get(i.listId);
          const parent = i.parentId ? shoppingItems.find((p) => p.id === i.parentId) : null;
          const where = parent ? `${list.name} · ${parent.name}` : list.name;
          return `• ${i.name} — ${where}${i.dueTime ? ` at ${i.dueTime}` : ''}`;
        }),
        ...(late ? [`And ${late}.`] : []),
      ],
      tag: `todo-plan-${localDate}`,
      category: 'todos',
    });
  }

  // ── Bills ──
  for (const bill of bills) {
    if (!bill.dueDay || bill.isPermanent) continue;
    const status = (bill.statusMonths?.[mk]) || (bill.paidMonths?.[mk] ? 'paid' : 'unpaid');
    if (status === 'paid') continue;

    if (bill.dueDay < todayDay) {
      messages.push({
        title: `Bill Overdue: ${bill.name}`,
        body: `$${bill.amount} was due on the ${bill.dueDay}th`,
        tag: `bill-overdue-${bill.id}-${mk}`,
        category: 'bills', kind: 'overdue',
      });
    } else if (bill.dueDay === todayDay) {
      messages.push({
        title: `Bill Due Today: ${bill.name}`,
        body: `$${bill.amount} due today`,
        tag: `bill-today-${bill.id}-${mk}`,
        category: 'bills', kind: 'sameDay',
      });
    } else if (bill.dueDay === tomorrowDay) {
      messages.push({
        title: `Bill Due Tomorrow: ${bill.name}`,
        body: `$${bill.amount} due tomorrow`,
        tag: `bill-tomorrow-${bill.id}-${mk}`,
        category: 'bills', kind: 'dayBefore',
      });
    }
  }

  // ── Commitments ──
  for (const c of commitments) {
    if (c.completed || !c.endDate) continue;
    const diffDays = daysBetween(localDate, c.endDate);
    if (diffDays === null || diffDays < 0 || diffDays > daysBefore) continue;
    messages.push({
      title: `Commitment: ${c.description || 'Commitment'}`,
      body: diffDays === 0 ? 'Expires today'
        : diffDays === 1 ? 'Expires tomorrow'
        : `Expires in ${diffDays} days`,
      tag: `commit-exp-${c.id}-${localDate}`,
      category: 'commitments',
    });
  }

  // ── Goals (planned expenses) ──
  for (const pe of plannedExpenses) {
    if (pe.status === 'completed' || !pe.targetDate) continue;
    const diffDays = daysBetween(localDate, pe.targetDate);
    if (diffDays === null || diffDays < 0 || diffDays > 7) continue;
    messages.push({
      title: `Goal: ${pe.name}`,
      body: diffDays === 0 ? 'Target date is today'
        : diffDays === 1 ? 'Target date is tomorrow'
        : `Target date in ${diffDays} days`,
      tag: `goal-due-${pe.id}-${localDate}`,
      category: 'goals',
    });
  }

  // ── Projects ──
  for (const p of projects) {
    if (p.completed) continue;
    for (const [field, label] of [['reviewDate', 'Review'], ['dueDate', 'Due']]) {
      if (!p[field]) continue;
      const diffDays = daysBetween(localDate, p[field]);
      if (diffDays === null || diffDays < 0 || diffDays > 3) continue;
      messages.push({
        title: `Project: ${p.name}`,
        body: diffDays === 0 ? `${label} date is today`
          : diffDays === 1 ? `${label} date is tomorrow`
          : `${label} date in ${diffDays} days`,
        tag: `project-${field}-${p.id}-${localDate}`,
        category: 'projects',
      });
    }
  }

  // ── Work log reminder ──
  messages.push({
    title: 'Work Log Reminder',
    body: "Don't forget to log your hours for today!",
    tag: `shift-reminder-${localDate}`,
    category: 'workLog',
  });

  return messages;
}

/** The subset of the daily messages this user wants pushed to their phone. */
function filterDailyForPush(messages, notifPrefs) {
  const bills = { overdue: true, dayBefore: true, sameDay: true, ...(notifPrefs?.bills || {}) };
  const commitments = { expiring: true, ...(notifPrefs?.commitments || {}) };
  const shifts = { reminder: false, ...(notifPrefs?.shifts || {}) };
  const todos = { enabled: true, dailyPlan: true, ...(notifPrefs?.todos || {}) };
  return messages.filter((m) => {
    switch (m.category) {
      case 'bills': return !!bills[m.kind];
      // Suppressed by either switch: turning to-do notifications off entirely
      // has to turn this off too, whatever the plan toggle says.
      case 'todos': return todos.enabled !== false && todos.dailyPlan !== false;
      case 'commitments': return !!commitments.expiring;
      case 'goals': return notifPrefs?.goals?.enabled !== false;
      case 'projects': return notifPrefs?.projects?.enabled !== false;
      case 'workLog': return !!shifts.reminder;
      default: return true;
    }
  });
}

/** The subset this user wants in the daily email — set independently of push. */
function filterDailyForEmail(messages, notifPrefs) {
  const email = notifPrefs?.email || {};
  if (!email.enabled) return [];
  return messages.filter((m) => email[m.category] !== false);
}

// Requires Firebase Blaze (pay-as-you-go) plan to deploy Cloud Functions
exports.dailyNotifications = onSchedule(
  { schedule: 'every 15 minutes', timeZone: DEFAULT_TZ },
  async () => {
    const now = new Date();
    const userRefs = await db.collection('users').listDocuments();

    for (const userRef of userRefs) {
      try {
        const dataSnap = await db.doc(`${userRef.path}/data/app`).get();
        if (!dataSnap.exists) continue;

        const data = dataSnap.data();
        const { fcmToken, notifPrefs, settings } = data;
        // Process the user if they can receive push OR email. Someone who only
        // enabled email (no browser push token) still gets the daily digest.
        const emailOn = !!(notifPrefs && notifPrefs.email && notifPrefs.email.enabled);
        if (!fcmToken && !emailOn) continue;

        const tz = settings?.timeZone || DEFAULT_TZ;
        const local = localDateAndMinutes(now, tz);
        const scheduled = Math.min(
          timeToMinutes(notifPrefs?.daily?.time) ?? timeToMinutes(DAILY_DEFAULT_TIME),
          LAST_TICK_MINUTES,
        );
        if (local.minutes < scheduled) continue;

        const stateRef = db.doc(`${userRef.path}/data/notifState`);
        const stateSnap = await stateRef.get();
        const stateData = stateSnap.exists ? stateSnap.data() : {};
        if (stateData.dailyRunDate === local.date) continue; // already sent today

        const messages = collectDailyMessages(data, local.date);

        if (fcmToken) {
          for (const msg of filterDailyForPush(messages, notifPrefs)) {
            const alive = await sendPush(userRef.path, fcmToken, msg);
            if (!alive) break;
          }
        }

        // ── Email digest ──
        // One email a day covering whatever the email toggles ask for.
        const emailMessages = filterDailyForEmail(messages, notifPrefs);
        if (emailMessages.length > 0) {
          const recipient = await resolveRecipient(userRef.id, data);
          if (recipient) {
            // A message may carry its own `lines` when one summary line can't
            // hold it — the day's plan lists every task rather than the four
            // that fit in a push body.
            const lines = emailMessages.flatMap((m) => m.lines ?? [`${m.title} — ${m.body}`]);
            const subject = `ExpenseTracker: ${emailMessages.length} reminder${emailMessages.length !== 1 ? 's' : ''} for today`;
            try {
              await enqueueEmail(recipient, subject, "Today's reminders", lines);
            } catch (e) {
              console.error(`dailyNotifications: email enqueue failed for ${userRef.id}:`, e.message);
            }
          }
        }

        await stateRef.set({ dailyRunDate: local.date }, { merge: true });
      } catch (err) {
        console.error(`Error processing user ${userRef.id}:`, err.message);
      }
    }
  }
);

// ── To-do & work item due dates ─────────────────────────────────────────────
// Runs every minute so per-item due reminders reach the phone even when the app
// is closed. Sent keys are recorded in users/{uid}/data/notifState so a reminder
// is only ever delivered once.

const DUE_GRACE_MS = 6 * 60 * 60 * 1000; // how late a due reminder may still fire
const SENT_KEY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// List types whose items are tasks with a due date. Mirrors TASK_LIST_TYPES in
// src/utils/helpers.js — keep the two in step.
const TASK_LIST_TYPES = ['todo', 'work'];

/** Offset (ms) between UTC and `tz` at the given instant. */
function tzOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** Epoch ms for a "YYYY-MM-DD" + "HH:MM" wall clock reading in `tz`. */
function wallClockToMs(dateStr, timeStr, tz) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '23:59').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Two passes so instants near a DST transition resolve correctly.
  let ts = naive - tzOffsetMs(new Date(naive), tz);
  ts = naive - tzOffsetMs(new Date(ts), tz);
  return ts;
}

/** Due instant for a to-do: the client-stamped `dueAt`, else derived from the date/time. */
function todoDueAt(item, tz) {
  if (typeof item.dueAt === 'number' && item.dueAt > 0) return item.dueAt;
  if (!item.dueDate) return null;
  return wallClockToMs(item.dueDate, item.dueTime, tz);
}

/**
 * Has this item been dealt with? Task lists track a `status`, the other list
 * types a `checked` flag.
 */
function itemIsFinished(list, item) {
  return TASK_LIST_TYPES.includes(list.type) ? item.status === 'done' : !!item.checked;
}

/**
 * A day heading — "📅 MONDAY 📅" — rather than work. Mirrors `isHeading` in
 * src/pages/lists/subtasks.js.
 *
 * Headings never notify. One is a label for a date, so a push saying "Due now:
 * MONDAY" is noise, and a week of them would fire seven of those. Nor do they
 * count as outstanding: a list showing "7 items left" when all seven are day
 * headings with nothing under them is a lie.
 */
function itemIsHeading(item) {
  return !!item.header;
}

/** The items still outstanding on a list, headings aside. */
function outstandingItems(list, shoppingItems) {
  return shoppingItems.filter((i) => (
    i.listId === list.id && !itemIsHeading(i) && !itemIsFinished(list, i)
  ));
}

/**
 * Where a task sits, for the body of a reminder: the list, plus the heading
 * it's filed under when it has one. "Weekly To Do · MONDAY" says considerably
 * more from a lock screen than "Weekly To Do" alone.
 */
function taskContext(list, item, byId) {
  const parent = item.parentId ? byId.get(item.parentId) : null;
  return parent ? `${list.name} · ${parent.name}` : list.name;
}

/**
 * Lists carrying their own reminder — set on the list as a whole rather than on
 * any one item. Deliberately not restricted to task lists: "go shopping
 * Saturday at 10" is as worth a reminder as a work deadline.
 *
 * A list whose items are all finished is skipped — there's nothing left to be
 * reminded about. An empty list still fires, since a list you haven't filled in
 * yet is exactly the thing worth a nudge.
 */
function listsDueFor(shoppingLists, shoppingItems, tz, now) {
  const out = [];
  for (const list of shoppingLists) {
    if (list.archived || !list.notifyEnabled) continue;

    const dueAt = todoDueAt(list, tz);
    if (!dueAt) continue;

    // Nothing outstanding means nothing to be reminded about — whether that's
    // because everything is done or because the list holds only day headings.
    // An *empty* list still fires: a list you haven't filled in yet is exactly
    // the thing worth a nudge.
    const own = shoppingItems.filter((i) => i.listId === list.id);
    const left = outstandingItems(list, shoppingItems);
    if (own.length > 0 && left.length === 0) continue;

    // The lead was chosen on the list itself, so push and email land together.
    const lead = Math.max(0, Number(list.remindOffsetMinutes) || 0);
    const fireAt = dueAt - lead * 60 * 1000;
    if (fireAt > now || fireAt <= now - DUE_GRACE_MS) continue;

    out.push({ list, dueAt, lead, fireAt, remaining: left });
  }
  return out;
}

/**
 * Decide which to-do pushes are due right now for one user's data blob.
 * Pure — no I/O — so the firing windows and dedupe rules are unit-testable.
 *
 * @param {object} data - the user's `data/app` document
 * @param {object} sent - map of already-sent keys → timestamp
 * @param {number} now - current epoch ms
 * @returns {Array<{title: string, body: string, tag: string, requireInteraction?: boolean}>}
 */
function collectTodoMessages(data, sent, now) {
  const { shoppingLists = [], shoppingItems = [], notifPrefs, settings } = data;
  const prefs = { enabled: true, ...(notifPrefs?.todos || {}) };
  if (!prefs.enabled) return [];

  const tz = settings?.timeZone || DEFAULT_TZ;
  const todoLists = new Map(
    shoppingLists.filter((l) => TASK_LIST_TYPES.includes(l.type) && !l.archived).map((l) => [l.id, l]),
  );

  const byId = new Map(shoppingItems.map((i) => [i.id, i]));

  const messages = [];
  for (const item of shoppingItems) {
    const list = todoLists.get(item.listId);
    if (!list) continue;
    if (item.status && item.status !== 'pending') continue;
    if (itemIsHeading(item)) continue;

    // Due-date reminder (optionally ahead of the due time)
    if (item.notifyEnabled) {
      const dueAt = todoDueAt(item, tz);
      if (dueAt) {
        const lead = Number(item.remindOffsetMinutes) || 0;
        const fireAt = dueAt - lead * 60 * 1000;
        const key = `todo-due-${item.id}-${fireAt}`;
        if (!sent[key] && fireAt <= now && fireAt > now - DUE_GRACE_MS) {
          const when = new Date(dueAt).toLocaleTimeString('en-US', {
            timeZone: tz, hour: 'numeric', minute: '2-digit',
          });
          const where = taskContext(list, item, byId);
          messages.push({
            title: lead > 0 ? `Due soon: ${item.name}` : `Due now: ${item.name}`,
            body: lead > 0 ? `${where} — due at ${when}` : where,
            tag: key,
          });
        }
      }
    }
  }

  // ── Reminders set on a list as a whole ──
  for (const { list, dueAt, lead, fireAt, remaining } of listsDueFor(shoppingLists, shoppingItems, tz, now)) {
    const key = `list-due-${list.id}-${fireAt}`;
    if (sent[key]) continue;
    const when = new Date(dueAt).toLocaleTimeString('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit',
    });
    const left = remaining.length === 1 ? '1 item left' : `${remaining.length} items left`;
    messages.push({
      title: lead > 0 ? `Coming up: ${list.name}` : `Due now: ${list.name}`,
      body: lead > 0 ? `${left} — due at ${when}` : left,
      tag: key,
    });
  }

  return messages;
}

// Default lead for the "still not done" task email when none is configured.
const TODO_EMAIL_LEAD_MINUTES = 60;

/** "in about an hour" / "in 15 minutes" / "tomorrow" — for the email subject. */
function describeLead(minutes) {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? 'in about an hour' : `in about ${hours} hours`;
  }
  return `in ${minutes} minutes`;
}

/**
 * Decide which task *emails* are due right now for one user's data blob.
 * An email goes out `email.taskLeadMinutes` ahead of a dated task's due moment,
 * but only while it's still pending — i.e. it hasn't been marked complete.
 * Pure, so testable.
 *
 * @param {object} data - the user's `data/app` document
 * @param {object} sent - map of already-sent email keys → timestamp
 * @param {number} now - current epoch ms
 * @returns {Array<{subject: string, title: string, lines: string[], tag: string}>}
 */
function collectTodoEmails(data, sent, now) {
  const pref = data.notifPrefs && data.notifPrefs.email;
  if (!pref || !pref.enabled) return [];
  if (pref.tasks === false) return []; // task emails switched off on their own

  const leadMinutes = Number.isFinite(Number(pref.taskLeadMinutes))
    ? Number(pref.taskLeadMinutes)
    : TODO_EMAIL_LEAD_MINUTES;
  const leadMs = Math.max(0, leadMinutes) * 60 * 1000;

  const { shoppingLists = [], shoppingItems = [], settings } = data;
  const tz = settings?.timeZone || DEFAULT_TZ;
  const todoLists = new Map(
    shoppingLists.filter((l) => TASK_LIST_TYPES.includes(l.type) && !l.archived).map((l) => [l.id, l]),
  );

  const byId = new Map(shoppingItems.map((i) => [i.id, i]));

  const out = [];
  for (const item of shoppingItems) {
    const list = todoLists.get(item.listId);
    if (!list) continue;
    if (item.status && item.status !== 'pending') continue; // done/blocked → no email
    if (itemIsHeading(item)) continue;                      // a day label, not work

    const dueAt = todoDueAt(item, tz);
    if (!dueAt) continue;

    const fireAt = dueAt - leadMs;
    // The lead is part of the key, so changing it re-arms the email.
    const key = `todo-email-${item.id}-${dueAt}-${leadMinutes}`;
    if (!sent[key] && fireAt <= now && fireAt > now - DUE_GRACE_MS) {
      const when = new Date(dueAt).toLocaleString('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      out.push({
        subject: `Due soon: ${item.name}`,
        title: leadMinutes > 0
          ? `"${item.name}" is due ${describeLead(leadMinutes)}`
          : `"${item.name}" is due now`,
        lines: [
          `Your task "${item.name}" on the list "${taskContext(list, item, byId)}" is due at ${when}.`,
          "It hasn't been marked complete yet.",
        ],
        tag: key,
      });
    }
  }

  // ── Reminders set on a list as a whole ──
  // These use the lead stored on the list rather than the global task lead, so
  // the email arrives alongside the push the user configured.
  for (const { list, dueAt, lead, remaining } of listsDueFor(shoppingLists, shoppingItems, tz, now)) {
    const key = `list-email-${list.id}-${dueAt}-${lead}`;
    if (sent[key]) continue;
    const when = new Date(dueAt).toLocaleString('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const names = remaining.slice(0, 20).map((i) => i.name);
    const more = remaining.length - names.length;
    out.push({
      subject: `Coming up: ${list.name}`,
      title: lead > 0
        ? `"${list.name}" is due ${describeLead(lead)}`
        : `"${list.name}" is due now`,
      lines: [
        `Your list "${list.name}" is due at ${when}.`,
        remaining.length === 0
          ? 'It has no items on it yet.'
          : `${remaining.length === 1 ? '1 item is' : `${remaining.length} items are`} still outstanding:`,
        ...names,
        ...(more > 0 ? [`…and ${more} more.`] : []),
      ],
      tag: key,
    });
  }

  return out;
}

/**
 * Send a test email to the address a user's reminders would go to.
 *
 * The point is to prove the whole chain before a real reminder depends on it:
 * this resolves the recipient and enqueues through exactly the same functions
 * the scheduled reminders use, so a test that lands means the address, the
 * Trigger Email extension and the SMTP credentials are all good. The browser
 * can't do this itself — Firestore rules deny clients any write to `mail`.
 *
 * Returns the address so the UI can say where it went, which catches the case
 * where delivery works but the mail is going somewhere unexpected.
 */
exports.sendTestEmail = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to send a test email.');

  const snap = await db.doc(`users/${uid}/data/app`).get();
  const data = snap.exists ? snap.data() : {};

  // resolveRecipient returns null when email is switched off, which is a
  // different problem from having no address — say which one it is.
  const pref = data.notifPrefs && data.notifPrefs.email;
  if (!pref || !pref.enabled) {
    throw new HttpsError('failed-precondition', 'Email notifications are switched off in Settings.');
  }

  const recipient = await resolveRecipient(uid, data);
  if (!recipient) {
    throw new HttpsError(
      'failed-precondition',
      'No email address to send to. Add one under Settings → Email Notifications.',
    );
  }

  const when = new Date().toLocaleString('en-US', {
    timeZone: (data.settings && data.settings.timeZone) || DEFAULT_TZ,
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  try {
    await enqueueEmail(
      recipient,
      'ExpenseTracker test email',
      'Your email notifications are working',
      [
        `This test was sent at ${when}.`,
        'It travelled the same path a real reminder does: the Cloud Function queued it, '
          + 'the Trigger Email extension delivered it, and it reached this inbox.',
        'Bill summaries, task reminders and list reminders will arrive here.',
      ],
    );
  } catch (e) {
    console.error(`sendTestEmail: enqueue failed for ${uid}:`, e.message);
    throw new HttpsError('internal', 'Could not queue the email. Check the Cloud Function logs.');
  }

  return { recipient };
});

exports.todoReminders = onSchedule(
  { schedule: 'every 1 minutes', timeZone: DEFAULT_TZ },
  async () => {
    const now = Date.now();
    const userRefs = await db.collection('users').listDocuments();

    for (const userRef of userRefs) {
      try {
        const dataSnap = await db.doc(`${userRef.path}/data/app`).get();
        if (!dataSnap.exists) continue;

        const data = dataSnap.data();
        const emailOn = !!(data.notifPrefs && data.notifPrefs.email && data.notifPrefs.email.enabled);
        // Nothing to do for this user if they can't receive push or email.
        if (!data.fcmToken && !emailOn) continue;

        const stateRef = db.doc(`${userRef.path}/data/notifState`);
        const stateSnap = await stateRef.get();
        const stateData = stateSnap.exists ? stateSnap.data() : {};
        const sent = stateData.todoSent || {};
        const emailSent = stateData.todoEmailSent || {};

        const statePatch = {};

        // ── Push reminders (due date + time) ──
        if (data.fcmToken) {
          const messages = collectTodoMessages(data, sent, now);
          if (messages.length > 0) {
            const delivered = [];
            for (const msg of messages) {
              const alive = await sendPush(userRef.path, data.fcmToken, { ...msg, url: '/ExpenseTracker/lists' });
              if (!alive) break; // token was revoked — leave the rest unmarked so they retry
              delivered.push(msg.tag);
            }
            const merged = { ...sent };
            for (const tag of delivered) merged[tag] = now;
            for (const [key, ts] of Object.entries(merged)) {
              if (now - ts > SENT_KEY_TTL_MS) delete merged[key];
            }
            statePatch.todoSent = merged;
          }
        }

        // ── Email reminders (one hour before due, still pending) ──
        if (emailOn) {
          const emails = collectTodoEmails(data, emailSent, now);
          if (emails.length > 0) {
            const recipient = await resolveRecipient(userRef.id, data);
            if (recipient) {
              const merged = { ...emailSent };
              for (const em of emails) {
                try {
                  await enqueueEmail(recipient, em.subject, em.title, em.lines);
                  merged[em.tag] = now;
                } catch (e) {
                  console.error(`todoReminders: email enqueue failed for ${userRef.id}:`, e.message);
                }
              }
              for (const [key, ts] of Object.entries(merged)) {
                if (now - ts > SENT_KEY_TTL_MS) delete merged[key];
              }
              statePatch.todoEmailSent = merged;
            }
          }
        }

        if (Object.keys(statePatch).length > 0) {
          await stateRef.set(statePatch, { merge: true });
        }
      } catch (err) {
        console.error(`todoReminders: error for user ${userRef.id}:`, err.message);
      }
    }
  },
);

// ── Collaborative lists ─────────────────────────────────────────────────────
// A guest holding a share link appends an op to `listShares/{token}/ops`; this
// applies it to the owner's document.
//
// Why a function at all: the owner's data is one document. Letting an
// anonymous browser write it directly would hand over every bill, debt and
// note in the app along with the shopping list. So the guest writes a
// create-only queue that they can't even read back, and the trust boundary
// lives here and in listOps.js.
//
// The op document is deleted once applied — it's an instruction, not a record.
// What the owner sees afterwards is the `activity` feed on the share.

const SHARE_ACTIVITY_KEEP = 20;

/** The mirror's view of a list's items: no attachments, just a flag. */
function mirrorItems(items, listId) {
  return items
    .filter((i) => i.listId === listId)
    .map(({ attachments, ...rest }) => ({ ...rest, hasPhotos: (attachments || []).length > 0 }));
}

exports.applyListOps = onDocumentCreated('listShares/{token}/ops/{opId}', async (event) => {
  const { token } = event.params;
  const opSnap = event.data;
  if (!opSnap) return;
  const op = opSnap.data();

  const shareRef = db.doc(`listShares/${token}`);
  try {
    const shareSnap = await shareRef.get();
    // No share, or the link has been turned off: drop the op on the floor.
    // Rules already refuse writes to a revoked share, but a revoke racing an
    // in-flight op has to lose here too.
    if (!shareSnap.exists) { await opSnap.ref.delete(); return; }
    const share = shareSnap.data();
    if (share.revoked === true || !share.ownerUid || !share.listId) {
      await opSnap.ref.delete();
      return;
    }

    const appRef = db.doc(`users/${share.ownerUid}/data/app`);
    let change = null;
    let items = null;

    // A transaction, because two people ticking things off at the same moment
    // both rewrite the whole `shoppingItems` array — a read-modify-write on a
    // single field is exactly the case it exists for.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(appRef);
      if (!snap.exists) return;
      const data = snap.data();
      const list = (data.shoppingLists || []).find((l) => l.id === share.listId);
      if (!list) return; // the owner deleted the list out from under the share

      const result = listOps.applyOp(data.shoppingItems || [], op, {
        listId: share.listId,
        tz: data.settings?.timeZone || DEFAULT_TZ,
        wallClockToMs,
        now: Date.now(),
        sectionIds: (list.sections || []).map((sec) => sec.id),
      });
      if (!result) return; // refused — see listOps.js for why

      tx.set(appRef, { shoppingItems: result.items }, { merge: true });
      change = result.change;
      items = result.items;
    });

    if (change) {
      const now = Date.now();
      await shareRef.set({
        items: mirrorItems(items, share.listId),
        // `appliedAt` marks a write this function made rather than an echo of
        // the owner's own mirror push. That's what tells the owner's app there
        // is something new to pick up.
        appliedAt: now,
        updatedAt: now,
        activity: [
          { line: listOps.describeChange(change), at: now },
          ...(share.activity || []),
        ].slice(0, SHARE_ACTIVITY_KEEP),
        // Counters for the batched owner notification. Incremented atomically
        // so simultaneous edits can't lose one.
        pendingCount: admin.firestore.FieldValue.increment(1),
        pendingNames: admin.firestore.FieldValue.arrayUnion(change.name || 'a task'),
        pendingBy: admin.firestore.FieldValue.arrayUnion(change.by || 'Someone'),
        pendingLastAt: now,
      }, { merge: true });
    }

    await opSnap.ref.delete();
  } catch (err) {
    // The op stays put so a retry can pick it up. A permanently bad op is
    // bounded by the rules' shape check, so it can't sit here doing damage.
    console.error(`applyListOps: ${token} failed:`, err.message);
    throw err;
  }
});

// How long to let edits accumulate before telling the owner. Someone adding
// five things to a shared list does it in one sitting; five pushes for one
// sitting is what makes people turn notifications off.
const SHARE_NOTIFY_QUIET_MS = 2 * 60 * 1000;

/** "Chris added 3 things" / "Chris and Sam made 5 changes" */
function describeShareActivity(share) {
  const count = share.pendingCount || 0;
  const people = (share.pendingBy || []).filter(Boolean);
  const who = people.length === 0 ? 'Someone'
    : people.length === 1 ? people[0]
    : people.length === 2 ? `${people[0]} and ${people[1]}`
    : `${people[0]} and ${people.length - 1} others`;
  const what = count === 1 ? '1 change' : `${count} changes`;
  const names = (share.pendingNames || []).filter(Boolean).slice(0, 4);
  const more = (share.pendingNames || []).length - names.length;

  return {
    title: `${who} — ${what} to ${share.list?.name || 'a shared list'}`,
    body: names.length > 0
      ? `${names.join(', ')}${more > 0 ? ` +${more} more` : ''}`
      : 'Open the list to see what changed.',
    lines: [
      `${who} made ${what} to your shared list "${share.list?.name || 'a shared list'}".`,
      ...(share.activity || []).slice(0, count).map((a) => `• ${a.line}`),
    ],
  };
}

exports.shareActivityNotifications = onSchedule(
  { schedule: 'every 1 minutes', timeZone: DEFAULT_TZ },
  async () => {
    const now = Date.now();
    const pending = await db.collection('listShares').where('pendingCount', '>', 0).get();

    for (const doc of pending.docs) {
      const share = doc.data();
      try {
        // Still being edited — wait for the person to finish so one sitting
        // makes one notification.
        if (now - (share.pendingLastAt || 0) < SHARE_NOTIFY_QUIET_MS) continue;

        const clear = {
          pendingCount: 0,
          pendingNames: admin.firestore.FieldValue.delete(),
          pendingBy: admin.firestore.FieldValue.delete(),
        };

        const ownerSnap = await db.doc(`users/${share.ownerUid}/data/app`).get();
        if (!ownerSnap.exists) { await doc.ref.set(clear, { merge: true }); continue; }
        const owner = ownerSnap.data();
        const prefs = { enabled: true, sharedActivity: true, ...(owner.notifPrefs?.todos || {}) };

        if (prefs.enabled === false || prefs.sharedActivity === false) {
          await doc.ref.set(clear, { merge: true });
          continue;
        }

        const msg = describeShareActivity(share);

        if (owner.fcmToken) {
          await sendPush(`users/${share.ownerUid}`, owner.fcmToken, {
            title: msg.title,
            body: msg.body,
            tag: `share-activity-${doc.id}-${share.pendingLastAt}`,
            url: `/ExpenseTracker/lists?list=${share.listId}`,
          });
        }

        const recipient = await resolveRecipient(share.ownerUid, owner);
        if (recipient && owner.notifPrefs?.email?.sharedActivity !== false) {
          try {
            await enqueueEmail(recipient, msg.title, msg.title, msg.lines);
          } catch (e) {
            console.error(`shareActivityNotifications: email failed for ${doc.id}:`, e.message);
          }
        }

        await doc.ref.set(clear, { merge: true });
      } catch (err) {
        console.error(`shareActivityNotifications: ${doc.id} failed:`, err.message);
      }
    }
  },
);

// Exported for unit tests only.
exports._internal = {
  collectTodoMessages, collectTodoEmails, wallClockToMs, itemIsHeading, outstandingItems,
  describeShareActivity, mirrorItems, listOps,
  collectDailyMessages, filterDailyForPush, filterDailyForEmail,
  localDateAndMinutes, daysBetween, tomorrowDayOfMonth,
};
