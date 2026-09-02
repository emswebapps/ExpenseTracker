import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Service worker ──────────────────────────────────────────────────────────
// Registered here rather than by vite-plugin-pwa's injected script, so that
// the public routes can decline it.
//
// Precaching is the right trade for the person who installed this: every chunk
// lands on disk on first launch and the app works offline afterwards. It is
// the wrong trade for someone who followed a share link to read one to-do
// list — they'd pull the entire finance app in the background, over mobile
// data, to see a page they may never open again.
const PUBLIC_ROUTES = ['/ExpenseTracker/list/', '/ExpenseTracker/share/'];
const isPublicRoute = PUBLIC_ROUTES.some((prefix) => window.location.pathname.startsWith(prefix));

if (!isPublicRoute) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* No service worker is a slower app, not a broken one. */ });
}

if (!isPublicRoute && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  // Force fresh SW check on every launch (bypasses HTTP cache) + every 30 min for long sessions
  navigator.serviceWorker.ready.then((reg) => {
    reg.update();
    setInterval(() => reg.update(), 30 * 60 * 1000);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
