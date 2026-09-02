// Unit tests for applying a guest's edits to a shared list.
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');

const { applyOp, cleanFields, describeChange, MAX_ITEMS_PER_LIST } = require('../listOps');

const NOW = Date.UTC(2026, 8, 7, 14, 0, 0);
// Stand-in for the real tz maths — the point here is that it's called with the
// right arguments, not that it re-tests time zones.
const wallClockToMs = (date, time) => Date.parse(`${date}T${time || '23:59'}:00Z`);
const ctx = (over = {}) => ({
  listId: 'L1', tz: 'America/New_York', wallClockToMs, now: NOW,
  sectionIds: ['wk-2026-09-07'], ...over,
});

const item = (over = {}) => ({
  id: 'T1', listId: 'L1', name: 'Existing', status: 'pending',
  parentId: null, sectionId: null, dueDate: null, dueTime: null, ...over,
});

// ── add ──────────────────────────────────────────────────────────────────────

test('add appends a task the guest can see themselves', () => {
  const res = applyOp([], { type: 'add', itemId: 'new1', fields: { name: 'Milk' }, by: 'Chris' }, ctx());
  assert.strictEqual(res.items.length, 1);
  assert.strictEqual(res.items[0].name, 'Milk');
  assert.strictEqual(res.items[0].listId, 'L1');
  assert.strictEqual(res.items[0].status, 'pending');
  assert.strictEqual(res.items[0].addedBy, 'Chris');
  assert.deepStrictEqual(res.change, { kind: 'add', by: 'Chris', name: 'Milk', at: NOW });
});

test('a guest can never arm a reminder on the owner\'s phone', () => {
  const res = applyOp([], {
    type: 'add', itemId: 'new1',
    fields: { name: 'Milk', notifyEnabled: true, remindOffsetMinutes: 30, flagged: true },
  }, ctx());
  assert.strictEqual(res.items[0].notifyEnabled, false);
  assert.strictEqual(res.items[0].remindOffsetMinutes, 0);
  assert.strictEqual(res.items[0].flagged, false);
});

test('add stamps dueAt from the date and time', () => {
  const res = applyOp([], {
    type: 'add', itemId: 'new1', fields: { name: 'Class', dueDate: '2026-09-12', dueTime: '08:00' },
  }, ctx());
  assert.strictEqual(res.items[0].dueDate, '2026-09-12');
  assert.strictEqual(res.items[0].dueAt, Date.parse('2026-09-12T08:00:00Z'));
});

test('add refuses a name that is empty or only whitespace', () => {
  assert.strictEqual(applyOp([], { type: 'add', itemId: 'n', fields: { name: '   ' } }, ctx()), null);
  assert.strictEqual(applyOp([], { type: 'add', itemId: 'n', fields: {} }, ctx()), null);
});

test('add refuses an id that already exists', () => {
  assert.strictEqual(
    applyOp([item({ id: 'T1' })], { type: 'add', itemId: 'T1', fields: { name: 'Dupe' } }, ctx()),
    null);
});

test('add refuses once the list is full', () => {
  const full = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => item({ id: `T${i}` }));
  assert.strictEqual(applyOp(full, { type: 'add', itemId: 'extra', fields: { name: 'One more' } }, ctx()), null);
  // Items on somebody else's list don't count towards this one's limit.
  const elsewhere = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => item({ id: `X${i}`, listId: 'L2' }));
  assert.ok(applyOp(elsewhere, { type: 'add', itemId: 'extra', fields: { name: 'One more' } }, ctx()));
});

test('add files under a parent and section that exist on this list', () => {
  const items = [item({ id: 'H1', header: true })];
  const res = applyOp(items, {
    type: 'add', itemId: 'n1',
    fields: { name: 'EMS class', parentId: 'H1', sectionId: 'wk-2026-09-07' },
  }, ctx());
  assert.strictEqual(res.items[1].parentId, 'H1');
  assert.strictEqual(res.items[1].sectionId, 'wk-2026-09-07');
});

test('a parent or section from somewhere else is dropped, not honoured', () => {
  const items = [item({ id: 'H9', listId: 'L2', header: true })];
  const res = applyOp(items, {
    type: 'add', itemId: 'n1',
    fields: { name: 'Sneaky', parentId: 'H9', sectionId: 'wk-somebody-elses' },
  }, ctx());
  assert.strictEqual(res.items[1].parentId, null);
  assert.strictEqual(res.items[1].sectionId, null);
});

// ── update ───────────────────────────────────────────────────────────────────

