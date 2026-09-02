/**
 * Applying a guest's edits to a shared list.
 *
 * A guest holding a share link can't write the owner's document — they append
 * an op to `listShares/{token}/ops` and this applies it. That's the whole
 * reason the collaborative list needs a function at all: the owner's data is
 * one big document, and handing an anonymous browser write access to it would
 * mean handing over every bill, every debt and every note in the app.
 *
 * So this is the trust boundary. The rules pin the *shape* of an op; this
 * decides what it's allowed to mean:
 *
 *   - only items belonging to this share's list can be touched, so a leaked
 *     link can't reach another list, let alone another collection
 *   - only the fields a guest is allowed to set are copied across
 *   - a day heading can't be renamed, re-dated, deleted or ticked off: the
 *     week's structure belongs to the owner
 *   - names and notes are length-capped, so one op can't bloat the document
 *
 * Everything here is pure and takes the items array, so the decisions are
 * unit-testable without Firestore. Mirrors src/pages/lists/shareOps.js — the
 * two must agree, or a guest's own screen will disagree with what was saved.
 */

const OP_TYPES = ['add', 'update', 'delete', 'toggle'];
const GUEST_FIELDS = ['name', 'notes', 'dueDate', 'dueTime', 'parentId', 'sectionId'];
const MAX_NAME_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
// A guest can't fill the owner's document up. Well past any real list.
const MAX_ITEMS_PER_LIST = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^\d{2}:\d{2}$/;

/** A heading is the owner's structure, not a task a guest may act on. */
function isHeading(item) {
  return !!item && !!item.header;
}

function cleanName(value) {
  return String(value == null ? '' : value).slice(0, MAX_NAME_LENGTH).trim();
}

/**
 * The subset of an op's fields that may be written, with each value coerced to
 * something the app can render. An unparseable date is dropped rather than
 * stored — a bad `dueDate` would put the task in a bucket nothing can reach.
 */
