// ── Work shifts → iCalendar (.ics) ──
// Builds an RFC 5545 calendar file that imports into Outlook, Apple Calendar
// (iPhone/Mac) and Google Calendar. Shifts with a start time become timed
// events anchored in UTC — unambiguous no matter which calendar reads them —
// with an optional VALARM so the phone alerts before the shift starts. Shifts
// logged with hours only (no clock times) become all-day events.

const PROD_ID = '-//Budget Tracker//Work Shifts//EN';
const UID_DOMAIN = 'budget-tracker.app';

// Bumping SEQUENCE on every export means a re-import always supersedes the
// previously imported copy of a shift instead of being ignored as stale.
const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1);

const pad = (n) => String(n).padStart(2, '0');

/** Escape a text value per RFC 5545 §3.3.11. */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line to 75 octets per RFC 5545 §3.1. */
export function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // Continuation lines start with a space, so they carry one less byte.
    const limit = parts.length === 0 ? 75 : 74;
    if (curBytes + size > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += size;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

/** Local wall-clock Date for a `YYYY-MM-DD` date and optional `HH:MM` time. */
function localDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/** `YYYYMMDDTHHMMSSZ` */
function utcStamp(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** `YYYYMMDD` for DATE-valued (all-day) properties. */
function dateValue(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr) {
  const d = localDateTime(dateStr);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (!h) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Human label for a reminder offset, used in the alarm description. */
function reminderLabel(minutes) {
  if (minutes === 0) return 'now';
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `in ${h} hour${h !== 1 ? 's' : ''}`;
  }
  return `in ${minutes} minutes`;
}

function trigger(minutes) {
  if (minutes === 0) return 'PT0S';
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

/**
 * Work out start/end instants for a shift.
 * Returns `{ allDay: true, startDate, endDate }` when the shift has no clock
 * times, otherwise `{ allDay: false, start, end }` as Date objects.
 */
export function shiftBounds(shift, job = {}) {
  if (!shift.startTime) {
    return { allDay: true, startDate: shift.date, endDate: nextDay(shift.date) };
  }
  const start = localDateTime(shift.date, shift.startTime);
  let end;
  if (shift.endTime) {
    end = localDateTime(shift.date, shift.endTime);
    // Overnight shift — the end time belongs to the following day.
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const hours = Number(shift.hoursWorked) || Number(job.normalShiftHours) || 8;
    end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  }
  return { allDay: false, start, end };
}

/**
 * Reminder offset in minutes for a shift, or `null` for no alarm.
 * A shift with its own reminder turned on wins over the export-wide default.
 */
export function resolveReminder(shift, defaultMinutes) {
  if (shift.notificationEnabled) {
    const own = parseInt(shift.notificationOffsetMinutes, 10);
    if (Number.isFinite(own) && own >= 0) return own;
  }
  return Number.isFinite(defaultMinutes) && defaultMinutes >= 0 ? defaultMinutes : null;
}

/**
 * Build the .ics text for a set of shifts.
 *
 * @param {Object[]} shifts            shifts to export (already filtered)
 * @param {Object[]} jobs              all jobs, for names and shift defaults
 * @param {number|null} reminderMinutes default alarm offset; null for none
 * @param {string} calendarName        X-WR-CALNAME shown by Apple/Google
 */
export function buildShiftsICS({ shifts, jobs = [], reminderMinutes = 30, calendarName = 'Work Shifts' }) {
  const now = new Date();
  const stamp = utcStamp(now);
  const sequence = Math.floor((now.getTime() - SEQUENCE_EPOCH) / 60000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PROD_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...(tz ? [`X-WR-TIMEZONE:${escapeText(tz)}`] : []),
  ];

  const sorted = [...shifts].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));

  for (const shift of sorted) {
    const job = jobs.find((j) => j.id === shift.jobId) || {};
    const jobName = job.name || 'Work';
    const bounds = shiftBounds(shift, job);
    const hours = Number(shift.hoursWorked) || 0;

    const summary = bounds.allDay && hours
      ? `${jobName} (${formatDuration(hours)})`
      : jobName;

    const details = [
      hours ? `Hours: ${formatDuration(hours)}` : null,
      shift.otExempt ? 'OT exempt (PTO / holiday)' : null,
      shift.notes || null,
    ].filter(Boolean);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:shift-${shift.id}@${UID_DOMAIN}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SEQUENCE:${sequence}`);
    if (bounds.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(bounds.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${dateValue(bounds.endDate)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(bounds.start)}`);
      lines.push(`DTEND:${utcStamp(bounds.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (details.length) lines.push(`DESCRIPTION:${escapeText(details.join('\n'))}`);
    if (shift.location) lines.push(`LOCATION:${escapeText(shift.location)}`);
    lines.push('CATEGORIES:Work');
    lines.push('STATUS:CONFIRMED');
    lines.push(`TRANSP:${bounds.allDay ? 'TRANSPARENT' : 'OPAQUE'}`);
    lines.push(`X-MICROSOFT-CDO-BUSYSTATUS:${bounds.allDay ? 'FREE' : 'BUSY'}`);

    // All-day shifts have no known start time, so an alarm would fire at
    // midnight — only timed shifts get one.
    const alarm = bounds.allDay ? null : resolveReminder(shift, reminderMinutes);
    if (alarm !== null) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`TRIGGER:${trigger(alarm)}`);
      lines.push(`DESCRIPTION:${escapeText(`${jobName} shift starts ${reminderLabel(alarm)}`)}`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Filename-safe slug for a job name. */
export function icsFilename(label) {
  const slug = String(label || 'work-shifts')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'work-shifts';
  return `${slug}-${new Date().toISOString().slice(0, 10)}.ics`;
}

/**
 * Hand the .ics to the OS. On a phone the share sheet is the path that lands in
 * Apple Calendar / Outlook, so try it first and fall back to a download.
 * Resolves with 'shared', 'cancelled' or 'downloaded'.
 */
export async function shareOrDownloadICS(ics, filename, title = 'Work Shifts') {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });

  if (typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], filename, { type: 'text/calendar' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // Anything else (share unsupported for this type, user agent quirk) —
        // fall through to a plain download.
      }
    }
  }

  downloadICS(blob, filename);
  return 'downloaded';
}

/** Save the .ics as a file download. */
export function downloadICS(icsOrBlob, filename) {
  const blob = icsOrBlob instanceof Blob
    ? icsOrBlob
    : new Blob([icsOrBlob], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
