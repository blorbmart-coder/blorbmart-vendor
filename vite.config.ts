import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 5175 rather than Vite's default: 5173 and 5174 are the rider and admin
  // apps, and all three are on the backend's CORS allowlist. strictPort
  // matters — a silent fallback to 5176 is an origin the API refuses, and a
  // refused origin looks exactly like a dead backend.
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest rather than generateSW: order alerts arrive as Firebase
      // pushes, and the worker that receives them has to be the worker that
      // owns the scope. Two workers on one scope fight over control and the
      // loser silently stops receiving notifications.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Blorbmart Vendor',
        short_name: 'Vendor',
        description: 'Manage your Blorbmart store — orders, products, and earnings.',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['business', 'food', 'productivity'],
        icons: [
          { src: '/icons/Icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/Icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/Icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/Icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Orders', short_name: 'Orders', url: '/orders' },
          { name: 'Earnings and payouts', short_name: 'Earnings', url: '/wallet' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        // Fontsource ships every script the face supports. A Nigerian vendor
        // needs latin and latin-ext (the naira sign lives in latin-ext), not
        // Cyrillic or Vietnamese, so those are left for the browser to fetch
        // on the rare page that ever asks for them.
        // The QR decoder and the wallet's typeface are for an organizer at a
        // door and a vendor checking payouts. They are cached the first time
        // they are used instead of downloaded by every install.
        globIgnores: ['**/*cyrillic*', '**/*vietnamese*', '**/*greek*', '**/jsQR-*', '**/raleway-*'],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Firestore is the one heavy dependency, and it is split out so the
        // sign-in screen never waits on it. Messaging is left alone on
        // purpose: it is imported on demand, and naming it here would drag it
        // into a chunk that loads on every visit.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@firebase/messaging') || id.includes('@firebase/installations')) {
            return undefined
          }
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) return 'firestore'
          if (id.includes('/firebase/') || id.includes('@firebase/')) return 'firebase'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/react-router')
          ) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
