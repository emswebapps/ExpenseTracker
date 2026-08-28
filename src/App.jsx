import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import BillsDebts from './pages/BillsDebts';
import Income from './pages/Income';
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import Purchases from './pages/Purchases';
import WorkTime from './pages/WorkTime';
import SearchPage from './pages/Search';
import ShoppingLists from './pages/ShoppingLists';
import Planning from './pages/Planning';
import SharedView from './pages/SharedView';
import DocumentVault from './pages/DocumentVault';
import CrashProtocol from './pages/CrashProtocol';
import Login from './pages/Login';

function ThemeSync() {
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

function TestModeBanner() {
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

function LoadingScreen() {
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

function AuthenticatedApp() {
  const { user } = useAuth();

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Login />;

  return (
    <AppProvider uid={user.uid}>
      <ThemeSync />
      <TestModeBanner />
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bills" element={<BillsDebts />} />
          <Route path="/debts" element={<Navigate to="/bills" replace />} />
          <Route path="/income" element={<Income />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/work" element={<WorkTime />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/lists" element={<ShoppingLists />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/vault" element={<DocumentVault />} />
          <Route path="/crash" element={<CrashProtocol />} />
        </Routes>
      </div>
      <BottomNav />
    </AppProvider>
  );
}

function AppShell() {
  return (
    <Routes>
      {/* Public route — accessible without login */}
      <Route path="/share/:token" element={<SharedView />} />
      {/* All other routes require auth */}
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/ExpenseTracker">
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
