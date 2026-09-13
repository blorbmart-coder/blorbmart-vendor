import { onAuthStateChanged, type User } from 'firebase/auth'
import { useSyncExternalStore } from 'react'
import { auth } from './firebase'

/** The signed-in Firebase user, as a store React can subscribe to. */
let user: User | null = auth.currentUser
const subscribers = new Set<() => void>()

onAuthStateChanged(auth, (next) => {
  user = next
  subscribers.forEach((fn) => fn())
})

const subscribe = (fn: () => void) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export const useUser = () => useSyncExternalStore(subscribe, () => user)

/** Resolves once Firebase has restored (or failed to restore) the session. */
export const authReady = () => auth.authStateReady()

/** Resolves with the value, or with `fallback` once `ms` has passed. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      () => {
        window.clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}
