const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

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
        if (!fcmToken) continue;

        const prefs = {
          bills: { overdue: true, dayBefore: true, ...(notifPrefs?.bills || {}) },
          commitments: { expiring: true, daysBefore: 3, ...(notifPrefs?.commitments || {}) },
          shifts: { reminder: false, reminderTime: '18:00', ...(notifPrefs?.shifts || {}) },
        };

        const messages = [];

        // ── Bill checks ──
        if (prefs.bills.overdue || prefs.bills.dayBefore) {
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

        for (const msg of messages) {
          try {
            await messaging.send({
              token: fcmToken,
              notification: { title: msg.title, body: msg.body },
              data: { tag: msg.tag },
              webpush: {
                notification: {
                  icon: 'https://billtracker-256ef.web.app/app-icon.jpeg',
                  badge: 'https://billtracker-256ef.web.app/app-icon.jpeg',
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
      } catch (err) {
        console.error(`Error processing user ${userRef.id}:`, err.message);
      }
    }
  }
);
