// Turns logged shifts into an iCalendar (.ics) file that Apple Calendar,
// Google Calendar and Outlook can all import. Apple Calendar then carries the
// events to anything synced to it (TimeTree, a watch, a shared calendar).
//
// Times are written "floating" — no time zone — so a 7:00 shift lands at 7:00
// on whatever device opens the file, which is how the shift was entered.
// Every event's UID is the shift's id, so re-importing the same shift is
// recognised as the same event rather than a brand new one.

const CRLF = '\r\n';

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 caps a line at 75 octets; longer ones continue on the next line
// after a single leading space. Split on characters, counting UTF-8 bytes, so
// an emoji or accented letter is never cut in half.
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

function ymd(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function localStamp(dateStr, time) {
  const [h, m] = time.split(':');
  return `${ymd(dateStr)}T${h.padStart(2, '0')}${(m || '00').padStart(2, '0')}00`;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatHours(h) {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n * 100) / 100}h`;
}

function shiftEvent(shift, job, dtstamp) {
  const title = job?.name || 'Work';
  const lines = [
    'BEGIN:VEVENT',
    `UID:shift-${shift.id}@expensetracker`,
    `DTSTAMP:${dtstamp}`,
  ];

  if (shift.startTime && shift.endTime) {
    // An end at or before the start is an overnight shift — it ends tomorrow.
    const endDate = shift.endTime <= shift.startTime ? nextDay(shift.date) : shift.date;
    lines.push(`DTSTART:${localStamp(shift.date, shift.startTime)}`);
    lines.push(`DTEND:${localStamp(endDate, shift.endTime)}`);
    lines.push(`SUMMARY:${escapeText(title)}`);
  } else {
    // Only hours were logged, no clock times: an all-day entry that says how
    // long the day was, so it doesn't pretend to a start time nobody gave.
    const hrs = formatHours(shift.hoursWorked);
    lines.push(`DTSTART;VALUE=DATE:${ymd(shift.date)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(nextDay(shift.date))}`);
    lines.push(`SUMMARY:${escapeText(hrs ? `${title} (${hrs})` : title)}`);
    lines.push('TRANSP:TRANSPARENT');
  }

  if (shift.location) lines.push(`LOCATION:${escapeText(shift.location)}`);

  const desc = [formatHours(shift.hoursWorked), shift.notes].filter(Boolean).join(' · ');
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);

  if (shift.notificationEnabled && shift.startTime) {
    const mins = parseInt(shift.notificationOffsetMinutes, 10) || 30;
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      `TRIGGER:-PT${mins}M`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build the text of an .ics file for the given shifts.
 * `now` is only there so tests get a stable DTSTAMP.
 */
export function buildShiftsIcs(shifts, jobs, { calendarName = 'Work Shifts', now = new Date() } = {}) {
  const jobById = new Map((jobs || []).map((j) => [j.id, j]));
  const dtstamp = utcStamp(now);
  const sorted = [...(shifts || [])]
    .filter((s) => s && s.id && /^\d{4}-\d{2}-\d{2}$/.test(s.date || ''))
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ExpenseTracker//Work Time//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...sorted.flatMap((s) => shiftEvent(s, jobById.get(s.jobId), dtstamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
