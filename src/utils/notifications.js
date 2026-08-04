import { messaging, FCM_VAPID_KEY } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';

const VAPID_KEY = FCM_VAPID_KEY;
const SW_PATH = '/ExpenseTracker/firebase-messaging-sw.js';
// The messaging worker gets its own scope so it doesn't displace the PWA's
// service worker, which is registered at '/ExpenseTracker/'. Two workers can't
// share one scope — the later registration would silently evict the earlier.
const SW_SCOPE = '/ExpenseTracker/firebase-cloud-messaging-push-scope';

// A VAPID application server key is an uncompressed P-256 point (65 bytes),
// which is 87–88 base64url characters. Anything shorter can't produce a token,
// so we check up front and surface a clear reason instead of failing silently.
export function pushKeyConfigured() {
  return typeof VAPID_KEY === 'string' && VAPID_KEY.length >= 80;
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function sendNotification(title, options = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const opts = {
    icon: '/ExpenseTracker/app-icon.jpeg',
    badge: '/ExpenseTracker/app-icon.jpeg',
    data: { url: '/ExpenseTracker/' },
    ...options,
  };
  // Android Chrome throws on `new Notification()` — notifications there must go
  // through the service worker. Prefer the service worker everywhere it exists
  // so phones behave the same as desktop, and fall back to the constructor.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((reg) => {
        if (reg) return reg.showNotification(title, opts);
        throw new Error('no service worker registration');
      })
      .catch(() => { try { new Notification(title, opts); } catch { /* unsupported */ } });
    return true;
  }
  try {
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

// ── Shift notification scheduling ──────────────────────────────────────────

const shiftNotifTimers = {};

/**
 * Schedule a browser notification before a shift starts.
 * @param {object} shift - shift object with { id, date, startTime, notificationEnabled, notificationOffsetMinutes }
 * @param {object} job - job object with { name }
 */
export function scheduleShiftNotification(shift, job) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (!shift.notificationEnabled || !shift.startTime || !shift.date) return;

  // Cancel any existing timer for this shift
  cancelShiftNotification(shift.id);

  const offsetMinutes = parseInt(shift.notificationOffsetMinutes) || 30;
  const shiftMs = new Date(`${shift.date}T${shift.startTime}`).getTime();
  const notifyMs = shiftMs - offsetMinutes * 60 * 1000;
  const delay = notifyMs - Date.now();

  if (delay <= 0) return; // already past

  shiftNotifTimers[shift.id] = setTimeout(() => {
    delete shiftNotifTimers[shift.id];
    const jobName = job?.name || 'Shift';
    const body = `${jobName} starts in ${offsetMinutes} min (${shift.startTime})`;
    sendNotification(`Upcoming Shift: ${jobName}`, { body, tag: `shift-${shift.id}` });
  }, Math.min(delay, 2147483647));
}

/**
 * Cancel a scheduled shift notification timer.
 * @param {string} shiftId
 */
export function cancelShiftNotification(shiftId) {
  if (shiftNotifTimers[shiftId]) {
    clearTimeout(shiftNotifTimers[shiftId]);
    delete shiftNotifTimers[shiftId];
  }
}

export function getDueDateMs(dueDate, dueTime) {
  if (!dueDate) return null;
  return new Date(`${dueDate}T${dueTime || '23:59'}`).getTime();
}

export function formatDueBadge(dueDate, dueTime) {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(`${dueDate}T${dueTime || '23:59'}`);
  const diff = due - now;
  const diffHours = diff / (1000 * 60 * 60);
  const diffDays = diff / (1000 * 60 * 60 * 24);

  if (diff < 0) return { label: 'Overdue', color: 'var(--danger)' };
  if (diffHours < 1) return { label: `${Math.max(1, Math.round(diff / 60000))}m`, color: 'var(--danger)' };
  if (diffHours < 24) {
    const h = due.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 || 12;
    const m = String(due.getMinutes()).padStart(2, '0');
    return { label: m === '00' ? `${displayH}${ampm}` : `${displayH}:${m}${ampm}`, color: '#f59e0b' };
  }
  if (diffDays < 2) return { label: 'Tomorrow', color: '#f59e0b' };
  if (diffDays < 7) {
    return { label: due.toLocaleDateString('en-US', { weekday: 'short' }), color: 'var(--accent-text)' };
  }
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'var(--muted)' };
}

// ── To-do due dates and reminder lead times ────────────────────────────────

// Lead time between the reminder push and the item's due moment.
export const REMINDER_LEAD_OPTIONS = [
  { minutes: 0, label: 'At due time' },
  { minutes: 5, label: '5 min before' },
  { minutes: 15, label: '15 min before' },
  { minutes: 30, label: '30 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: '1 day before' },
];

/** Today's date as a local "YYYY-MM-DD" string. */
export function localTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Absolute epoch ms for a to-do's due moment, resolved in the device's local
 * time zone. Stored on the item as `dueAt` so the Cloud Function can schedule
 * pushes without having to guess the user's time zone.
 *
 * A blank date with a time given assumes today, so "due at 2:00 PM" means today
 * at 2 PM. A blank date and blank time means the item has no deadline.
 */
export function computeDueAt(dueDate, dueTime) {
  if (!dueDate && !dueTime) return null;
  const date = dueDate || localTodayISO();
  const ms = new Date(`${date}T${dueTime || '23:59'}`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Epoch ms at which a to-do's due reminder should fire, or null. */
export function todoReminderAt(item) {
  const dueAt = item.dueAt ?? computeDueAt(item.dueDate, item.dueTime);
  if (!dueAt) return null;
  const lead = Number(item.remindOffsetMinutes) || 0;
  return dueAt - lead * 60 * 1000;
}

/** "Mon, Aug 4 at 2:30 PM" — the full due moment, for confirmation copy. */
export function formatDueMoment(dueDate, dueTime) {
  if (!dueDate && !dueTime) return null;
  const at = computeDueAt(dueDate, dueTime);
  if (!at) return null;
  const d = new Date(at);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  // No time given means end of day — say so rather than showing "11:59 PM".
  if (!dueTime) return `${day} (end of day)`;
  return `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// ── Firebase Cloud Messaging (FCM) ──────────────────────────────────────────

/**
 * Register this browser with FCM and return the device token.
 * Call only after notification permission is granted.
 * Returns null if FCM is not supported in this browser.
 */
export async function registerFCMToken() {
  if (!pushKeyConfigured()) {
    console.warn('[push] VITE_FCM_VAPID_KEY is missing or invalid — background push is disabled.');
    return null;
  }
  try {
    const client = await messaging;
    if (!client) return null;
    const swReg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
    const token = await getToken(client, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    return token || null;
  } catch (err) {
    console.warn('[push] Could not register for background push:', err?.message || err);
    return null;
  }
}

/**
 * Listen for FCM messages while the app is in the foreground.
 * Returns an unsubscribe function.
 */
export async function onForegroundMessage(callback) {
  const client = await messaging;
  if (!client) return () => {};
  return onMessage(client, (payload) => {
    const { title, body, icon } = payload.notification || {};
    sendNotification(title || 'Finance Manager', {
      body: body || '',
      icon: icon || undefined,
      data: payload.data,
    });
    callback?.(payload);
  });
}
