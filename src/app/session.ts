import { signOut as firebaseSignOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { statusRepo } from '../data/statusRepo'
import { storeRepo } from '../data/storeRepo'
import { refuseSession, withTimeout } from '../lib/authState'
import { db } from '../lib/db'
import { auth } from '../lib/firebase'
import { removePush } from '../lib/push'

export type Destination = '/login' | '/onboarding' | '/pending' | '/'

/**
 * The routing decision everything else depends on — the Flutter splash's:
 * signed out goes to sign-in, signed in but unfinished goes back into
 * onboarding, a vendor still under review waits on the pending screen, and a
 * set-up, approved vendor lands straight on today's orders.
 *
 * Only a store that has actually been read can send somebody into
 * onboarding. One that has not arrived yet (a slow or offline start) goes on
 * to the dashboard, which fills in live and offers setup itself if there
 * really is no store.
 *
 * Sign-in uses this too. The Flutter sign-in screen skipped the approval
 * check, which put a vendor still under review on a dashboard where every
 * request failed; routing both through one decision closes that gap.
 */
export async function decideRoute(): Promise<Destination> {
  const user = auth.currentUser
  if (!user) return '/login'
  try {
    const [role] = await Promise.all([
      withTimeout<string | undefined>(accountRole(user.uid), 8000, undefined),
      withTimeout(storeRepo.start(), 8000, undefined),
      statusRepo.start(),
    ])
    // Any Blorbmart account can sign in with Firebase. A rider or shopper let
    // through here reaches onboarding, gets a store created for them, and then
    // has every product refused by the rules, which require role 'vendor'.
    if (role !== undefined && role !== 'vendor') {
      refuseSession(refusalFor(role))
      await signOut().catch(() => firebaseSignOut(auth))
      return '/login'
    }
    if (storeRepo.known && storeRepo.needsOnboarding) return '/onboarding'
    if (!statusRepo.isApproved) return '/pending'
    return '/'
  } catch (error) {
    console.warn('boot failed', error)
    return auth.currentUser ? '/' : '/login'
  }
}

/**
 * The account's role as the security rules read it, '' when there is no users
 * document. A read that fails or times out comes back undefined and turns
 * nobody away: a vendor starting on bad signal is let through, and the rules
 * still refuse any write the account is not entitled to.
 */
async function accountRole(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid))
  return String(snap.data()?.role ?? '')
}

/** Why a non-vendor account was signed straight back out. */
function refusalFor(role: string): string {
  switch (role) {
    case 'rider':
      return 'This is a Blorbmart rider account. Vendor accounts are separate: register your business with a different email.'
    case 'buyer':
      return 'This is a Blorbmart shopper account. Vendor accounts are separate: register your business with a different email.'
    default:
      return 'This account is not registered as a vendor. Register your business to sell on Blorbmart.'
  }
}

/**
 * Signs out and leaves nothing behind: the push token is withdrawn while
 * there is still a user to name, the live listeners are closed before the
 * credentials they run on disappear, and the cached store is forgotten.
 */
export async function signOut() {
  await removePush()
  storeRepo.stop()
  statusRepo.stop()
  await firebaseSignOut(auth)
}
