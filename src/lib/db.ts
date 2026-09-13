import { getFirestore } from 'firebase/firestore'
import { app } from './firebase'

/**
 * Firestore, with the SDK's default in-memory cache.
 *
 * Not the persistent IndexedDB cache, on purpose. It is what the Flutter
 * web build did, and it matters more here than on a phone: this app reads
 * orders carrying customers' names, phone numbers and addresses, and a
 * vendor on a shared or borrowed computer should not leave that sitting on
 * its disk after signing out.
 *
 * Kept apart from lib/firebase.ts so screens that only need Auth — sign-in,
 * the splash — never pull the Firestore SDK in with them.
 */
export const db = getFirestore(app)

/**
 * What to tell a vendor when a write fails. A refusal by the security rules
 * gets its own sentence, because "check your connection" sends them off to
 * retry something that better signal will never fix.
 */
export function writeFailure(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'permission-denied') return 'Blorbmart would not accept that. This account is not set up as a vendor.'
  return fallback
}
