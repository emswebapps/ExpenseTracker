import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '../firebase';

/**
 * Create a login for someone else without signing yourself out.
 *
 * The Firebase client SDK signs straight into any account it creates, so doing
 * this on the app's own auth instance would swap the person creating the
 * account for the new one. A throwaway app instance with in-memory persistence
 * takes the sign-in instead, and is torn down afterwards: the current session
 * is never touched, and nothing about the new account is left on this device.
 *
 * The new account starts with no data. Its document is created the first time
 * its owner signs in, under its own uid, and Firestore's rules keep it and
 * yours apart.
 */
export async function createAccountForSomeone(email, password) {
  const app = initializeApp(firebaseConfig, `create-account-${Date.now()}`);
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await signOut(auth);
    return { email: cred.user.email };
  } finally {
    await deleteApp(app).catch(() => {});
  }
}

export const AUTH_ERROR_MESSAGES = {
  'auth/user-not-found': 'No account found. Create one below.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/missing-email': 'Enter an email address.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
};
