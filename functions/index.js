const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const ICON = 'https://pairamedic.github.io/ExpenseTracker/app-icon.jpeg';
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
        fcmOptions: { link: msg.url || 'https://pairamedic.github.io/ExpenseTracker/' },
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

// Runs daily at 8:00 AM Eastern — checks bills, commitments, and shift reminders
// Requires Firebase Blaze (pay-as-you-go) plan to deploy Cloud Functions
exports.dailyNotifications = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'America/New_York' },
  async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDate();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowDay = todayDay + 1;
    const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const usersSnap = await db.collection('users').listDocuments();

    for (const userRef of usersSnap) {
      try {
        const dataSnap = await db.doc(`${userRef.path}/data/app`).get();
        if (!dataSnap.exists) continue;

        const data = dataSnap.data();
        const { bills = [], commitments = [], plannedExpenses = [], projects = [], fcmToken, notifPrefs } = data;
        // Process the user if they can receive push OR email. Someone who only
        // enabled email (no browser push token) still gets the daily digest.
        const emailOn = !!(notifPrefs && notifPrefs.email && notifPrefs.email.enabled);
        if (!fcmToken && !emailOn) continue;

        const prefs = {
          bills: { overdue: true, dayBefore: true, sameDay: true, ...(notifPrefs?.bills || {}) },
          commitments: { expiring: true, daysBefore: 3, ...(notifPrefs?.commitments || {}) },
          shifts: { reminder: false, reminderTime: '18:00', ...(notifPrefs?.shifts || {}) },
        };

        const messages = [];

        // ── Bill checks ──
        if (prefs.bills.overdue || prefs.bills.dayBefore || prefs.bills.sameDay) {
          for (const bill of bills) {
            if (!bill.dueDay || bill.isPermanent) continue;
            const status = (bill.statusMonths?.[mk]) || (bill.paidMonths?.[mk] ? 'paid' : 'unpaid');
            if (status === 'paid') continue;

            if (prefs.bills.overdue && bill.dueDay < todayDay) {
              messages.push({
                title: `Bill Overdue: ${bill.name}`,
                body: `$${bill.amount} was due on the ${bill.dueDay}th`,
                tag: `bill-overdue-${bill.id}-${mk}`,
              });
            } else if (prefs.bills.sameDay && bill.dueDay === todayDay) {
              messages.push({
                title: `Bill Due Today: ${bill.name}`,
                body: `$${bill.amount} due today`,
                tag: `bill-today-${bill.id}-${mk}`,
              });
            } else if (prefs.bills.dayBefore && bill.dueDay === tomorrowDay) {
              messages.push({
                title: `Bill Due Tomorrow: ${bill.name}`,
                body: `$${bill.amount} due tomorrow`,
                tag: `bill-tomorrow-${bill.id}-${mk}`,
              });
            }
          }
        }

        // ── Commitment checks ──
        if (prefs.commitments.expiring) {
          const daysBefore = prefs.commitments.daysBefore ?? 3;
          for (const c of commitments) {
            if (c.completed || !c.endDate) continue;
            const end = new Date(c.endDate + 'T12:00:00');
            const diffDays = Math.round((end.getTime() - today.getTime()) / 86400000);
            if (diffDays < 0 || diffDays > daysBefore) continue;
            const body = diffDays === 0 ? 'Expires today'
              : diffDays === 1 ? 'Expires tomorrow'
              : `Expires in ${diffDays} days`;
            messages.push({
              title: `Commitment: ${c.description || 'Commitment'}`,
              body,
              tag: `commit-exp-${c.id}-${todayStr}`,
            });
          }
        }

        // ── Goal (planned expense) target date checks ──
        for (const pe of plannedExpenses) {
          if (pe.status === 'completed' || !pe.targetDate) continue;
          const target = new Date(pe.targetDate + 'T12:00:00');
          const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
          if (diffDays < 0 || diffDays > 7) continue;
          const body = diffDays === 0 ? 'Target date is today'
            : diffDays === 1 ? 'Target date is tomorrow'
            : `Target date in ${diffDays} days`;
          messages.push({
            title: `Goal: ${pe.name}`,
            body,
            tag: `goal-due-${pe.id}-${todayStr}`,
          });
        }

        // ── Project date checks ──
        for (const p of projects) {
          if (p.completed) continue;
          for (const [field, label] of [['reviewDate', 'Review'], ['dueDate', 'Due']]) {
            if (!p[field]) continue;
            const date = new Date(p[field] + 'T12:00:00');
            const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
            if (diffDays < 0 || diffDays > 3) continue;
            const body = diffDays === 0 ? `${label} date is today`
              : diffDays === 1 ? `${label} date is tomorrow`
              : `${label} date in ${diffDays} days`;
            messages.push({
              title: `Project: ${p.name}`,
              body,
              tag: `project-${field}-${p.id}-${todayStr}`,
            });
          }
        }

        // ── Shift log reminder ──
        if (prefs.shifts.reminder) {
          messages.push({
            title: 'Work Log Reminder',
            body: "Don't forget to log your hours for today!",
            tag: `shift-reminder-${todayStr}`,
          });
        }

        if (fcmToken) {
          for (const msg of messages) {
            try {
              await messaging.send({
                token: fcmToken,
                notification: { title: msg.title, body: msg.body },
                data: { tag: msg.tag },
                webpush: {
                  notification: {
                    icon: 'https://pairamedic.github.io/ExpenseTracker/app-icon.jpeg',
                    badge: 'https://pairamedic.github.io/ExpenseTracker/app-icon.jpeg',
                    tag: msg.tag,
                  },
                },
              });
            } catch (e) {
              if (e.code === 'messaging/registration-token-not-registered') {
                await db.doc(`${userRef.path}/data/app`).update({ fcmToken: admin.firestore.FieldValue.delete() });
                break;
              }
            }
          }
        }

        // ── Email digest ──
        // One email a day covering everything above (bills due today, overdue,
        // due tomorrow, expiring commitments, goals, projects, shift reminder).
        if (messages.length > 0) {
          const recipient = await resolveRecipient(userRef.id, data);
          if (recipient) {
            const lines = messages.map((m) => `${m.title} — ${m.body}`);
            const subject = `ExpenseTracker: ${messages.length} reminder${messages.length !== 1 ? 's' : ''} for today`;
            try {
              await enqueueEmail(recipient, subject, "Today's reminders", lines);
            } catch (e) {
              console.error(`dailyNotifications: email enqueue failed for ${userRef.id}:`, e.message);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing user ${userRef.id}:`, err.message);
      }
    }
  }
);

// ── To-do due dates & timers ────────────────────────────────────────────────
// Runs every minute so per-item due reminders and countdown timers reach the
// phone even when the app is closed. Sent keys are recorded in
// users/{uid}/data/notifState so a reminder is only ever delivered once.

const TIMER_GRACE_MS = 30 * 60 * 1000; // how late a timer push may still fire
const DUE_GRACE_MS = 6 * 60 * 60 * 1000; // ditto for due-date reminders
const SENT_KEY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
  const prefs = { enabled: true, timers: true, ...(notifPrefs?.todos || {}) };
  if (!prefs.enabled && !prefs.timers) return [];

  const tz = settings?.timeZone || DEFAULT_TZ;
  const todoLists = new Map(
    shoppingLists.filter((l) => l.type === 'todo' && !l.archived).map((l) => [l.id, l]),
  );

  const messages = [];
  for (const item of shoppingItems) {
    const list = todoLists.get(item.listId);
    if (!list) continue;
    if (item.status && item.status !== 'pending') continue;

    // Countdown timer elapsed
    if (prefs.timers && typeof item.timerEndsAt === 'number') {
      const key = `todo-timer-${item.id}-${item.timerEndsAt}`;
      if (!sent[key] && item.timerEndsAt <= now && item.timerEndsAt > now - TIMER_GRACE_MS) {
        messages.push({
          title: `Timer done: ${item.name}`,
          body: list.name,
          tag: key,
          requireInteraction: true,
        });
      }
    }

    // Due-date reminder (optionally ahead of the due time)
    if (prefs.enabled && item.notifyEnabled) {
      const dueAt = todoDueAt(item, tz);
      if (dueAt) {
        const lead = Number(item.remindOffsetMinutes) || 0;
        const fireAt = dueAt - lead * 60 * 1000;
        const key = `todo-due-${item.id}-${fireAt}`;
        if (!sent[key] && fireAt <= now && fireAt > now - DUE_GRACE_MS) {
          const when = new Date(dueAt).toLocaleTimeString('en-US', {
            timeZone: tz, hour: 'numeric', minute: '2-digit',
          });
          messages.push({
            title: lead > 0 ? `Due soon: ${item.name}` : `Due now: ${item.name}`,
            body: lead > 0 ? `${list.name} — due at ${when}` : list.name,
            tag: key,
          });
        }
      }
    }
  }
  return messages;
}

// How far ahead of a timed to-do's due moment the "still not done" email goes.
const TODO_EMAIL_LEAD_MS = 60 * 60 * 1000; // one hour

/**
 * Decide which to-do *emails* are due right now for one user's data blob.
 * An email goes out roughly an hour before a timed to-do is due, but only while
 * it's still pending — i.e. it hasn't been marked complete. Pure, so testable.
 *
 * @param {object} data - the user's `data/app` document
 * @param {object} sent - map of already-sent email keys → timestamp
 * @param {number} now - current epoch ms
 * @returns {Array<{subject: string, title: string, lines: string[], tag: string}>}
 */
function collectTodoEmails(data, sent, now) {
  const pref = data.notifPrefs && data.notifPrefs.email;
  if (!pref || !pref.enabled) return [];

  const { shoppingLists = [], shoppingItems = [], settings } = data;
  const tz = settings?.timeZone || DEFAULT_TZ;
  const todoLists = new Map(
    shoppingLists.filter((l) => l.type === 'todo' && !l.archived).map((l) => [l.id, l]),
  );

  const out = [];
  for (const item of shoppingItems) {
    const list = todoLists.get(item.listId);
    if (!list) continue;
    if (item.status && item.status !== 'pending') continue; // done/blocked → no email

    const dueAt = todoDueAt(item, tz);
    if (!dueAt) continue;

    const fireAt = dueAt - TODO_EMAIL_LEAD_MS;
    const key = `todo-email-1h-${item.id}-${dueAt}`;
    if (!sent[key] && fireAt <= now && fireAt > now - DUE_GRACE_MS) {
      const when = new Date(dueAt).toLocaleString('en-US', {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      out.push({
        subject: `Due soon: ${item.name}`,
        title: `"${item.name}" is due in about an hour`,
        lines: [
          `Your task "${item.name}" on the list "${list.name}" is due at ${when}.`,
          "It hasn't been marked complete yet.",
        ],
        tag: key,
      });
    }
  }
  return out;
}

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

        // ── Push reminders (due-time + timers) ──
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

// Exported for unit tests only.
exports._internal = { collectTodoMessages, collectTodoEmails, wallClockToMs };
