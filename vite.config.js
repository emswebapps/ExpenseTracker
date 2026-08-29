import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Two installable apps from one build, on one origin:
//
//   index.html        → "Finance Manager" at /ExpenseTracker/
//   reset/index.html  → "Reset"           at /ExpenseTracker/reset/
//
// Sharing an origin is deliberate: the standalone Reset app then shares the
// Firebase login, the localStorage cache and the Firestore document with the
// main app, so both see the same data. What makes the phone treat them as two
// separate installs is the manifests — distinct `id` values and
// non-overlapping `scope`s.
//
// VitePWA's manifest generation is switched off (`manifest: false`) so each
// entry links its own static manifest from public/ instead. Previously the
// generated manifest was injected while public/manifest.json sat unreferenced
// and out of date; one manifest per page, visible as a plain file, is far
// easier to reason about than injection plus a stale duplicate.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Without this, an offline launch of the Reset app would fall back to
        // index.html and quietly open the finance app instead.
        navigateFallbackDenylist: [/^\/ExpenseTracker\/reset\//],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
    }),
  ],
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        reset: 'reset/index.html',
      },
    },
  },
  base: '/ExpenseTracker/',
})
