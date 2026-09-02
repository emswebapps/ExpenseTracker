import { dueMs } from './taskSort.js';
import { localISO } from '../../utils/dueDates.js';

/**
 * Sections — the columns you swipe between at the top of a list.
 *
 * A section is `{ id, name, order }` on the list, and an item points at one
 * with `sectionId`. Both are optional, so a list without sections behaves
 * exactly as it did before they existed.
 *
 * Ordering inside a section is deliberately *not* the urgency sort the rest of
 * the app uses. Buckets ("Overdue / Today / Tomorrow") are for triaging a list
 * you haven't arranged; a section is a list you already have. Sorting a week of
 * day headings by urgency would split Monday from Tuesday and put whichever day
 * is late at the top — which is precisely the arrangement the week was built to
 * avoid. Inside a section, days run in date order, full stop.
 */

/** A list's sections, in display order. */
export function sectionsOf(list) {
  return [...(list?.sections || [])].sort((a, b) => {
    const diff = (Number(a.order) || 0) - (Number(b.order) || 0);
    return diff !== 0 ? diff : String(a.name).localeCompare(String(b.name));
  });
}

export function hasSections(list) {
  return (list?.sections || []).length > 0;
}

const created = (item) => {
  const t = Date.parse(item.createdAt ?? '');
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Section order: dated rows first in date order, then undated ones in the order
 * they were added. Finished work sinks, the same way it does everywhere else —
 * a ticked-off Monday shouldn't hold the top of the column all week.
 */
export function plannerSort(items = []) {
  return [...items].sort((a, b) => {
    const doneA = a.status === 'done';
    const doneB = b.status === 'done';
    if (doneA !== doneB) return doneA ? 1 : -1;

    const dueA = dueMs(a);
    const dueB = dueMs(b);
    if (dueA != null && dueB != null && dueA !== dueB) return dueA - dueB;
    if ((dueA == null) !== (dueB == null)) return dueA == null ? 1 : -1;

    return created(a) - created(b);
  });
}

/**
 * A list's top-level rows split into their columns.
 *
 * Anything pointing at a section that no longer exists lands in the unsectioned
 * group rather than vanishing — the same promotion rule orphaned subtasks get.
 * That group is only included when it has something in it, and it comes first:
 * it's the inbox, and an item you haven't filed yet is the one you're most
 * likely to be looking for.
 *
 * @returns {{section: object|null, items: object[]}[]}
 */
export function splitBySection(list, roots = []) {
  const sections = sectionsOf(list);
  const known = new Set(sections.map((s) => s.id));

  const loose = roots.filter((i) => !i.sectionId || !known.has(i.sectionId));
  const groups = sections.map((section) => ({
    section,
    items: plannerSort(roots.filter((i) => i.sectionId === section.id)),
  }));

  return loose.length > 0
    ? [{ section: null, items: plannerSort(loose) }, ...groups]
    : groups;
}

/**
 * Which column to open on: the one holding the nearest work — today's week
 * rather than the first week ever created.
 *
 * The unfiled inbox is never the landing column while real sections exist. It
 * sits first so newly-added rows are findable, but opening a weekly planner on
 * a stray errand instead of on this week is not what anyone came for. Falls
 * back to the first column when nothing is dated.
 */
export function defaultSectionIndex(groups = [], now = Date.now()) {
  let best = -1;
  let bestDistance = Infinity;
  const realSections = groups.some((g) => g.section);

  groups.forEach((group, index) => {
    if (realSections && !group.section) return;
    for (const item of group.items) {
      if (item.status === 'done') continue;
      const due = dueMs(item);
      if (due == null) continue;
      // Ahead of now beats behind it, so a week that has started but not
      // finished still wins over the one before it.
      const distance = due >= now ? due - now : (now - due) * 4;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
  });

  if (best !== -1) return best;
  // Nothing dated: the first real section, or the inbox if that's all there is.
  const firstReal = groups.findIndex((g) => g.section);
  return firstReal === -1 ? 0 : firstReal;
}

/** The `order` value for a section appended to the end of a list. */
export function nextSectionOrder(list) {
  const orders = (list?.sections || []).map((s) => Number(s.order) || 0);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

// How far back a section stays in the main run of columns. Two weeks is enough
// to still be tidying up last week without carrying the whole year.
export const RECENT_SECTION_DAYS = 14;

/**
 * Split columns into the current run and the ones that have gone by.
 *
 * A weekly planner only ever adds: after a year it is fifty-two columns, and
 * finding this week means swiping past all of them. Older weeks are folded away
 * rather than deleted — they hold real history of what was actually done, and
 * a planner that quietly bins last month's record is worse than one with too
 * many columns.
 *
 * Only *dated* sections (the generated weeks, which carry `endDate`) can age
 * out. A hand-made section has no date and no implied lifetime, so it stays.
 *
 * @returns {{current: object[], earlier: object[]}}
 */
export function splitByAge(groups = [], now = new Date(), days = RECENT_SECTION_DAYS) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = localISO(cutoff);

  const current = [];
  const earlier = [];
  for (const group of groups) {
    const endDate = group.section?.endDate;
    if (endDate && endDate < cutoffISO) earlier.push(group);
    else current.push(group);
  }

  // Never fold everything away: a list whose only columns are old should still
  // show them rather than opening on an empty board behind a button.
  return current.length === 0 ? { current: earlier, earlier: [] } : { current, earlier };
}
