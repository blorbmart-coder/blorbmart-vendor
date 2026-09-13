import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { lazyPage } from '../../lib/lazyPage'
import { useLayer, useNav } from '../../app/stack'
import { Icon, type IconName } from '../../components/Icon'
import { SwapIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { useStore } from '../../data/storeRepo'
import { haptic } from '../../lib/haptics'
import DashboardScreen from '../dashboard/Dashboard'

const OrdersScreen = lazyPage(() => import('../orders/Orders'))
const MenuScreen = lazyPage(() => import('../menu/Menu'))
const EventsListScreen = lazyPage(() => import('../events/EventsList'))
const ProfileScreen = lazyPage(() => import('../profile/Profile'))

/** Warms every tab's code, so the first switch to each is instant. */
export function preloadTabs() {
  for (const screen of [OrdersScreen, MenuScreen, EventsListScreen, ProfileScreen]) {
    void screen.preload().catch(() => undefined)
  }
}

/**
 * A place in the vendor app, named rather than numbered. The tab strip is not
 * the same length for every kind of business, so an index means different
 * things to different vendors.
 */
export type VendorTab = 'today' | 'orders' | 'catalogue' | 'store'

export const TAB_PATH: Record<VendorTab, string> = {
  today: '/',
  orders: '/orders',
  catalogue: '/catalogue',
  store: '/store',
}

const tabOf = (pathname: string): VendorTab =>
  pathname === '/orders' ? 'orders' : pathname === '/catalogue' ? 'catalogue' : pathname === '/store' ? 'store' : 'today'

interface TabSpec {
  label: string
  active: IconName
  inactive: IconName
}

/**
 * The vendor app's frame. Tabs stay alive once opened, so switching between
 * Orders and Menu fifty times a day never re-runs a query or loses a scroll
 * position; the hidden ones skip rendering entirely.
 */
export default function Shell() {
  const nav = useNav()
  const layer = useLayer<{ welcome?: string }>()
  const store = useStore()
  const isOrganizer = store?.type === 'events'
  const tab = tabOf(layer.location.pathname)

  // An organizer has no Orders tab: nobody orders from them. Tickets are
  // issued instantly and live on the event.
  const places = useMemo<VendorTab[]>(
    () => (isOrganizer ? ['today', 'catalogue', 'store'] : ['today', 'orders', 'catalogue', 'store']),
    [isOrganizer],
  )

  const [visited, setVisited] = useState<Set<VendorTab>>(() => new Set([tab]))
  if (!visited.has(tab)) setVisited(new Set([...visited, tab]))

  // A store arriving can remove the tab that is open. Today beats a screen
  // that is no longer reachable.
  useEffect(() => {
    if (!places.includes(tab)) nav.tab('/')
  }, [places, tab, nav])

  // "Your store is live", said once, on the dashboard the vendor wanted.
  const welcomed = useRef(false)
  useEffect(() => {
    const welcome = layer.data?.welcome
    if (welcome && !welcomed.current) {
      welcomed.current = true
      toast(welcome, { tone: 'success' })
    }
  }, [layer.data])

  const open = (place: VendorTab) => {
    if (place === tab || !places.includes(place)) return
    haptic.selection()
    nav.tab(TAB_PATH[place])
  }

  const spec = (place: VendorTab): TabSpec =>
    place === 'today'
      ? { label: 'Today', active: 'round/dashboard', inactive: 'outlined/dashboard' }
      : place === 'orders'
        ? { label: 'Orders', active: 'round/receipt_long', inactive: 'outlined/receipt_long' }
        : place === 'catalogue'
          ? isOrganizer
            ? { label: 'Events', active: 'round/confirmation_number', inactive: 'outlined/confirmation_number' }
            : { label: 'Menu', active: 'round/restaurant_menu', inactive: 'outlined/restaurant_menu' }
          : { label: 'Store', active: 'round/storefront', inactive: 'outlined/storefront' }

  const screen = (place: VendorTab) =>
    place === 'today' ? (
      <DashboardScreen onOpenTab={open} />
    ) : place === 'orders' ? (
      <OrdersScreen />
    ) : place === 'catalogue' ? (
      isOrganizer ? (
        <EventsListScreen />
      ) : (
        <MenuScreen />
      )
    ) : (
      <ProfileScreen />
    )

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="relative min-h-0 flex-1">
        {places
          .filter((place) => visited.has(place))
          .map((place) => {
            const shown = place === tab
            return (
              <div
                key={place === 'catalogue' ? `catalogue-${isOrganizer}` : place}
                className="absolute inset-0 flex flex-col"
                inert={!shown}
                aria-hidden={shown ? undefined : true}
                style={shown ? undefined : { visibility: 'hidden', contentVisibility: 'hidden' }}
              >
                <Suspense fallback={null}>{screen(place)}</Suspense>
              </div>
            )
          })}
      </div>
      <NavBar tabs={places.map(spec)} index={Math.max(0, places.indexOf(tab))} onSelect={(i) => open(places[i])} />
    </div>
  )
}

function NavBar({ tabs, index, onSelect }: { tabs: TabSpec[]; index: number; onSelect: (i: number) => void }) {
  return (
    <nav
      data-bottom-bar=""
      aria-label="Main"
      className="relative z-10 shrink-0 rounded-t-[22px] bg-surface shadow-lift"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div role="tablist" className="flex h-[68px]">
        {tabs.map((t, i) => {
          const active = i === index
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(i)}
              className="press flex flex-1 flex-col items-center justify-center"
              style={{ '--ps': 0.9 } as CSSProperties}
            >
              <span className="relative grid h-[30px] place-items-center">
                <span
                  className="absolute left-1/2 top-0 h-[30px] -translate-x-1/2 rounded-full transition-[width,background-color] duration-[280ms] ease-emph"
                  style={{ width: active ? 52 : 30, background: active ? 'var(--color-brand-soft)' : 'transparent' }}
                />
                <SwapIn swapKey={active} className="relative">
                  <Icon
                    name={active ? t.active : t.inactive}
                    size={22}
                    color={active ? 'var(--color-brand)' : 'var(--color-ink-faint)'}
                  />
                </SwapIn>
              </span>
              <span
                className="t-caption-sm mt-[3px] transition-colors duration-200"
                style={{
                  color: active ? 'var(--color-brand)' : 'var(--color-ink-faint)',
                  fontWeight: active ? 800 : 600,
                }}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
