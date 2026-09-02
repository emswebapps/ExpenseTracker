import { localISO } from '../../utils/dueDates.js';

/**
 * The weekly planner: a task list arranged the way a paper week is, as one
 * section per week holding one heading per day.
 *
 * This is the shape of the Reminders list this replaced — "September 7th–13th"
 * as a column, "📅 MONDAY 📅 9/7/26" as a row inside it, and the actual work as
 * subtasks under the day. Building that by hand every Sunday is the chore this
 * removes: a list with `weekly.enabled` keeps the current week and the next one
 * standing at all times.
 *
 * Everything here is pure and works in "YYYY-MM-DD" strings in local time, so
 * the generated dates are the ones the person reading the phone would write.
 */

/** Sunday-first, matching JS `getDay()`. */
export const WEEKDAYS = [
  { day: 0, short: 'Sun', long: 'SUNDAY' },
  { day: 1, short: 'Mon', long: 'MONDAY' },
  { day: 2, short: 'Tue', long: 'TUESDAY' },
  { day: 3, short: 'Wed', long: 'WEDNESDAY' },
  { day: 4, short: 'Thu', long: 'THURSDAY' },
  { day: 5, short: 'Fri', long: 'FRIDAY' },
  { day: 6, short: 'Sat', long: 'SATURDAY' },
];

export const WEEKLY_DEFAULTS = {
  enabled: false,
  startDay: 1,          // weeks begin on Monday
  days: [1, 2, 3, 4, 5, 6, 0],
  weeksAhead: 2,        // this week and the next one
  emoji: true,
  generatedThrough: null,
};

/** Fill in anything a list's weekly config doesn't say. */
export function weeklyConfig(list) {
  const raw = list?.weekly || {};
  const days = Array.isArray(raw.days) && raw.days.length > 0 ? raw.days : WEEKLY_DEFAULTS.days;
  return {
    ...WEEKLY_DEFAULTS,
    ...raw,
    days,
    weeksAhead: Math.min(8, Math.max(1, Number(raw.weeksAhead) || WEEKLY_DEFAULTS.weeksAhead)),
  };
}

/** "YYYY-MM-DD" of the day the week containing `date` begins on. */
export function weekStartISO(date, startDay = 1) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0); // midday, so a DST change can't roll the date
  const shift = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - shift);
  return localISO(d);
}

/** "YYYY-MM-DD", `n` days on from another. */
export function addDaysISO(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() + n);
  return localISO(date);
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "September 7th–13th", or "August 31st – September 6th" when the week
 * straddles two months. The label a person would write at the top of the page.
 */
