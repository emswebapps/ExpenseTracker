// The iCalendar (.ics) plumbing shared by every "add to Calendar" export —
// shifts and tasks alike. Apple Calendar, Google Calendar and Outlook all
// import these files.
//
// Times are written "floating" — no time zone — so a 7:00 entry lands at 7:00
// on whatever device opens the file, which is how it was entered.

const CRLF = '\r\n';

export function escapeText(s) {
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

export function ymd(dateStr) {
  return dateStr.replace(/-/g, '');
}

export function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" + "HH:MM" → a floating local DATE-TIME. */
export function localStamp(dateStr, time) {
  const [h, m] = time.split(':');
  return `${ymd(dateStr)}T${h.padStart(2, '0')}${(m || '00').padStart(2, '0')}00`;
}

export function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
}

/** A display alert, `trigger` being an RFC 5545 duration such as "-PT30M". */
export function alarmLines(description, trigger) {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(description)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
  ];
}

/** Wrap already-built VEVENT lines into the text of a whole .ics file. */
export function buildCalendar(eventLines, { calendarName, product }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//ExpenseTracker//${product}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...eventLines,
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
