import { collection, limit, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { useNav } from '../../app/stack'
import logo from '../../assets/logo-mark.png'
import { BlorbImage } from '../../components/BlorbImage'
import { Icon, type IconName } from '../../components/Icon'
import { FadeSlideIn, LivePulse, SwapIn } from '../../components/motion'
import { Switch } from '../../components/Switch'
import { Card, Empty, Skeleton } from '../../components/ui'
import { BUSINESS, hoursLabel, isOpenNow, missingForLaunch, type StoreProfile } from '../../data/models'
import { storeRepo, useStore } from '../../data/storeRepo'
import { db } from '../../lib/db'
import { asDouble, money } from '../../lib/format'
import { useLiveDocs } from '../../lib/useLive'
import type { VendorTab } from '../shell/Shell'

/* ─────────────────────────────────────────────────────────────────────────
   Today. Answers the three questions a vendor opening the app actually has:

     Am I taking orders right now?   The open switch, at the very top.
     Is anything waiting on me?      New orders, loud and counted.
     How is today going?             Revenue and order count, nothing else.
   ───────────────────────────────────────────────────────────────────────── */
export default function DashboardScreen({ onOpenTab }: { onOpenTab: (tab: VendorTab) => void }) {
  const store = useStore()
  const nav = useNav()

  return (
    <div className="scroll-y pt-safe flex-1">
      <div className="px-5 pb-10 pt-4">
        <Greeting store={store} />
        <div className="h-5" />
        {store ? (
          <>
            <FadeSlideIn>
              <OpenSwitch store={store} />
            </FadeSlideIn>
            <div className="h-4" />
            {missingForLaunch(store).length > 0 && (
              <>
                <FadeSlideIn delay={60}>
                  <SetupChecklist store={store} onOpen={() => void nav.push('/onboarding')} />
                </FadeSlideIn>
                <div className="h-4" />
              </>
            )}
            <FadeSlideIn delay={100}>
              <TodayStats storeId={store.id} />
            </FadeSlideIn>
            <div className="h-4" />
            {/* An organizer has no order queue; this would sit at zero forever. */}
            {store.type !== 'events' && (
              <FadeSlideIn delay={150}>
                <NewOrdersCard storeId={store.id} onOpen={() => onOpenTab('orders')} />
              </FadeSlideIn>
            )}
            <p className="t-overline mt-6">QUICK ACTIONS</p>
            <FadeSlideIn delay={200} className="mt-3">
              <QuickActions store={store} onOpenTab={onOpenTab} />
            </FadeSlideIn>
          </>
        ) : (
          <Empty
            title="Set up your store"
            message="A few short steps and you are live on Blorbmart. Everything saves as you go."
            icon="outlined/storefront"
            actionLabel="Start setup"
            onAction={() => void nav.push('/onboarding')}
          />
        )}
      </div>
    </div>
  )
}

function Greeting({ store }: { store: StoreProfile | null }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="t-body-sm">{greeting}</p>
        <h1 className="t-h1 mt-0.5 truncate">{store?.name ? store.name : 'Your store'}</h1>
      </div>
      {store?.logoUrl ? (
        <BlorbImage url={store.logoUrl} width={46} height={46} radius={10} fallbackLabel={store.name} />
      ) : (
        <img src={logo} alt="" width={34} height={34} />
      )}
    </div>
  )
}

/**
 * The most-used control in the app. A vendor who runs out of gas needs
 * orders to stop in one tap, so it comes first and does not ask to confirm.
 */
function OpenSwitch({ store }: { store: StoreProfile }) {
  const open = isOpenNow(store)
  const manuallyClosed = store.isActive && !store.isOpen
  const closes = hoursLabel(store).split('–').pop()?.trim()

  return (
    <div
      className={open ? 'bg-brand-gradient flex items-center rounded-[18px] p-4' : 'flex items-center rounded-[18px] p-4'}
      style={{
        background: open ? undefined : 'var(--color-surface)',
        boxShadow: open ? 'var(--shadow-brand)' : 'var(--shadow-sm)',
        border: open ? undefined : '1px solid var(--color-line)',
      }}
    >
      {open ? (
        <LivePulse color="#fff" size={9} />
      ) : (
        <span className="mx-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-ink-faint" />
      )}
      <div className="ml-2.5 min-w-0 flex-1">
        <p className="t-h3" style={{ color: open ? '#fff' : 'var(--color-ink)' }}>
          {open ? 'Taking orders' : 'Not taking orders'}
        </p>
        <p
          className="t-caption-sm mt-0.5 line-clamp-2"
          style={{ color: open ? 'rgb(255 255 255 / 0.85)' : 'var(--color-ink-muted)' }}
        >
          {open
            ? `Customers can order until ${closes}`
            : manuallyClosed
              ? 'You switched off. Turn back on when ready.'
              : !store.isActive
                ? 'Finish setting up to go live.'
                : `Outside your hours (${hoursLabel(store)})`}
        </p>
      </div>
      <Switch
        checked={store.isOpen}
        label="Taking orders"
        onChange={store.isActive ? (v) => void storeRepo.setOpen(v).catch(() => undefined) : null}
        trackOn="rgb(255 255 255 / 0.35)"
      />
    </div>
  )
}

/** Today in Lagos (UTC+1 all year) — the day the backend stamps on each order copy. */
const lagosDay = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10)

