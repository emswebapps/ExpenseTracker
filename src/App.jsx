import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AuthGate, LoadingScreen } from './AppFrame';
import BottomNav from './components/BottomNav';

// Every page is split out, including the Dashboard.
//
// The reason to split the landing route too is the two *public* routes: a
// share link used to hand whoever opened it the entire finance app —
// dashboard, charts and all — before it could draw a to-do list. Splitting
// everything else while leaving the Dashboard eager would have left most of
// that in the guest's download.
//
// It costs installed users nothing: the service worker precaches every chunk
// on first visit, so the "lazy" pages are already on disk by the time they're
// asked for.
const Dashboard = lazy(() => import('./pages/Dashboard'));

const BillsDebts = lazy(() => import('./pages/BillsDebts'));
const Income = lazy(() => import('./pages/Income'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));
const Purchases = lazy(() => import('./pages/Purchases'));
const WorkTime = lazy(() => import('./pages/WorkTime'));
const SearchPage = lazy(() => import('./pages/Search'));
const ShoppingLists = lazy(() => import('./pages/ShoppingLists'));
const Planning = lazy(() => import('./pages/Planning'));
const DocumentVault = lazy(() => import('./pages/DocumentVault'));
const SharedView = lazy(() => import('./pages/SharedView'));
const SharedList = lazy(() => import('./pages/SharedList'));

function AuthenticatedApp() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <Suspense fallback={<LoadingScreen />}>
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
          {/* Anything unrecognised lands on the Dashboard rather than a blank
              screen. This is what catches `/reset/`, whose standalone app was
              removed but whose icon may still be on someone's home screen, and
              `/crash`, which the Reset notifications used to open. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
      <BottomNav />
    </AuthGate>
  );
}

function AppShell() {
  return (
    <Suspense fallback={<LoadingScreen />}>
    <Routes>
      {/* Public route — accessible without login */}
      <Route path="/share/:token" element={<SharedView />} />
      {/* A single list, shared by link — no account needed. Outside
          AuthenticatedApp on purpose: the visitor has no account, and the
          signed-in shell would send them to the login screen. */}
      <Route path="/list/:token" element={<SharedList />} />
      {/* All other routes require auth */}
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
    </Suspense>
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
