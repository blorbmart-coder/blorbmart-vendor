import type { MessagePayload } from 'firebase/messaging'
import { toast } from '../components/overlay'
import { app, auth } from './firebase'
import { http } from './http'

/**
 * Order alerts by web push — the reason this app exists on a phone at all.
 *
 * Best-effort and silent on failure, as in the Flutter app: a vendor who
 * refuses notifications must still be able to work the dashboard, where new
 * orders arrive live anyway.
 *
 * The VAPID key is optional. Without one, Firebase uses its default key,
 * which is what the Flutter web build has always done.
 */
const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim() || undefined

let token: string | null = null
let stopForeground: (() => void) | null = null

/** Browsers only let a page ask for permission inside a user gesture. */
function nextGesture(): Promise<void> {
  return new Promise((resolve) => {
    const go = () => {
      window.removeEventListener('pointerdown', go, true)
      window.removeEventListener('keydown', go, true)
      resolve()
    }
    window.addEventListener('pointerdown', go, true)
    window.addEventListener('keydown', go, true)
  })
}

const platform = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'web'

/** Registers this browser for order pushes. Call once a vendor is signed in. */
export async function initPush(onOpenOrders: () => void) {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    // No worker in development builds, and getToken would wait for one forever.
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return

    const { getMessaging, getToken, isSupported, onMessage } = await import('firebase/messaging')
    if (!(await isSupported())) return

    if (Notification.permission === 'default') {
      await nextGesture()
      if ((await Notification.requestPermission()) !== 'granted') return
    }
    if (Notification.permission !== 'granted') return

    const messaging = getMessaging(app)
    const next = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
    const uid = auth.currentUser?.uid
    if (!next || !uid) return
    token = next

    await http('/api/notifications/tokens/register', {
      method: 'POST',
      body: { userId: uid, token: next, platform: platform() },
      auth: true,
      timeoutMs: 15_000,
    }).catch(() => undefined)

    stopForeground?.()
    stopForeground = onMessage(messaging, (payload: MessagePayload) => {
      const data = payload.data ?? {}
      const title = payload.notification?.title ?? data.title ?? ''
      const body = payload.notification?.body ?? data.body ?? ''
      // No sound here: the shell's useNewOrderAlert rings the new-order sound
      // for every new paid order, push or no push, and a second sound on top
      // of it only muddied it.
      if (title || body) {
        toast([title, body].filter(Boolean).join(' — '), { tone: 'brand', icon: 'round/notifications_active' })
      }
      if (data.type === 'order' && document.visibilityState === 'hidden') onOpenOrders()
    })
  } catch (error) {
    console.warn('Push setup skipped:', error)
  }
}

/**
 * Stops this browser receiving the vendor's pushes. Runs before sign-out,
 * while there is still a user to name — on a shared computer the next person
 * should not be woken by somebody else's orders.
 */
export async function removePush() {
  stopForeground?.()
  stopForeground = null
  const uid = auth.currentUser?.uid
  if (!token || !uid) return
  const current = token
  token = null
  await http('/api/notifications/tokens/remove', {
    method: 'DELETE',
    body: { userId: uid, token: current },
    auth: true,
    timeoutMs: 15_000,
  }).catch(() => undefined)
  try {
    const { deleteToken, getMessaging } = await import('firebase/messaging')
    await deleteToken(getMessaging(app))
  } catch {
    // Already gone.
  }
}
