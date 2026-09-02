import { useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import Login from './pages/Login';

// The app shell: theme sync, the auth gate and the login screen, kept apart
// from the routing in App.jsx.

export function ThemeSync() {
  const { settings } = useApp();
  useEffect(() => {
    const html = document.documentElement;
    if (settings.lightMode) {
      html.classList.add('light');
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
      html.classList.remove('light');
    }
  }, [settings.lightMode]);
  return null;
}

export function TestModeBanner() {
  const { testMode, exitTestMode } = useApp();
  if (!testMode) return null;
  return (
    <>
      <div style={{ height: '2.75rem' }} />
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        backgroundColor: '#f59e0b', color: '#000',
        padding: '0.625rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '0.8125rem', fontWeight: '800',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      }}>
        <span>⚠ TEST MODE — nothing is being saved</span>
        <button
          onClick={exitTestMode}
          style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: '0.5rem', padding: '0.25rem 0.625rem', fontSize: '0.8125rem', fontWeight: '800', color: '#000', cursor: 'pointer' }}>
          Exit
        </button>
      </div>
    </>
  );
}

export function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '2.5rem', height: '2.5rem', borderRadius: '50%',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite', margin: '0 auto',
        }} />
        <p style={{ color: 'var(--subtle)', fontSize: '0.875rem', marginTop: '1rem' }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Waits for auth, shows the login screen when signed out, and otherwise mounts
 * the app context with the theme and Test Mode chrome already in place.
 */
export function AuthGate({ children }) {
  const { user } = useAuth();

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Login />;

  return (
    <AppProvider uid={user.uid}>
      <ThemeSync />
      <TestModeBanner />
      {children}
    </AppProvider>
  );
}
