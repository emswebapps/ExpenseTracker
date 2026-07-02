import { messaging } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';

const VAPID_KEY = 'bdUnK4mtP19w7NtBQniJNN39vroY5Q4lRHefPiSkc9M';
const SW_PATH = '/firebase-messaging-sw.js';

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
  try {
    new Notification(title, {
      icon: '/app-icon.jpeg',
      badge: '/app-icon.jpeg',
      ...options,
    });
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

// ── Firebase Cloud Messaging (FCM) ──────────────────────────────────────────

/**
 * Register this browser with FCM and return the device token.
 * Call only after notification permission is granted.
 * Returns null if FCM is not supported in this browser.
 */
export async function registerFCMToken() {
  try {
    const client = await messaging;
    if (!client) return null;
    const swReg = await navigator.serviceWorker.register(SW_PATH);
    const token = await getToken(client, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    return token || null;
  } catch {
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
