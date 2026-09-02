import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// One installable app: "Finance Manager" at /ExpenseTracker/.
//
// VitePWA's manifest generation is switched off (`manifest: false`) so
// index.html links the static public/manifest.json instead. A manifest that
// exists as a plain file is far easier to reason about than an injected one,
// and it was previously injected while public/manifest.json sat unreferenced
// and going stale.

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
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
    }),
  ],
  base: '/ExpenseTracker/',
})
