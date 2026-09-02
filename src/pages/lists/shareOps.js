/**
 * The edit vocabulary a shared list speaks.
 *
 * A guest opening a share link never writes the owner's data directly. They
 * append an *op* — "add this task", "tick that one off" — to
 * `listShares/{token}/ops`, and a Cloud Function applies it to the owner's
 * document. The owner's blob stays the single source of truth, so the reminder
 * functions, the offline cache and every existing sync path carry on working
 * untouched, and a guest can't clobber a document they can't see.
 *
 * Four ops cover what a shared list needs. Deliberately no op for photos,
 * repeats, reminders or list settings: those belong to the owner, and each one
 * added is another thing a leaked link could do.
 *
 * This module is the client half. `functions/listOps.js` applies the same ops
 * server-side and is the half that decides what is allowed — never trust the
 * shape that arrives here, it came from a browser.
 */

export const OP_TYPES = ['add', 'update', 'delete', 'toggle'];

/**
 * A day heading is the owner's structure, not work a guest may act on. The
 * guest UI doesn't offer the buttons, but the rule belongs in the model too —
 * `functions/listOps.js` refuses these, and a client that allowed one would
 * show a change that silently rolled back a second later.
 */
const isHeadingItem = (item) => !!item && !!item.header;

/** Fields a guest may set. Anything else in an op is dropped on arrival. */
export const GUEST_FIELDS = ['name', 'notes', 'dueDate', 'dueTime', 'parentId', 'sectionId'];

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 1000;

/** Trim a guest's field values to what the server will accept. */
export function cleanFields(fields = {}) {
  const out = {};
  for (const key of GUEST_FIELDS) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value == null) { out[key] = null; continue; }
    if (key === 'name') out[key] = String(value).slice(0, MAX_NAME_LENGTH).trim();
    else if (key === 'notes') out[key] = String(value).slice(0, MAX_NOTES_LENGTH).trim() || null;
    else out[key] = String(value).slice(0, 64) || null;
  }
  return out;
}

/**
 * Apply one op to a list of items, returning a new list.
 *
 * The guest's own screen runs this too, so an added task appears the instant
 * it's typed rather than a second later when the function has caught up. That
 * makes it worth keeping honest: this must land on the same answer the server
 * does, or the row will jump when the mirror comes back.
 *
 * `listId` scopes the op to one list, the way the server scopes it to the
 * share's list. Pass it: without it an op naming an item from somewhere else
 * would be applied here and refused there, which is the divergence
 * `shareOps.parity.test.js` exists to catch.
 */
export function applyOp(items = [], op, listId = null) {
  if (!op || !OP_TYPES.includes(op.type)) return items;

  /** The op's target, or undefined when it isn't ours to touch. */
  const targetOf = () => {
    const found = items.find((i) => i.id === op.itemId);
    if (!found) return undefined;
    if (listId != null && found.listId !== listId) return undefined;
    return found;
  };

  switch (op.type) {
    case 'add': {
      if (!op.itemId || items.some((i) => i.id === op.itemId)) return items;
      const fields = cleanFields(op.fields);
      if (!fields.name) return items;
      return [...items, {
        id: op.itemId,
        listId: listId ?? op.listId ?? null,
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
        notifyEnabled: false,
        remindOffsetMinutes: 0,
        repeat: null,
        attachments: [],
        createdAt: new Date(op.at || Date.now()).toISOString(),
        addedBy: op.by || null,
      }];
    }

    case 'update': {
      const target = targetOf();
      if (!target || isHeadingItem(target)) return items;
      const fields = cleanFields(op.fields);
      // Moving a task to a different parent is the owner's call, so an op
      // carrying only that is a no-op.
      delete fields.parentId;
      if ('name' in fields && !fields.name) delete fields.name;
      if (Object.keys(fields).length === 0) return items;
      return items.map((i) => (i.id === op.itemId ? { ...i, ...fields } : i));
    }

    case 'toggle': {
      const target = targetOf();
      if (!target || isHeadingItem(target)) return items;
      return items.map((i) => {
        if (i.id !== op.itemId) return i;
        const done = i.status === 'done';
        return {
          ...i,
          status: done ? 'pending' : 'done',
          completedAt: done ? null : new Date(op.at || Date.now()).toISOString(),
        };
      });
    }

    case 'delete': {
      const target = targetOf();
      if (!target || isHeadingItem(target)) return items;

      // A guest deleting a parent takes its subtasks with it, exactly as the
      // owner's own delete does — otherwise the children are orphaned into the
      // top level of the owner's list with no hint of where they came from.
      const doomed = new Set([op.itemId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const i of items) {
          if (i.parentId && doomed.has(i.parentId) && !doomed.has(i.id)) {
            doomed.add(i.id);
            grew = true;
          }
        }
      }
      return items.filter((i) => !doomed.has(i.id));
    }

    default:
      return items;
  }
}

/** Apply a queue of ops in order — the guest's optimistic overlay. */
export function applyOps(items = [], ops = [], listId = null) {
  return ops.reduce((acc, op) => applyOp(acc, op, listId), items);
}

/**
 * How long an op may sit in the overlay before it's dropped regardless.
 *
 * Rules pin an op's shape, but the server can still refuse one on its merits —
 * the list is full, the item turned out to be a heading. Such an op never shows
 * up in the mirror, so without a backstop it would sit on the guest's screen
 * forever as a task that looks saved and isn't.
 */
export const OVERLAY_TTL_MS = 30000;

/**
 * Has the mirror caught up with this op?
 *
 * Deliberately *not* "is the mirror newer than the op": the op carries the
 * guest's clock and the mirror carries the server's, so a phone a few minutes
 * fast would hold its overlay forever — and an overlaid `toggle` applied on top
 * of a mirror that already has it toggles it straight back, so the box the
 * guest just ticked would quietly untick itself.
 *
 * Comparing against what the mirror actually shows needs no clocks to agree.
 */
export function opSettled(op, mirrorItems = []) {
  const found = mirrorItems.find((i) => i.id === op.itemId);
  switch (op.type) {
    case 'add': return !!found;
    case 'delete': return !found;
    case 'toggle': {
      if (!found) return true; // gone entirely — nothing left to overlay
      // The op flips whatever it found at the time; settled once the mirror
      // shows the other state.
      return (found.status === 'done') !== (op.wasDone === true);
    }
    case 'update': {
      if (!found) return true;
      const fields = cleanFields(op.fields);
      return Object.entries(fields).every(([key, value]) => (found[key] ?? null) === (value ?? null));
    }
    default: return true;
  }
}

/** The overlay entries still worth showing over the mirror. */
export function pruneOverlay(ops = [], mirrorItems = [], now = Date.now()) {
  return ops.filter((op) => !opSettled(op, mirrorItems) && (now - op.at) < OVERLAY_TTL_MS);
}