test('update patches only the fields a guest may set', () => {
  const items = [item({ id: 'T1', name: 'Old', notes: null })];
  const res = applyOp(items, {
    type: 'update', itemId: 'T1',
    fields: { name: 'New', notes: 'Bring the folder', dueDate: '2026-09-12' },
    by: 'Chris',
  }, ctx());
  assert.strictEqual(res.items[0].name, 'New');
  assert.strictEqual(res.items[0].notes, 'Bring the folder');
  assert.strictEqual(res.items[0].dueAt, Date.parse('2026-09-12T23:59:00Z'));
  assert.strictEqual(res.change.kind, 'update');
});

test('update cannot re-parent a task', () => {
  const items = [item({ id: 'H1', header: true }), item({ id: 'T1', parentId: null })];
  const res = applyOp(items, { type: 'update', itemId: 'T1', fields: { parentId: 'H1' } }, ctx());
  // parentId alone is not a change a guest can make, so there's nothing to do.
  assert.strictEqual(res, null);
});

test('update refuses an item on another list', () => {
  const items = [item({ id: 'T1', listId: 'L2' })];
  assert.strictEqual(applyOp(items, { type: 'update', itemId: 'T1', fields: { name: 'Nope' } }, ctx()), null);
});

test('update refuses a missing item', () => {
  assert.strictEqual(applyOp([], { type: 'update', itemId: 'ghost', fields: { name: 'Nope' } }, ctx()), null);
});

test('a bad date is dropped rather than stored', () => {
  const items = [item({ id: 'T1', dueDate: '2026-09-12' })];
  const res = applyOp(items, {
    type: 'update', itemId: 'T1', fields: { name: 'Keep', dueDate: 'tomorrow-ish' },
  }, ctx());
  assert.strictEqual(res.items[0].dueDate, '2026-09-12'); // unchanged
  assert.strictEqual(cleanFields({ dueDate: '2026-13-45' }).dueDate, undefined);
  assert.strictEqual(cleanFields({ dueTime: '8am' }).dueTime, undefined);
  assert.strictEqual(cleanFields({ dueTime: '08:00' }).dueTime, '08:00');
});

test('names and notes are length-capped', () => {
  const long = 'x'.repeat(5000);
  const cleaned = cleanFields({ name: long, notes: long });
  assert.strictEqual(cleaned.name.length, 200);
  assert.strictEqual(cleaned.notes.length, 1000);
});

test('clearing a field is allowed and distinct from not sending it', () => {
  assert.deepStrictEqual(cleanFields({ notes: null }), { notes: null });
  assert.deepStrictEqual(cleanFields({}), {});
  assert.deepStrictEqual(cleanFields({ unknown: 'x' }), {});
});

// ── toggle ───────────────────────────────────────────────────────────────────

test('toggle completes and re-opens, stamping the time', () => {
  const done = applyOp([item({ id: 'T1' })], { type: 'toggle', itemId: 'T1', by: 'Chris' }, ctx());
  assert.strictEqual(done.items[0].status, 'done');
  assert.strictEqual(done.items[0].completedAt, new Date(NOW).toISOString());
  assert.strictEqual(done.change.kind, 'complete');

  const back = applyOp(done.items, { type: 'toggle', itemId: 'T1', by: 'Chris' }, ctx());
  assert.strictEqual(back.items[0].status, 'pending');
  assert.strictEqual(back.items[0].completedAt, null);
  assert.strictEqual(back.change.kind, 'reopen');
});

// ── delete ───────────────────────────────────────────────────────────────────

test('delete takes the subtasks with it', () => {
  const items = [
    item({ id: 'P1', name: 'Parent' }),
    item({ id: 'C1', parentId: 'P1' }),
    item({ id: 'C2', parentId: 'P1' }),
    item({ id: 'G1', parentId: 'C1' }),
    item({ id: 'other' }),
  ];
  const res = applyOp(items, { type: 'delete', itemId: 'P1', by: 'Chris' }, ctx());
  assert.deepStrictEqual(res.items.map((i) => i.id), ['other']);
  assert.strictEqual(res.change.count, 4);
  assert.strictEqual(describeChange(res.change), 'Chris deleted "Parent" and 3 subtasks');
});

test('delete leaves other lists alone', () => {
  const items = [item({ id: 'T1', listId: 'L2' })];
  assert.strictEqual(applyOp(items, { type: 'delete', itemId: 'T1' }, ctx()), null);
});

// ── headings are the owner's structure ───────────────────────────────────────

test('a day heading cannot be edited, ticked off or deleted by a guest', () => {
  const items = [item({ id: 'H1', header: true, name: 'MONDAY' })];
  for (const op of [
    { type: 'update', itemId: 'H1', fields: { name: 'FUNDAY' } },
    { type: 'toggle', itemId: 'H1' },
    { type: 'delete', itemId: 'H1' },
  ]) {
    assert.strictEqual(applyOp(items, op, ctx()), null, op.type);
  }
});

