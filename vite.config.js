import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Finance Manager',
        short_name: 'Finance',
        description: 'Track bills, income, debts and savings',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/ExpenseTracker/',
        scope: '/ExpenseTracker/',
        icons: [
          { src: '/ExpenseTracker/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/ExpenseTracker/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/ExpenseTracker/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            // First in the list so it's the top item on a long-press, which is
            // the whole point: the fewest possible taps when they're needed most.
            name: 'I’m crashing',
            short_name: 'Crash',
            description: 'Start the crash protocol',
            url: '/ExpenseTracker/crash?start=1',
            icons: [{ src: '/ExpenseTracker/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Log Purchase',
            short_name: 'Log',
            description: 'Quickly log a new purchase',
            url: '/ExpenseTracker/purchases?new=1',
            icons: [{ src: '/ExpenseTracker/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'View Bills',
            short_name: 'Bills',
            description: 'Check your bills and payments',
            url: '/ExpenseTracker/bills',
            icons: [{ src: '/ExpenseTracker/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Upload Document',
            short_name: 'Upload',
            description: 'Go to the Document Vault to upload files',
            url: '/ExpenseTracker/vault',
            icons: [{ src: '/ExpenseTracker/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
  base: '/ExpenseTracker/',
})
