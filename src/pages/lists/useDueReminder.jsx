import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  requestNotificationPermission, notificationPermission,
  REMINDER_LEAD_OPTIONS, localTodayISO, formatDueMoment,
} from '../../utils/notifications';
import { QUICK_DATES, isoInDays } from './listMeta';

// ── useDueReminder ────────────────────────────────────────────────────────────
// Due date/time plus the "remind me" switch, shared by the task editor and the
// list editor so both behave identically — same permission prompt, same
// "a time with no date means today" rule.
export function useDueReminder(initial = {}, defaultLeadMinutes = 0) {
  const [dueDate, setDueDate] = useState(initial.dueDate || '');
  const [dueTime, setDueTime] = useState(initial.dueTime || '');
  const [notifyEnabled, setNotifyEnabled] = useState(initial.notifyEnabled ?? false);
  const [remindOffset, setRemindOffset] = useState(
    initial.remindOffsetMinutes ?? defaultLeadMinutes ?? 0
  );
  const [permDenied, setPermDenied] = useState(false);

  const ensurePermission = async () => {
    const perm = notificationPermission();
    if (perm === 'granted') return true;
    if (perm === 'denied') { setPermDenied(true); return false; }
    const result = await requestNotificationPermission();
    if (result === 'granted') return true;
    setPermDenied(true);
    return false;
  };

  const handleNotifyToggle = async () => {
    if (notifyEnabled) { setNotifyEnabled(false); return; }
    if (await ensurePermission()) setNotifyEnabled(true);
  };

  /**
   * The fields to save. A time with no date means "today at that time"; neither
   * one means no deadline at all, which also switches the reminder off.
   */
  const dueFields = () => {
    const resolvedDate = dueDate || (dueTime ? localTodayISO() : null);
    const hasDeadline = !!resolvedDate;
    return {
      dueDate: resolvedDate,
      dueTime: hasDeadline ? (dueTime || null) : null,
      notifyEnabled: hasDeadline ? notifyEnabled : false,
      remindOffsetMinutes: hasDeadline && notifyEnabled ? Number(remindOffset) || 0 : 0,
    };
  };

  return {
    dueDate, setDueDate, dueTime, setDueTime,
    notifyEnabled, remindOffset, setRemindOffset,
    permDenied, handleNotifyToggle, dueFields,
  };
}

/** The date/time inputs, quick-date chips and reminder switch as one block. */
export function DueReminderFields({ due, help, notifyLabel }) {
  const {
    dueDate, setDueDate, dueTime, setDueTime,
    notifyEnabled, remindOffset, setRemindOffset,
    permDenied, handleNotifyToggle,
  } = due;

  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="app-label">Due Date</label>
          <input className="app-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="app-label">Due Time</label>
          <input className="app-input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '-0.5rem' }}>
        {QUICK_DATES.map(({ label, days }) => {
          const iso = isoInDays(days);
          const active = dueDate === iso;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDueDate(active ? '' : iso)}
              style={{
                padding: '0.3125rem 0.625rem', borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: '600',
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                color: active ? 'var(--accent-text)' : 'var(--muted)', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
        {(dueDate || dueTime) && (
          <button
            type="button"
            onClick={() => { setDueDate(''); setDueTime(''); if (notifyEnabled) handleNotifyToggle(); }}
            style={{
              padding: '0.3125rem 0.625rem', borderRadius: '0.625rem', fontSize: '0.75rem', fontWeight: '600',
              border: '1.5px solid var(--border)', backgroundColor: 'transparent',
              color: 'var(--subtle)', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '-0.5rem' }}>
        {formatDueMoment(dueDate, dueTime) ? `Due ${formatDueMoment(dueDate, dueTime)}.` : help}
      </p>
      {(dueDate || dueTime) && (
        <div>
          <button
            type="button"
            onClick={handleNotifyToggle}
            style={{
              width: '100%', padding: '0.75rem', borderRadius: '0.75rem',
              border: `2px solid ${notifyEnabled ? 'var(--accent)' : 'var(--border)'}`,
              backgroundColor: notifyEnabled ? 'rgba(99,102,241,0.1)' : 'var(--surface2)',
              color: notifyEnabled ? 'var(--accent-text)' : 'var(--muted)',
              fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
            }}
          >
            {notifyEnabled ? <Bell size={15} /> : <BellOff size={15} />}
            {notifyEnabled ? `${notifyLabel} (on)` : notifyLabel}
          </button>
          {notifyEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', flexShrink: 0 }}>Remind me</span>
              <select
                value={remindOffset}
                onChange={(e) => setRemindOffset(Number(e.target.value))}
                style={{ flex: 1, backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.375rem 0.5rem', color: 'var(--text)', fontSize: '0.875rem' }}
              >
                {REMINDER_LEAD_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      {permDenied && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>
          Notifications are blocked in your browser settings.
        </p>
      )}
    </>
  );
}