// ── shape ────────────────────────────────────────────────────────────────────

test('an op of an unknown type or with no item does nothing', () => {
  assert.strictEqual(applyOp([], { type: 'nuke', itemId: 'T1' }, ctx()), null);
  assert.strictEqual(applyOp([], { type: 'add' }, ctx()), null);
  assert.strictEqual(applyOp([], { type: 'add', itemId: 'x'.repeat(65), fields: { name: 'n' } }, ctx()), null);
  assert.strictEqual(applyOp([], null, ctx()), null);
});

test('an unnamed guest is described rather than blank', () => {
  const res = applyOp([], { type: 'add', itemId: 'n1', fields: { name: 'Milk' } }, ctx());
  assert.strictEqual(res.change.by, 'Someone');
  assert.strictEqual(describeChange(res.change), 'Someone added "Milk"');
});

test('activity lines read as a person would say them', () => {
  assert.strictEqual(describeChange({ kind: 'add', by: 'Chris', name: 'Milk' }), 'Chris added "Milk"');
  assert.strictEqual(describeChange({ kind: 'complete', by: 'Chris', name: 'Milk' }), 'Chris ticked off "Milk"');
  assert.strictEqual(describeChange({ kind: 'reopen', by: 'Chris', name: 'Milk' }), 'Chris re-opened "Milk"');
  assert.strictEqual(describeChange({ kind: 'delete', by: 'Chris', name: 'Milk', count: 1 }), 'Chris deleted "Milk"');
  assert.strictEqual(describeChange({ kind: 'delete', by: 'Chris', name: 'Milk', count: 2 }), 'Chris deleted "Milk" and 1 subtask');
});

// ── The owner's notification about what a guest did ─────────────────────────

const { _internal } = require('../index');
const { describeShareActivity, mirrorItems } = _internal;

test('one change by one person reads plainly', () => {
  const msg = describeShareActivity({
    list: { name: 'Weekly To Do' },
    pendingCount: 1, pendingBy: ['Chris'], pendingNames: ['Milk'],
    activity: [{ line: 'Chris added "Milk"', at: 1 }],
  });
  assert.strictEqual(msg.title, 'Chris — 1 change to Weekly To Do');
  assert.strictEqual(msg.body, 'Milk');
  assert.deepStrictEqual(msg.lines, [
    'Chris made 1 change to your shared list "Weekly To Do".',
    '• Chris added "Milk"',
  ]);
});

test('a sitting of edits is one notification, not five', () => {
  const msg = describeShareActivity({
    list: { name: 'Groceries' },
    pendingCount: 5, pendingBy: ['Chris'],
    pendingNames: ['Milk', 'Bread', 'Eggs', 'Jam', 'Tea'],
  });
  assert.strictEqual(msg.title, 'Chris — 5 changes to Groceries');
  assert.strictEqual(msg.body, 'Milk, Bread, Eggs, Jam +1 more');
});

test('two people are both named, three or more are counted', () => {
  const two = describeShareActivity({ list: { name: 'L' }, pendingCount: 2, pendingBy: ['Chris', 'Sam'] });
  assert.strictEqual(two.title, 'Chris and Sam — 2 changes to L');

  const many = describeShareActivity({ list: { name: 'L' }, pendingCount: 4, pendingBy: ['Chris', 'Sam', 'Alex'] });
  assert.strictEqual(many.title, 'Chris and 2 others — 4 changes to L');
});

test('an anonymous guest and a missing list name still make sense', () => {
  const msg = describeShareActivity({ pendingCount: 1 });
  assert.strictEqual(msg.title, 'Someone — 1 change to a shared list');
  assert.strictEqual(msg.body, 'Open the list to see what changed.');
});

test('the mirror carries this list only, and no photo URLs', () => {
  const items = [
    { id: 'T1', listId: 'L1', name: 'Mine', attachments: [{ id: 'a', url: 'https://storage/private.jpg' }] },
    { id: 'T2', listId: 'L1', name: 'Also mine', attachments: [] },
    { id: 'T3', listId: 'L2', name: 'Someone else\'s list' },
  ];
  const mirror = mirrorItems(items, 'L1');
  assert.deepStrictEqual(mirror.map((i) => i.id), ['T1', 'T2']);
  assert.ok(!('attachments' in mirror[0]), 'attachments must not reach a guest');
  assert.strictEqual(mirror[0].hasPhotos, true);
  assert.strictEqual(mirror[1].hasPhotos, false);
  assert.strictEqual(JSON.stringify(mirror).includes('storage/private.jpg'), false);
});
