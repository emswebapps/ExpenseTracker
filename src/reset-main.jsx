import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './AppFrame';
import CrashProtocol from './pages/CrashProtocol';

// The standalone "Reset" app.
//
// Same origin as the finance app, so it shares the login, the localStorage
// cache and the Firestore document — the same data behind its own icon. What it
// deliberately does NOT share is the bottom nav: there is no route out of here
// into Bills, because at the moment this gets opened, every extra choice on
// screen is a cost.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  navigator.serviceWorker.ready.then((reg) => {
    reg.update();
    setInterval(() => reg.update(), 30 * 60 * 1000);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/ExpenseTracker/reset">
      <AuthProvider>
        <AuthGate loginTitle="Reset" loginIcon="/ExpenseTracker/reset-icon-192.png">
          <CrashProtocol />
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