/** Only two figures. Two numbers get checked every hour; a suite gets ignored. */
function TodayStats({ storeId }: { storeId: string }) {
  const day = lagosDay()
  const q = useMemo(
    () =>
      // Two equality filters, so no composite index. The createdAt range this
      // used before needed one the project never had, and "Earned today" sat
      // on a skeleton.
      query(collection(db, 'vendorOrders'), where('storeId', '==', storeId), where('createdDay', '==', day)),
    [storeId, day],
  )
  const { docs, error } = useLiveDocs(q)

  // What this store earned is its own items. The buyer's total also carried
  // the delivery and service fees, so this used to overstate every order
  // (QA-BM-WEB-002, item 2). A cancelled order earns nothing.
  const paid = (docs ?? []).filter((d) => {
    const data = d.data()
    const status = String(data.paymentStatus ?? '')
    return (status === 'completed' || status === 'paid') && data.orderStatus !== 'cancelled'
  })
  const revenue = paid.reduce((total, d) => total + asDouble(d.data().subtotal), 0)
  const loading = docs === null && !error

  return (
    <div className="flex gap-3">
      <StatCard label="Earned today" value={money(revenue)} icon="round/payments" color="var(--color-success)" loading={loading} />
      <StatCard label="Orders today" value={String(paid.length)} icon="round/receipt_long" color="var(--color-brand)" loading={loading} />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string
  value: string
  icon: IconName
  color: string
  loading: boolean
}) {
  return (
    <Card className="min-w-0 flex-1">
      <div
        className="grid h-8 w-8 place-items-center rounded-[8px]"
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <Icon name={icon} size={16} color={color} />
      </div>
      <div className="mt-3 flex h-[26.4px] items-center">
        {loading ? (
          <Skeleton width={80} height={24} />
        ) : (
          <SwapIn swapKey={value} className="min-w-0">
            <span className="t-h1 truncate">{value}</span>
          </SwapIn>
        )}
      </div>
      <p className="t-caption-sm mt-1">{label}</p>
    </Card>
  )
}

/** Orders waiting to be accepted — the most urgent thing in the app. */
function NewOrdersCard({ storeId, onOpen }: { storeId: string; onOpen: () => void }) {
  const q = useMemo(
    () =>
      query(
        collection(db, 'vendorOrders'),
        where('storeId', '==', storeId),
        where('orderStatus', '==', 'placed'),
        where('paymentStatus', '==', 'completed'),
        limit(20),
      ),
    [storeId],
  )
  const count = useLiveDocs(q).docs?.length ?? 0
  const hot = count > 0

  return (
    <Card
      onClick={onOpen}
      label="Open orders"
      color={hot ? 'var(--color-appetite-soft)' : 'var(--color-surface)'}
      border={hot ? undefined : 'var(--color-line)'}
      shadow={hot ? 'var(--shadow-md)' : 'var(--shadow-sm)'}
    >
      <div className="flex items-center">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"
          style={{ background: hot ? 'var(--color-appetite)' : 'var(--color-sunken)' }}
        >
          <Icon
            name={hot ? 'round/notifications_active' : 'round/check'}
            size={21}
            color={hot ? '#fff' : 'var(--color-ink-faint)'}
          />
        </div>
        <div className="ml-3.5 min-w-0 flex-1">
          <div className="flex items-center">
            {hot && <LivePulse color="var(--color-appetite)" size={6} />}
            <p className="t-h4" style={{ color: hot ? 'var(--color-appetite-deep)' : 'var(--color-ink)' }}>
              {hot ? `${count} order${count === 1 ? '' : 's'} to accept` : 'Nothing waiting'}
            </p>
          </div>
          <p className="t-caption-sm mt-0.5">{hot ? 'Customers are waiting on you.' : 'You are all caught up.'}</p>
        </div>
        <Icon name="round/chevron_right" color="var(--color-ink-faint)" />
      </div>
    </Card>
  )
}

/** A checklist rather than a blocking error, so a vendor can trade while they finish. */
function SetupChecklist({ store, onOpen }: { store: StoreProfile; onOpen: () => void }) {
  return (
    <Card color="var(--color-warning-soft)" shadow={null} onClick={onOpen} label="Finish your store setup">
      <div className="flex items-center">
        <Icon name="round/checklist" size={21} color="var(--color-warning-ink)" />
        <div className="ml-3.5 min-w-0 flex-1">
          <p className="t-h4 text-warning-ink">Finish your store setup</p>
          <p className="t-caption-sm mt-1 text-warning-ink">Missing: {missingForLaunch(store).join(', ')}</p>
        </div>
        <Icon name="round/chevron_right" color="var(--color-warning-ink)" />
      </div>
    </Card>
  )
}

function QuickActions({ store, onOpenTab }: { store: StoreProfile; onOpenTab: (tab: VendorTab) => void }) {
  const nav = useNav()
  const info = BUSINESS[store.type]
  const isOrganizer = store.type === 'events'
  return (
    <div className="flex gap-3">
      <Action
        icon="round/add"
        label={`Add ${info.itemNoun}`}
        color="var(--color-brand)"
        // An organizer's "add" is a new event, which lives on its own tab.
        onClick={() => (isOrganizer ? onOpenTab('catalogue') : void nav.push('/catalogue/new'))}
      />
      <Action
        icon={isOrganizer ? 'round/confirmation_number' : 'round/restaurant_menu'}
        label={info.menuNoun}
        color="var(--color-events)"
        onClick={() => onOpenTab('catalogue')}
      />
      <Action icon="round/storefront" label="My store" color="var(--color-appetite)" onClick={() => onOpenTab('store')} />
    </div>
  )
}

function Action({ icon, label, color, onClick }: { icon: IconName; label: string; color: string; onClick: () => void }) {
  return (
    <Card onClick={onClick} label={label} padding="16px 8px" className="flex min-w-0 flex-1 flex-col items-center">
      <div
        className="grid h-[42px] w-[42px] place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      >
        <Icon name={icon} size={20} color={color} />
      </div>
      <p className="t-caption-sm mt-2 w-full truncate text-center font-bold text-ink-strong">{label}</p>
    </Card>
  )
}
