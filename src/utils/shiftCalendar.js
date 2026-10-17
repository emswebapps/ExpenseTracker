// Turns logged shifts into an iCalendar (.ics) file that Apple Calendar,
// Google Calendar and Outlook can all import. Apple Calendar then carries the
// events to anything synced to it (TimeTree, a watch, a shared calendar).
//
// Every event's UID is the shift's id, so re-importing the same shift is
// recognised as the same event rather than a brand new one.

import {
  escapeText, ymd, nextDay, localStamp, utcStamp, isISODate, alarmLines, buildCalendar,
} from './ics.js';

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
    lines.push(...alarmLines(title, `-PT${mins}M`));
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
    .filter((s) => s && s.id && isISODate(s.date))
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));

  return buildCalendar(
    sorted.flatMap((s) => shiftEvent(s, jobById.get(s.jobId), dtstamp)),
    { calendarName, product: 'Work Time' },
  );
}
