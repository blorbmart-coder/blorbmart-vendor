/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

/**
 * The one service worker: the precached app shell, and order pushes.
 *
 * The shell is precached so a vendor in a basement still gets the interface
 * and a clear "no connection" state rather than the browser's dinosaur.
 * Firestore and the API are never cached — a stale order queue is worse
 * than none.
 */
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/__\//] }))

// Everything under /assets/ is content-hashed and never changes, so what is
// left out of the precache is kept the first time it is used.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
)

const messaging = getMessaging(
  initializeApp({
    apiKey: 'AIzaSyAGGDTIx4YY8_7cwuPBDkJV-plZpr-IhWs',
    authDomain: 'blorbmart-b29b7.firebaseapp.com',
    projectId: 'blorbmart-b29b7',
    storageBucket: 'blorbmart-b29b7.firebasestorage.app',
    messagingSenderId: '840596799490',
    appId: '1:840596799490:web:b4b2e30afc4efedbe6671b',
  }),
)

// A push that carries a `notification` block is shown by the Firebase SDK on
// its own. Only data-only pushes are drawn here; drawing both would give the
// vendor two alerts for one order.
onBackgroundMessage(messaging, (payload) => {
  if (payload.notification) return
  const data = payload.data ?? {}
  const title = data.title || 'Blorbmart'
  void self.registration.showNotification(title, {
    body: data.body ?? '',
    icon: '/icons/Icon-192.png',
    badge: '/icons/Icon-192.png',
    tag: data.orderId ? `order-${data.orderId}` : undefined,
    data,
  })
})

self.addEventListener('notificationclick', (event) => {
  const raw = (event.notification.data ?? {}) as Record<string, unknown>
  const fcm = raw.FCM_MSG as { data?: Record<string, string>; fcmOptions?: { link?: string } } | undefined
  // The SDK opens its own notifications when they carry a link.
  if (fcm?.fcmOptions?.link) return
  const data = (fcm?.data ?? raw) as Record<string, unknown>
  const path = data.type === 'order' ? '/orders' : '/'
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        if ('navigate' in open) await (open as WindowClient).navigate(path).catch(() => undefined)
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})