function cleanFields(fields) {
  const out = {};
  if (!fields || typeof fields !== 'object') return out;

  for (const key of GUEST_FIELDS) {
    if (!(key in fields)) continue;
    const value = fields[key];

    if (value === null) { out[key] = null; continue; }

    if (key === 'name') {
      const name = cleanName(value);
      if (name) out.name = name;
    } else if (key === 'notes') {
      out.notes = String(value).slice(0, MAX_NOTES_LENGTH).trim() || null;
    } else if (key === 'dueDate') {
      const date = String(value);
      if (ISO_DATE.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`))) out.dueDate = date;
    } else if (key === 'dueTime') {
      const time = String(value);
      if (CLOCK_TIME.test(time)) out.dueTime = time;
    } else {
      // parentId / sectionId are checked against what exists, below.
      out[key] = String(value).slice(0, 64) || null;
    }
  }
  return out;
}

/** Epoch ms for a "YYYY-MM-DD" + "HH:MM" read in `tz`. Injected by the caller. */
function dueAtOf(fields, tz, wallClockToMs) {
  if (!fields.dueDate) return null;
  return wallClockToMs(fields.dueDate, fields.dueTime, tz);
}

/**
 * Apply one op to the owner's full item array.
 *
 * @param {object[]} items - every shoppingItem the owner has, not just this list's
 * @param {object} op - the guest's op, as written to Firestore
 * @param {object} ctx - { listId, tz, wallClockToMs, now }
 * @returns {{items: object[], change: object}|null} null when the op is refused
 */
function applyOp(items, op, ctx) {
  if (!op || !OP_TYPES.includes(op.type)) return null;
  if (typeof op.itemId !== 'string' || !op.itemId || op.itemId.length > 64) return null;

  const { listId, tz, wallClockToMs, now = Date.now() } = ctx;
  const by = typeof op.by === 'string' && op.by.trim() ? op.by.trim().slice(0, 60) : 'Someone';
  const mine = items.filter((i) => i.listId === listId);
  const target = items.find((i) => i.id === op.itemId);
  const fields = cleanFields(op.fields);

  // A parent or section named by the guest has to be one on *this* list.
  if (fields.parentId) {
    const parent = mine.find((i) => i.id === fields.parentId);
    if (!parent) fields.parentId = null;
  }
  if (fields.sectionId) {
    // Sections live on the list document; the caller passes the valid ids.
    if (!(ctx.sectionIds || []).includes(fields.sectionId)) fields.sectionId = null;
  }

  switch (op.type) {
    case 'add': {
      if (target) return null;                                  // id already used
      if (!fields.name) return null;                            // nothing to add
      if (mine.length >= MAX_ITEMS_PER_LIST) return null;       // list is full

      const item = {
        id: op.itemId,
        listId,
        parentId: fields.parentId ?? null,
        sectionId: fields.sectionId ?? null,
        name: fields.name,
        notes: fields.notes ?? null,
        address: null,
        header: false,
        status: 'pending',
        completedAt: null,
        flagged: false,
        dueDate: fields.dueDate ?? null,
        dueTime: fields.dueTime ?? null,
        dueAt: dueAtOf(fields, tz, wallClockToMs),
        // A guest can't arm the owner's phone. The owner turns a reminder on
        // themselves if they want one.
        notifyEnabled: false,
        remindOffsetMinutes: 0,
        repeat: null,
        attachments: [],
        createdAt: new Date(now).toISOString(),
        addedBy: by,
      };
      return {
        items: [...items, item],
        change: { kind: 'add', by, name: item.name, at: now },
      };
    }

    case 'update': {
      if (!target || target.listId !== listId) return null;
      if (isHeading(target)) return null;
      const patch = { ...fields };
      delete patch.parentId;   // moving a task between parents is the owner's call
      if (Object.keys(patch).length === 0) return null;
      if ('name' in patch && !patch.name) delete patch.name;

      const next = { ...target, ...patch };
      if ('dueDate' in patch || 'dueTime' in patch) {
        next.dueAt = dueAtOf({ dueDate: next.dueDate, dueTime: next.dueTime }, tz, wallClockToMs);
      }
      return {
        items: items.map((i) => (i.id === target.id ? next : i)),
        change: { kind: 'update', by, name: next.name, at: now },
      };
    }

    case 'toggle': {
      if (!target || target.listId !== listId) return null;
      if (isHeading(target)) return null;
      const done = target.status === 'done';
      const next = {
        ...target,
        status: done ? 'pending' : 'done',
        completedAt: done ? null : new Date(now).toISOString(),
      };
      return {
        items: items.map((i) => (i.id === target.id ? next : i)),
        change: { kind: done ? 'reopen' : 'complete', by, name: target.name, at: now },
      };
    }

    case 'delete': {
      if (!target || target.listId !== listId) return null;
      if (isHeading(target)) return null;

      // Subtasks go with their parent, matching the owner's own delete.
      const doomed = new Set([target.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const i of mine) {
          if (i.parentId && doomed.has(i.parentId) && !doomed.has(i.id)) {
            doomed.add(i.id);
            grew = true;
          }
        }
      }
      return {
        items: items.filter((i) => !doomed.has(i.id)),
        change: { kind: 'delete', by, name: target.name, at: now, count: doomed.size },
      };
    }

    default:
      return null;
  }
}

/** "Chris added \"Milk\"" — one line for the owner's activity feed. */
function describeChange(change) {
  const who = change.by || 'Someone';
  const name = change.name || 'a task';
  switch (change.kind) {
    case 'add': return `${who} added "${name}"`;
    case 'complete': return `${who} ticked off "${name}"`;
    case 'reopen': return `${who} re-opened "${name}"`;
    case 'update': return `${who} edited "${name}"`;
    case 'delete': return change.count > 1
      ? `${who} deleted "${name}" and ${change.count - 1} subtask${change.count === 2 ? '' : 's'}`
      : `${who} deleted "${name}"`;
    default: return `${who} changed the list`;
  }
}

module.exports = {
  applyOp,
  cleanFields,
  describeChange,
  isHeading,
  OP_TYPES,
  GUEST_FIELDS,
  MAX_ITEMS_PER_LIST,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
};
