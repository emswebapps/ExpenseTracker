import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './AppFrame';
import RxApp from './rx/RxApp';

// Rx — the standalone medication app.
//
// Same origin as the finance app, so it shares the login, the localStorage
// cache and the Firestore document: the same data behind its own icon. What it
// deliberately does NOT share is the finance app's navigation. There is no
// route from here into Bills, and none from there into here beyond a single
// link in Settings — they are two apps that happen to keep their data in the
// same place.

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
    <BrowserRouter basename="/ExpenseTracker/rx">
      <AuthProvider>
        <AuthGate loginTitle="Rx" loginIcon="/ExpenseTracker/rx-icon-192.png">
          <RxApp />
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
