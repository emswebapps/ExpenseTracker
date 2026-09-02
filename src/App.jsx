import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './AppFrame';
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
import SharedList from './pages/SharedList';
import DocumentVault from './pages/DocumentVault';

function AuthenticatedApp() {
  return (
    <AuthGate>
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
          {/* Anything unrecognised lands on the Dashboard rather than a blank
              screen. This is what catches `/reset/`, whose standalone app was
              removed but whose icon may still be on someone's home screen, and
              `/crash`, which the Reset notifications used to open. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </AuthGate>
  );
}

function AppShell() {
  return (
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
