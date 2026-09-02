/**
 * Security rules, tested against the real Firestore emulator.
 *
 * These are the only thing standing between an anonymous browser and this
 * app's data. Every other test in the repo checks code we control; this checks
 * the rules a guest actually hits, by running them.
 *
 * The share link's whole design rests on the claims asserted here:
 *
 *   - the token in the URL is the capability, and it can't be sidestepped by
 *     listing the collection
 *   - a guest can append an edit but can never read the queue back, amend it,
 *     or write anything else
 *   - an owner can't hand their share to another user's document
 *
 * Run with: npm run test:rules  (starts the emulator itself)
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  getDocs, query, limit,
} from 'firebase/firestore';

const PROJECT = 'rules-test';
const OWNER = 'owner-uid';
const OTHER = 'other-uid';
const GUEST = 'guest-uid';
const TOKEN = 'share-token-abc';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
    },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  // Seed as admin, bypassing rules, so each test starts from a real share.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'listShares', TOKEN), {
      ownerUid: OWNER,
      listId: 'L1',
      revoked: false,
      list: { id: 'L1', name: 'Weekly To Do' },
      items: [],
    });
    await setDoc(doc(db, 'users', OWNER, 'data', 'app'), { bills: [] });
    await setDoc(doc(db, 'shared', 'snapshot-token'), { bills: [] });
  });
});

const guestDb = () => env.authenticatedContext(GUEST).firestore();
const ownerDb = () => env.authenticatedContext(OWNER).firestore();
const otherDb = () => env.authenticatedContext(OTHER).firestore();
const anonDb = () => env.unauthenticatedContext().firestore();

const validOp = (over = {}) => ({
  type: 'add', itemId: 'new-1', fields: { name: 'Milk' },
  by: 'Chris', uid: GUEST, at: Date.now(), ...over,
});

// ── The user's own data ─────────────────────────────────────────────────────

test('a user reads and writes only their own document', async () => {
  await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER, 'data', 'app')));
  await assertSucceeds(setDoc(doc(ownerDb(), 'users', OWNER, 'data', 'app'), { bills: [] }));

  await assertFails(getDoc(doc(otherDb(), 'users', OWNER, 'data', 'app')));
  await assertFails(setDoc(doc(otherDb(), 'users', OWNER, 'data', 'app'), { bills: [] }));
  await assertFails(getDoc(doc(anonDb(), 'users', OWNER, 'data', 'app')));
});

// ── The share document ──────────────────────────────────────────────────────

test('anyone holding the token can read the shared list', async () => {
  await assertSucceeds(getDoc(doc(guestDb(), 'listShares', TOKEN)));
  await assertSucceeds(getDoc(doc(anonDb(), 'listShares', TOKEN)));
});

test('the collection cannot be listed, so the token cannot be sidestepped', async () => {
  // Without this, anyone could enumerate every shared list in the app without
  // holding a single link.
  await assertFails(getDocs(query(collection(guestDb(), 'listShares'), limit(10))));
  await assertFails(getDocs(query(collection(anonDb(), 'listShares'), limit(10))));
  await assertFails(getDocs(query(collection(anonDb(), 'shared'), limit(10))));
});

test('only the owner may write the share document', async () => {
  await assertSucceeds(updateDoc(doc(ownerDb(), 'listShares', TOKEN), { revoked: true }));
  await assertFails(updateDoc(doc(guestDb(), 'listShares', TOKEN), { revoked: false }));
  await assertFails(updateDoc(doc(anonDb(), 'listShares', TOKEN), { revoked: false }));
  await assertFails(deleteDoc(doc(guestDb(), 'listShares', TOKEN)));
  await assertSucceeds(deleteDoc(doc(ownerDb(), 'listShares', TOKEN)));
});

test('a share cannot be created in someone else\'s name', async () => {
  await assertFails(setDoc(doc(guestDb(), 'listShares', 'forged'), {
    ownerUid: OWNER, listId: 'L1', revoked: false,
  }));
  await assertSucceeds(setDoc(doc(ownerDb(), 'listShares', 'mine'), {
    ownerUid: OWNER, listId: 'L1', revoked: false,
  }));
});

test('ownerUid is immutable, so a share cannot be re-pointed at another user', async () => {
  // The function applies guest ops to `users/{ownerUid}/data/app` with admin
  // rights. If this were mutable, rewriting it would be a way to write into
  // somebody else's document.
  await assertFails(updateDoc(doc(ownerDb(), 'listShares', TOKEN), { ownerUid: OTHER }));
  await assertSucceeds(updateDoc(doc(ownerDb(), 'listShares', TOKEN), { listId: 'L2' }));
});

// ── The op queue ────────────────────────────────────────────────────────────

test('a signed-in guest can append an edit', async () => {
  await assertSucceeds(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp()));
});

test('an anonymous-in-the-Firebase-sense visitor still needs to be signed in', async () => {
  // The share page signs everyone in silently; a request with no auth at all
  // is not one of ours.
  await assertFails(addDoc(collection(anonDb(), 'listShares', TOKEN, 'ops'), validOp({ uid: '' })));
});

test('the op queue can never be read back, amended or emptied', async () => {
  let opId;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const ref = await addDoc(collection(ctx.firestore(), 'listShares', TOKEN, 'ops'), validOp());
    opId = ref.id;
  });
  await assertFails(getDoc(doc(guestDb(), 'listShares', TOKEN, 'ops', opId)));
  await assertFails(getDocs(collection(guestDb(), 'listShares', TOKEN, 'ops')));
  await assertFails(updateDoc(doc(guestDb(), 'listShares', TOKEN, 'ops', opId), { type: 'delete' }));
  await assertFails(deleteDoc(doc(guestDb(), 'listShares', TOKEN, 'ops', opId)));
  // Not even the owner reads it from the client — the function drains it.
  await assertFails(getDocs(collection(ownerDb(), 'listShares', TOKEN, 'ops')));
});

test('a paused share accepts nothing', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'listShares', TOKEN), { revoked: true });
  });
  await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp()));
});

test('ops cannot be written to a share that does not exist', async () => {
  await assertFails(addDoc(collection(guestDb(), 'listShares', 'no-such-token', 'ops'), validOp()));
});

test('an op must claim the uid it is actually sent with', async () => {
  await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp({ uid: OWNER })));
});

test('an op of an unknown type is refused', async () => {
  for (const type of ['nuke', 'set', '', 'ADD']) {
    await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp({ type })));
  }
  for (const type of ['add', 'update', 'delete', 'toggle']) {
    await assertSucceeds(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp({ type })));
  }
});

test('an op carrying an extra field is refused whole', async () => {
  // The shape is pinned so a guest can't smuggle anything past the function.
  await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'),
    { ...validOp(), listId: 'someone-elses-list' }));
  await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'),
    { ...validOp(), ownerUid: OTHER }));
});

test('op fields are limited to what a guest may set', async () => {
  await assertSucceeds(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'),
    validOp({ fields: { name: 'Milk', notes: 'skim', dueDate: '2026-09-12', dueTime: '08:00', parentId: 'H1', sectionId: 'wk-1' } })));

  // A guest must never be able to arm the owner's phone, or flag a task as
  // theirs, through a field the rules didn't expect.
  for (const fields of [
    { name: 'x', notifyEnabled: true },
    { name: 'x', header: true },
    { name: 'x', status: 'done' },
    { name: 'x', attachments: [] },
  ]) {
    await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), validOp({ fields })));
  }
});

test('a malformed op is refused', async () => {
  const bad = [
    validOp({ itemId: '' }),
    validOp({ itemId: 'x'.repeat(65) }),
    validOp({ itemId: 123 }),
    validOp({ at: 'now' }),
    validOp({ by: 'n'.repeat(61) }),
    validOp({ fields: 'not-a-map' }),
  ];
  for (const op of bad) {
    await assertFails(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), op));
  }
});

test('an op with no fields at all is still allowed through to the function', async () => {
  // Rules pin structure; whether an op *means* anything is listOps.js's call.
  // A delete carries no fields, so `fields` is optional here by design —
  // asserted so that split of responsibility is deliberate, not an oversight.
  const { fields, ...noFields } = validOp({ type: 'delete' });
  await assertSucceeds(addDoc(collection(guestDb(), 'listShares', TOKEN, 'ops'), noFields));
});
