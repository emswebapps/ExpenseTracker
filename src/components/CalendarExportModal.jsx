import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Download, Info } from 'lucide-react';
import Modal from './Modal';
import { getMonthBounds } from '../utils/helpers';
import {
  buildShiftsICS, downloadICS, formatDuration, icsFilename, resolveReminder, shareOrDownloadICS,
} from '../utils/calendarExport';

const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const RANGE_PRESETS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'month', label: 'This month' },
  { key: 'next90', label: 'Next 90 days' },
  { key: 'all', label: 'All shifts' },
  { key: 'custom', label: 'Custom' },
];

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
];

function rangeForPreset(key, custom) {
  switch (key) {
    case 'upcoming': return { start: todayStr(), end: null };
    case 'month': return getMonthBounds();
    case 'next90': return { start: todayStr(), end: addDaysStr(todayStr(), 90) };
    case 'all': return { start: null, end: null };
    default: return custom;
  }
}

const labelStyle = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--subtle)', marginBottom: '0.5rem',
};

/**
 * Export logged shifts as an .ics file that can be added to Outlook, Apple
 * Calendar or Google Calendar — with alarms so the phone gives a heads-up
 * before each shift.
 */
export default function CalendarExportModal({ jobs, shifts, onClose, initialJobId = 'all' }) {
  const [jobId, setJobId] = useState(initialJobId);
  const [preset, setPreset] = useState('upcoming');
  const [custom, setCustom] = useState(() => ({ start: todayStr(), end: addDaysStr(todayStr(), 30) }));
  const [reminder, setReminder] = useState('30');
  const [status, setStatus] = useState(null); // 'shared' | 'downloaded' | 'empty'

  const range = preset === 'custom' ? custom : rangeForPreset(preset, custom);

  const selected = useMemo(() => {
    return shifts.filter((s) => {
      if (!s.date) return false;
      if (jobId !== 'all' && s.jobId !== jobId) return false;
      if (range.start && s.date < range.start) return false;
      if (range.end && s.date > range.end) return false;
      return true;
    });
  }, [shifts, jobId, range.start, range.end]);

  const totals = useMemo(() => {
    const hours = selected.reduce((sum, s) => sum + (Number(s.hoursWorked) || 0), 0);
    const reminderMinutes = reminder === '' ? null : parseInt(reminder, 10);
    const withAlarm = selected.filter((s) => s.startTime && resolveReminder(s, reminderMinutes) !== null).length;
    const allDay = selected.filter((s) => !s.startTime).length;
    return { hours, withAlarm, allDay };
  }, [selected, reminder]);

  const calendarName = jobId === 'all'
    ? 'Work Shifts'
    : `${jobs.find((j) => j.id === jobId)?.name || 'Work'} Shifts`;

  function buildFile() {
    return {
      ics: buildShiftsICS({
        shifts: selected,
        jobs,
        reminderMinutes: reminder === '' ? null : parseInt(reminder, 10),
        calendarName,
      }),
      filename: icsFilename(calendarName),
    };
  }

  async function handleAddToCalendar() {
    if (selected.length === 0) { setStatus('empty'); return; }
    const { ics, filename } = buildFile();
    const result = await shareOrDownloadICS(ics, filename, calendarName);
    if (result !== 'cancelled') setStatus(result);
  }

  function handleDownload() {
    if (selected.length === 0) { setStatus('empty'); return; }
    const { ics, filename } = buildFile();
    downloadICS(ics, filename);
    setStatus('downloaded');
  }

  const chip = (active) => ({
    padding: '0.5rem 0.75rem', borderRadius: '0.625rem', fontSize: '0.8125rem', fontWeight: 700,
    cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    backgroundColor: active ? 'var(--accent-soft)' : 'var(--surface2)',
    color: active ? 'var(--accent-text)' : 'var(--muted)',
  });

  return (
    <Modal title="Add Shifts to Calendar" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {jobs.length > 1 && (
          <div>
            <p style={labelStyle}>Job</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button onClick={() => { setJobId('all'); setStatus(null); }} style={chip(jobId === 'all')}>All jobs</button>
              {jobs.map((j) => (
                <button key={j.id} onClick={() => { setJobId(j.id); setStatus(null); }} style={chip(jobId === j.id)}>
                  {j.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p style={labelStyle}>Shifts to include</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {RANGE_PRESETS.map((p) => (
              <button key={p.key} onClick={() => { setPreset(p.key); setStatus(null); }} style={chip(preset === p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div>
                <label className="app-label">Start</label>
                <input type="date" className="app-input" value={custom.start}
                  onChange={(e) => { setCustom((c) => ({ ...c, start: e.target.value })); setStatus(null); }} />
              </div>
              <div>
                <label className="app-label">End</label>
                <input type="date" className="app-input" value={custom.end}
                  onChange={(e) => { setCustom((c) => ({ ...c, end: e.target.value })); setStatus(null); }} />
              </div>
            </div>
          )}
        </div>

        <div>
          <p style={labelStyle}>Phone reminder</p>
          <select className="app-input" value={reminder}
            onChange={(e) => { setReminder(e.target.value); setStatus(null); }}>
            {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
            Shifts with their own reminder switched on keep that setting.
          </p>
        </div>

        {/* Summary */}
        <div style={{ backgroundColor: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
              {selected.length} shift{selected.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-text)' }}>
              {formatDuration(totals.hours)}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
            {totals.withAlarm} with an alert
            {totals.allDay > 0 && ` · ${totals.allDay} all-day (no start time, so no alert)`}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={handleAddToCalendar} className="app-btn-primary" disabled={selected.length === 0}
            style={selected.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
            <CalendarPlus size={18} /> Add to Calendar
          </button>
          <button onClick={handleDownload} className="app-btn-secondary" disabled={selected.length === 0}
            style={selected.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
            <Download size={16} /> Download .ics file
          </button>
        </div>

        {status === 'empty' && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--warn)', textAlign: 'center' }}>
            No shifts in this range — log some hours first.
          </p>
        )}
        {(status === 'shared' || status === 'downloaded') && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', backgroundColor: 'var(--positive-soft)', borderRadius: '0.75rem', padding: '0.75rem' }}>
            <Check size={15} style={{ color: 'var(--positive-text)', flexShrink: 0, marginTop: '0.125rem' }} />
            <p style={{ fontSize: '0.75rem', color: 'var(--positive-text)', lineHeight: 1.5 }}>
              {status === 'shared'
                ? 'Sent to the share sheet — pick Calendar (or Outlook) and confirm to add every shift.'
                : 'File saved. Open it to import: iPhone/Mac adds the shifts to Apple Calendar, Outlook imports it from File → Open & Export → Import.'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <Info size={13} style={{ color: 'var(--subtle)', flexShrink: 0, marginTop: '0.125rem', opacity: 0.7 }} />
          <p style={{ fontSize: '0.7rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
            Events keep the same ID each export, so re-exporting after you change your
            hours updates the shifts already on your calendar instead of duplicating them.
          </p>
        </div>
      </div>
    </Modal>
  );
}
