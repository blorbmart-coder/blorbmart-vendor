import { signOut as firebaseSignOut } from 'firebase/auth'
import { statusRepo } from '../data/statusRepo'
import { storeRepo } from '../data/storeRepo'
import { withTimeout } from '../lib/authState'
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
  if (!auth.currentUser) return '/login'
  try {
    await Promise.all([withTimeout(storeRepo.start(), 8000, undefined), statusRepo.start()])
    if (storeRepo.known && storeRepo.needsOnboarding) return '/onboarding'
    if (!statusRepo.isApproved) return '/pending'
    return '/'
  } catch (error) {
    console.warn('boot failed', error)
    return auth.currentUser ? '/' : '/login'
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
