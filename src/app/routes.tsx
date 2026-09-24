import { Suspense, useEffect, type ReactNode } from 'react'
import { matchPath, type RouteObject } from 'react-router-dom'
import { useUser } from '../lib/authState'
import { lazyPage } from '../lib/lazyPage'
import { useNav } from './stack'

/* Every page is its own chunk. The sign-in screen downloads neither
   Firestore nor the wallet; the dashboard does not download the scanner. */
const pages = {
  login: lazyPage(() => import('../features/auth/Login')),
  signup: lazyPage(() => import('../features/auth/Signup')),
  pending: lazyPage(() => import('../features/auth/Pending')),
  onboarding: lazyPage(() => import('../features/onboarding/Onboarding')),
  storeDetails: lazyPage(() => import('../features/profile/StoreDetails')),
  shell: lazyPage(() => import('../features/shell/Shell')),
  product: lazyPage(() => import('../features/menu/ProductEditor')),
  event: lazyPage(() => import('../features/events/EventEditor')),
  attendees: lazyPage(() => import('../features/events/Attendees')),
  scanner: lazyPage(() => import('../features/events/Scanner')),
  wallet: lazyPage(() => import('../features/wallet/WalletPage')),
  transactions: lazyPage(() => import('../features/wallet/Transactions')),
  payouts: lazyPage(() => import('../features/wallet/Payouts')),
  withdraw: lazyPage(() => import('../features/wallet/Withdraw')),
  bank: lazyPage(() => import('../features/wallet/BankAccount')),
  pin: lazyPage(() => import('../features/wallet/Pin')),
  bills: lazyPage(() => import('../features/wallet/Bills')),
}

type PageKey = keyof typeof pages

const TABS = ['/', '/orders', '/catalogue', '/store']
const PUBLIC = ['/login', '/signup']

/** A page that needs a signed-in vendor. Signed out, it goes to sign-in. */
function Protected({ children }: { children: ReactNode }) {
  const user = useUser()
  const nav = useNav()
  useEffect(() => {
    if (!user) nav.reset('/login', { fade: true })
  }, [user, nav])
  return user ? children : null
}

/** Sign-in and sign-up, which a signed-in vendor has no reason to see. */
function PublicOnly({ children }: { children: ReactNode }) {
  const user = useUser()
  const nav = useNav()
  useEffect(() => {
    if (user) nav.reset('/', { fade: true })
    // Only on arrival: signing up signs the vendor in on this very page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return children
}

function NotFound() {
  const nav = useNav()
  useEffect(() => nav.reset('/', { fade: true }), [nav])
  return null
}

const guarded = (key: PageKey, isPublic = false) => {
  const Page = pages[key]
  const content = (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  )
  return isPublic ? <PublicOnly>{content}</PublicOnly> : <Protected>{content}</Protected>
}

export const routes: RouteObject[] = [
  { path: '/login', element: guarded('login', true) },
  { path: '/signup', element: guarded('signup', true) },
  { path: '/pending', element: guarded('pending') },
  { path: '/onboarding', element: guarded('onboarding') },
  { path: '/store/details', element: guarded('storeDetails') },
  // One onboarding step on its own, for a live store editing that section.
  { path: '/store/details/:section', element: guarded('onboarding') },
  ...TABS.map((path) => ({ path, element: guarded('shell') })),
  { path: '/catalogue/new', element: guarded('product') },
  { path: '/catalogue/:productId', element: guarded('product') },
  { path: '/events/new', element: guarded('event') },
  { path: '/events/:eventId', element: guarded('event') },
  { path: '/events/:eventId/attendees', element: guarded('attendees') },
  { path: '/scan', element: guarded('scanner') },
  { path: '/wallet', element: guarded('wallet') },
  { path: '/wallet/transactions', element: guarded('transactions') },
  { path: '/wallet/payouts', element: guarded('payouts') },
  { path: '/wallet/withdraw', element: guarded('withdraw') },
  { path: '/wallet/bank', element: guarded('bank') },
  { path: '/wallet/pin', element: guarded('pin') },
  { path: '/wallet/bills', element: guarded('bills') },
  { path: '*', element: <NotFound /> },
]

export const isPublicPath = (pathname: string) => PUBLIC.includes(pathname)

/** The dashboard's four tabs share one layer, so switching never remounts. */
export const stackKeyOf = (pathname: string) => (TABS.includes(pathname) ? 'shell' : pathname)

/** Where "back" goes from a page that was opened directly by its URL. */
export function parentOf(pathname: string): string | null {
  if (pathname === '/signup') return '/login'
  if (pathname.startsWith('/catalogue/')) return '/catalogue'
  if (pathname.startsWith('/events/') || pathname === '/scan') return '/catalogue'
  if (pathname === '/wallet' || pathname === '/store/details') return '/store'
  if (pathname.startsWith('/store/details/')) return '/store/details'
  if (pathname.startsWith('/wallet/')) return '/wallet'
  return null
}

/**
 * Downloads the pages a vendor is likely to open next, once the browser is
 * idle, so the first push to each is instant instead of a blank page while
 * its chunk arrives. Signed out, that is sign-in and sign-up; signed in, the
 * dashboard and its tabs, the editors, onboarding and the wallet.
 */
export function prefetch(signedIn: boolean) {
  const run = () => {
    const keys: PageKey[] = signedIn
      ? ['product', 'onboarding', 'storeDetails', 'wallet', 'event', 'attendees']
      : ['login', 'signup']
    for (const key of keys) void pages[key].preload().catch(() => undefined)
    if (signedIn) {
      void pages.shell
        .preload()
        .then((shell) => shell.preloadTabs())
        .catch(() => undefined)
    }
  }
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}

/** Downloads a page's chunk ahead of showing it — used behind the splash. */
export async function preload(pathname: string) {
  const table: Array<[string, PageKey]> = [
    ['/login', 'login'],
    ['/signup', 'signup'],
    ['/pending', 'pending'],
    ['/onboarding', 'onboarding'],
    ['/store/details', 'storeDetails'],
    ['/store/details/:section', 'onboarding'],
    ['/', 'shell'],
    ['/orders', 'shell'],
    ['/catalogue', 'shell'],
    ['/store', 'shell'],
    ['/wallet', 'wallet'],
  ]
  const hit = table.find(([path]) => matchPath(path, pathname))
  if (hit) await pages[hit[1]].preload().catch(() => undefined)
}
