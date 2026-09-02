import {
  doc, collection, getDoc, setDoc, addDoc, deleteDoc, onSnapshot, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';

// Shared view collection: shared/{token}
function sharedDocRef(token) {
  return doc(db, 'shared', token);
}

export async function saveSharedView(token, data) {
  await setDoc(sharedDocRef(token), { ...data, updatedAt: new Date().toISOString() });
}

export async function loadSharedView(token) {
  const snap = await getDoc(sharedDocRef(token));
  return snap.exists() ? snap.data() : null;
}

// Each user gets a single document: users/{uid}/data/app
// containing all their app data as one JSON blob.
// This keeps reads/writes minimal and avoids complex collection rules.

function userDocRef(uid) {
  return doc(db, 'users', uid, 'data', 'app');
}

export async function loadUserData(uid) {
  const snap = await getDoc(userDocRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserData(uid, data) {
  await setDoc(userDocRef(uid), data, { merge: true });
}

export function subscribeUserData(uid, callback) {
  return onSnapshot(userDocRef(uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function saveFCMToken(uid, token) {
  await setDoc(userDocRef(uid), { fcmToken: token || deleteField() }, { merge: true });
}

// ── Collaborative lists: listShares/{token} ─────────────────────────────────
// One document per shared list. The owner writes a mirror of the list into it;
// guests holding the link read that and append their edits to the `ops`
// subcollection, which a Cloud Function applies back to the owner's document.
//
// The mirror is a copy rather than the source of truth on purpose: the owner's
// single `data/app` blob stays authoritative, so offline caching and all four
// reminder functions keep working with no special case for a shared list.

function listShareRef(token) {
  return doc(db, 'listShares', token);
}

/**
 * Write (or rewrite) the mirror for one shared list.
 *
 * Attachments are stripped: their URLs point at Storage paths only the owner
 * can read, so a guest would get a row of broken thumbnails. Nothing else is
 * trimmed — notes and addresses are the sort of thing a shared errand needs.
 */
export async function saveListShare(token, { ownerUid, list, items }) {
  await setDoc(listShareRef(token), {
    ownerUid,
    listId: list.id,
    list: {
      id: list.id,
      name: list.name,
      type: list.type,
      sections: list.sections || [],
      viewMode: list.viewMode || null,
      weekly: list.weekly?.enabled ? { enabled: true } : null,
    },
    items: items.map(({ attachments, ...rest }) => ({ ...rest, hasPhotos: (attachments || []).length > 0 })),
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function loadListShare(token) {
  const snap = await getDoc(listShareRef(token));
  return snap.exists() ? snap.data() : null;
}

export function subscribeListShare(token, callback, onError) {
  return onSnapshot(
    listShareRef(token),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => onError?.(err),
  );
}

/** Turn a share link off without losing the list's history of who did what. */
export async function setListShareRevoked(token, revoked) {
  await setDoc(listShareRef(token), { revoked, updatedAt: Date.now() }, { merge: true });
}

export async function deleteListShare(token) {
  await deleteDoc(listShareRef(token));
}

/**
 * Append one guest edit. Rules allow create only, so a failure here means the
 * link has been revoked or the shape was rejected — both worth surfacing.
 */
export async function submitListOp(token, op) {
  await addDoc(collection(db, 'listShares', token, 'ops'), op);
}
