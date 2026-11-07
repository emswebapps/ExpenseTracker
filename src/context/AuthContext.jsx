import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebase';
import { setStorageAccount, getAccountItem } from '../utils/storage';
import { loadUserData, saveFCMToken } from '../utils/firestoreSync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      // Point the on-device cache at this account before the app mounts and
      // reads from it, so one person never starts from another's data.
      setStorageAccount(u?.uid ?? null);
      setUser(u ?? null);
    });
  }, []);

  // Signing out also takes this device off the account's push notifications,
  // so the next person to sign in here doesn't keep receiving the previous
  // one's bill reminders. Only when the account's token is this device's: the
  // account may since have enabled push on another phone, which keeps working.
  const signOut = async () => {
    const uid = auth.currentUser?.uid;
    const deviceToken = getAccountItem('bt_fcm_token');
    if (uid && deviceToken) {
      try {
        const data = await loadUserData(uid);
        if (data?.fcmToken === deviceToken) await saveFCMToken(uid, null);
      } catch {
        // Offline or similar — signing out matters more than the cleanup.
      }
    }
    return firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
