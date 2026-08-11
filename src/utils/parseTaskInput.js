import { localISO, isoInDays } from './dueDates.js';

/**
 * Pull a due date out of the end of a quick-add line: "trash out tomorrow 7pm"
 * becomes the task "trash out", due tomorrow at 19:00.
 *
 * Two rules keep this from being a nuisance:
 *
 *  - Only a phrase at the **end** of the line counts. "call the tomorrow
 *    people" keeps its name intact, because "tomorrow" isn't trailing.
 *  - Never leave an empty task. A line that is nothing but a date ("tomorrow")
 *    stays as its own literal task name rather than becoming a nameless one.
 *
 * A mis-parse is always visible — the new task shows its due badge straight
 * away — and fixable from the clock button on the row.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n) => String(n).padStart(2, '0');

/** "7pm" / "7:30 pm" / "19:00" → "HH:MM", or null if it isn't a time. */
function parseClock(raw) {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '');
  let m = text.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return null;
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(min)}`;
  }
  // 24-hour form needs the colon — a bare "1500" is far more likely to be a
  // quantity or an order number than a time.
  m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${pad(h)}:${pad(min)}`;
  }
  return null;
}

/** The next date falling on `weekday`, always in the future. */
function nextWeekday(weekday, from, forceNextWeek) {
  const base = new Date(from);
  let delta = (weekday - base.getDay() + 7) % 7;
  if (delta === 0) delta = 7;            // "friday" on a Friday means next Friday
  if (forceNextWeek && delta < 7) delta += 7;
  return isoInDays(delta, base);
}

/** A day phrase → "YYYY-MM-DD", or null. */
function parseDayPhrase(raw, now) {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  if (text === 'today' || text === 'tonight') return localISO(now);
  if (text === 'tomorrow' || text === 'tmrw') return isoInDays(1, now);

  let m = text.match(/^(?:next\s+)?(\w+)$/);
  if (m) {
    const forceNextWeek = text.startsWith('next ');
    const word = m[1];
    const idx = WEEKDAYS.indexOf(word) !== -1 ? WEEKDAYS.indexOf(word) : WEEKDAY_ABBR.indexOf(word);
    if (idx !== -1) return nextWeekday(idx, now, forceNextWeek);
    if (word === 'week' && forceNextWeek) return isoInDays(7, now);
  }

  m = text.match(/^in\s+(\d{1,3})\s+(day|days|week|weeks)$/);
  if (m) return isoInDays(Number(m[1]) * (m[2].startsWith('week') ? 7 : 1), now);

  // "8/14" or "8-14", optionally with a year.
  m = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = m[3] ? Number(m[3]) : null;
    if (year != null && year < 100) year += 2000;
    if (year == null) {
      // No year given: assume the next occurrence rather than a past date.
      year = now.getFullYear();
      if (new Date(`${year}-${pad(month)}-${pad(day)}T23:59`) < now) year += 1;
    }
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // "aug 14" / "14 aug"
  m = text.match(/^([a-z]{3,9})\s+(\d{1,2})$/) || text.match(/^(\d{1,2})\s+([a-z]{3,9})$/);
  if (m) {
    const [monthWord, dayWord] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const month = MONTHS.indexOf(monthWord.slice(0, 3)) + 1;
    const day = Number(dayWord);
    if (month === 0 || day < 1 || day > 31) return null;
    let year = now.getFullYear();
    if (new Date(`${year}-${pad(month)}-${pad(day)}T23:59`) < now) year += 1;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
}

/**
 * @returns {{name: string, dueDate: string|null, dueTime: string|null}}
 */
export function parseTaskInput(input, now = new Date()) {
  const original = String(input ?? '').trim();
  const empty = { name: original, dueDate: null, dueTime: null };
  if (!original) return empty;

  const words = original.split(/\s+/);
  let dueTime = null;
  let dueDate = null;
  let end = words.length;

  // Work backwards from the end: an optional clock time, then an optional day
  // phrase of up to three words ("in 2 weeks", "next friday", "aug 14").
  const timeCandidate = parseClock(words[end - 1] ?? '');
  if (timeCandidate) {
    dueTime = timeCandidate;
    end -= 1;
    // "at 7pm" — drop the preposition too.
    if (words[end - 1]?.toLowerCase() === 'at') end -= 1;
    // "7 pm" arrives as two words.
  } else if (end >= 2 && parseClock(`${words[end - 2]} ${words[end - 1]}`)) {
    dueTime = parseClock(`${words[end - 2]} ${words[end - 1]}`);
    end -= 2;
    if (words[end - 1]?.toLowerCase() === 'at') end -= 1;
  }

  for (const span of [3, 2, 1]) {
    if (end - span < 0) continue;
    const phrase = words.slice(end - span, end).join(' ');
    const parsed = parseDayPhrase(phrase, now);
    if (parsed) {
      dueDate = parsed;
      end -= span;
      // "due friday" / "on friday" / "by friday" read naturally — drop the lead-in.
      if (['due', 'on', 'by'].includes(words[end - 1]?.toLowerCase())) end -= 1;
      break;
    }
  }

  if (!dueDate && !dueTime) return empty;

  const name = words.slice(0, end).join(' ').trim();
  // A line that was nothing but a date has no task left in it — keep the text
  // as typed rather than creating something nameless.
  if (!name) return empty;

  return { name, dueDate, dueTime };
}