export function weekLabel(startISO, endISO) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${ordinal(sd)}–${ordinal(ed)}`;
  return `${MONTHS[sm - 1]} ${ordinal(sd)} – ${MONTHS[em - 1]} ${ordinal(ed)}`;
}

/**
 * A stable id for a week's section, so generating twice can't produce two
 * columns for the same week — no matching on labels, which a rename would
 * break.
 */
export function weekSectionId(startISO) {
  return `wk-${startISO}`;
}

/** The dates a week covers, in the order they're shown. */
export function weekDates(startISO, days = WEEKLY_DEFAULTS.days, startDay = 1) {
  const wanted = new Set(days);
  const out = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const dayOfWeek = (startDay + offset) % 7;
    if (!wanted.has(dayOfWeek)) continue;
    out.push({ dateISO: addDaysISO(startISO, offset), dayOfWeek });
  }
  return out;
}

/** "📅 MONDAY 📅", or just "MONDAY" with the emoji turned off. */
export function dayHeadingName(dayOfWeek, emoji = true) {
  const name = WEEKDAYS.find((w) => w.day === dayOfWeek)?.long || '';
  return emoji ? `📅 ${name} 📅` : name;
}

/** The id given to a generated day heading — deterministic, like the section. */
export function dayHeadingId(listId, dateISO) {
  return `day-${listId}-${dateISO}`;
}

/**
 * What's missing from a weekly list right now: the week sections that don't
 * exist yet and the day headings that go in them.
 *
 * Returns `null` when the list is already up to date, so the caller can skip
 * the write entirely — this runs on every load, and a no-op has to cost
 * nothing.
 *
 * Two guards keep it from fighting the person using it:
 *
 *   1. A week whose section id is already there is never rebuilt, so a renamed
 *      column or a rearranged week survives.
 *   2. `generatedThrough` records the last week start this has built, and weeks
 *      at or before it are never built again. Deleting a week you don't want is
 *      final rather than something that grows back tomorrow.
 */
export function planWeeks(list, items = [], now = new Date()) {
  const cfg = weeklyConfig(list);
  if (!cfg.enabled) return null;

  const existingSections = new Set((list.sections || []).map((s) => s.id));
  const existingItems = new Set(items.filter((i) => i.listId === list.id).map((i) => i.id));
  const thisWeek = weekStartISO(now, cfg.startDay);

  const sections = [];
  const newItems = [];
  let generatedThrough = cfg.generatedThrough;

  for (let w = 0; w < cfg.weeksAhead; w += 1) {
    const startISO = addDaysISO(thisWeek, w * 7);
    if (cfg.generatedThrough && startISO <= cfg.generatedThrough) continue;
    generatedThrough = generatedThrough && generatedThrough > startISO ? generatedThrough : startISO;
    if (existingSections.has(weekSectionId(startISO))) continue;

    const dates = weekDates(startISO, cfg.days, cfg.startDay);
    const endISO = addDaysISO(startISO, 6);
    sections.push({
      id: weekSectionId(startISO),
      name: weekLabel(startISO, endISO),
      startDate: startISO,
      endDate: endISO,
      order: Date.parse(`${startISO}T00:00:00Z`),
    });

    for (const { dateISO, dayOfWeek } of dates) {
      const id = dayHeadingId(list.id, dateISO);
      if (existingItems.has(id)) continue;
      newItems.push({
        id,
        listId: list.id,
        sectionId: weekSectionId(startISO),
        parentId: null,
        header: true,
        name: dayHeadingName(dayOfWeek, cfg.emoji),
        notes: null,
        address: null,
        status: 'pending',
        completedAt: null,
        flagged: false,
        dueDate: dateISO,
        dueTime: null,
        // A day heading never buzzes: it's a label for a date, and the work
        // under it carries its own reminders.
        notifyEnabled: false,
        remindOffsetMinutes: 0,
        repeat: null,
        attachments: [],
      });
    }
  }

  if (sections.length === 0 && newItems.length === 0) return null;
  return { sections, items: newItems, generatedThrough };
}

/** The week section a date belongs to, whether or not it exists yet. */
export function weekSectionFor(dateISO, startDay = WEEKLY_DEFAULTS.startDay) {
  const startISO = weekStartISO(new Date(`${dateISO}T12:00:00`), startDay);
  const endISO = addDaysISO(startISO, 6);
  return {
    id: weekSectionId(startISO),
    name: weekLabel(startISO, endISO),
    startDate: startISO,
    endDate: endISO,
    order: Date.parse(`${startISO}T00:00:00Z`),
  };
}

/** The day of the week a "YYYY-MM-DD" falls on. */
function dayOfWeekFor(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}

/**
 * File dated tasks into the week they actually fall in, building that week if
 * it isn't there yet.
 *
 * This is what makes "add it to a day three months out" work. `planWeeks` only
 * keeps the standing weeks built, so before this, dating a task in December
 * left it stranded in whichever column happened to be open — there was no
 * December to put it in, and no way to reach one short of pressing "Add
 * another week" fifteen times.
 *
 * Now the date leads and the structure follows: give a task a date and its
 * week section and day heading are created around it.
 *
 * What it deliberately leaves alone:
 *
 *   - undated tasks, and finished ones — re-filing history is churn
 *   - the day headings themselves, which are placed when generated
 *   - anything sitting in a hand-made section (no `endDate`), because that was
 *     a deliberate choice about where it goes and a date shouldn't override it
 *   - the nesting of a genuine subtask: a task under "Book the venue" stays
 *     under it. Only a task nested under a *day heading*, or under nothing at
 *     all, gets re-homed to the new date's heading.
 *
 * Pure, and returns null when there's nothing to do — it runs on every change
 * to the list, so the common answer has to be cheap.
 *
 * @returns {{sections: object[], items: object[], patches: object[]}|null}
 */
export function refileByDate(list, items = []) {
  const cfg = weeklyConfig(list);
  if (!cfg.enabled) return null;

  const mine = items.filter((i) => i.listId === list.id);
  if (mine.length === 0) return null;

  const byId = new Map(mine.map((i) => [i.id, i]));
  const existingSections = new Map((list.sections || []).map((sec) => [sec.id, sec]));
  const newSections = new Map();
  const newHeadings = new Map();
  const patches = [];

  for (const item of mine) {
    if (!item.dueDate || item.header) continue;
    if (item.status === 'done') continue;

    // A hand-made section is a decision; a generated week is a filing rule.
    const currentSection = existingSections.get(item.sectionId);
    if (currentSection && !currentSection.endDate) continue;

    const target = weekSectionFor(item.dueDate, cfg.startDay);
    const headingId = dayHeadingId(list.id, item.dueDate);
    const parent = item.parentId ? byId.get(item.parentId) : null;

    // Only re-home tasks that hang off a day, or off nothing.
    const followsTheDay = !parent || !!parent.header;
    const wantsParent = followsTheDay ? headingId : item.parentId;
    const alreadyRight = item.sectionId === target.id && item.parentId === wantsParent;
    if (alreadyRight) continue;

    if (!existingSections.has(target.id) && !newSections.has(target.id)) {
      newSections.set(target.id, target);
    }

    if (followsTheDay && !byId.has(headingId) && !newHeadings.has(headingId)) {
      newHeadings.set(headingId, {
        id: headingId,
        listId: list.id,
        sectionId: target.id,
        parentId: null,
        header: true,
        name: dayHeadingName(dayOfWeekFor(item.dueDate), cfg.emoji),
        notes: null,
        address: null,
        status: 'pending',
        completedAt: null,
        flagged: false,
        dueDate: item.dueDate,
        dueTime: null,
        notifyEnabled: false,
        remindOffsetMinutes: 0,
        repeat: null,
        attachments: [],
      });
    }

    patches.push({ id: item.id, sectionId: target.id, parentId: wantsParent });
  }

  if (patches.length === 0 && newSections.size === 0) return null;
  return {
    sections: [...newSections.values()],
    items: [...newHeadings.values()],
    patches,
  };
}
