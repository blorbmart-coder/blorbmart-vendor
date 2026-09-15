import { collection, limit, query, where, type DocumentData } from 'firebase/firestore'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AppBar, Page } from '../../components/AppBar'
import { BlorbButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { FadeSlideIn, LivePulse, staggerFor } from '../../components/motion'
import { toast } from '../../components/overlay'
import { Divider, Empty, Pill, Skeleton } from '../../components/ui'
import { useStore } from '../../data/storeRepo'
import { db } from '../../lib/db'
import { asDate, asDouble, asInt, asString, isRecord, money, timeAgo } from '../../lib/format'
import { haptic } from '../../lib/haptics'
import { errorText } from '../../lib/http'
import { useLiveDocs, type LiveDocs } from '../../lib/useLive'
import { acceptOrder, markReady } from '../../services/orders'

/** The stages an order passes through on the vendor's side. */
type Stage = 'newOrder' | 'preparing' | 'ready' | 'onTheWay' | 'done'

const STAGES: Stage[] = ['newOrder', 'preparing', 'ready', 'onTheWay', 'done']

const LABEL: Record<Stage, string> = {
  newOrder: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  onTheWay: 'On the way',
  done: 'Done',
}

/**
 * Order statuses that belong in each tab. The backend's VENDOR_FLOW
 * (orderStatusService) must allow each tab's button from every status listed
 * here, and its tests pin the Preparing list — change both together.
 */
const STATUSES: Record<Stage, string[]> = {
  newOrder: ['placed'],
  preparing: ['confirmed', 'processing', 'preparing'],
  ready: ['ready', 'ready_for_pickup'],
  onTheWay: ['dispatched', 'out_for_delivery'],
  done: ['delivered', 'completed', 'cancelled'],
}

const EMPTY_TITLE: Record<Stage, string> = {
  newOrder: 'No new orders',
  preparing: 'Nothing being prepared',
  ready: 'Nothing waiting for a rider',
  onTheWay: 'Nothing out for delivery',
  done: 'No completed orders yet',
}

/**
 * One listener per stage feeds both the tab's count and its list. The
 * Flutter screen opened two per stage, one for each; this is half the reads
 * for the same screen.
 */
function useStage(storeId: string, stage: Stage) {
  const q = useMemo(
    () =>
      stage === 'newOrder'
        ? // A checkout draft is written as "placed" before it is paid, so
          // without the payment filter every unpaid and abandoned basket
          // would sit here as an order to accept. Later stages only follow
          // an acceptance, so they need no filter.
          query(
            collection(db, 'orders'),
            where('storeId', '==', storeId),
            where('orderStatus', '==', 'placed'),
            where('paymentStatus', '==', 'completed'),
            limit(50),
          )
        : query(collection(db, 'orders'), where('storeId', '==', storeId), where('orderStatus', 'in', STATUSES[stage]), limit(50)),
    [storeId, stage],
  )
  return useLiveDocs(q)
}

/* ─────────────────────────────────────────────────────────────────────────
   Orders. Five tabs matching the physical stages of the work, with a live
   count on each, swipeable between. The New tab leads, because an
   unaccepted order is a customer waiting and a clock running.
   ───────────────────────────────────────────────────────────────────────── */
export default function OrdersScreen() {
  const store = useStore()
  if (!store) {
    return (
      <Page>
        <AppBar title="Orders" back={false} />
        <Empty
          title="No store yet"
          message="Finish setting up your store to start taking orders."
          icon="outlined/receipt_long"
        />
      </Page>
    )
  }
  return <OrdersForStore storeId={store.id} />
}

function OrdersForStore({ storeId }: { storeId: string }) {
  const lists = {
    newOrder: useStage(storeId, 'newOrder'),
    preparing: useStage(storeId, 'preparing'),
    ready: useStage(storeId, 'ready'),
    onTheWay: useStage(storeId, 'onTheWay'),
    done: useStage(storeId, 'done'),
  }
  const [index, setIndex] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]))
  const pager = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Array<HTMLSpanElement | null>>([])
  const bar = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  if (!visited.has(index)) setVisited(new Set([...visited, index]))

  // The indicator slides under the selected tab's label, inset 4px each side.
  useLayoutEffect(() => {
    const label = tabRefs.current[index]
    if (!label) return
    const measure = () => {
      const button = label.parentElement as HTMLElement
      setIndicator({ left: button.offsetLeft + label.offsetLeft + 4, width: label.offsetWidth - 8 })
      button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(label)
    return () => observer.disconnect()
  }, [index])

  const select = (i: number) => {
    haptic.selection()
    setIndex(i)
    const el = pager.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  // A swipe settles on a page; the tab follows it.
  const onScroll = () => {
    const el = pager.current
    if (!el || el.clientWidth === 0) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index && i >= 0 && i < STAGES.length) setIndex(i)
  }

  return (
    <Page>
      <AppBar
        title="Orders"
        back={false}
        bottom={
          <div ref={bar} role="tablist" className="no-scrollbar relative flex h-12 overflow-x-auto px-3">
            {STAGES.map((stage, i) => {
              const count = Math.min(lists[stage].docs?.length ?? 0, 30)
              const urgent = stage === 'newOrder' && count > 0
              const selected = i === index
              return (
                <button
                  key={stage}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => select(i)}
                  className="relative flex h-[46px] shrink-0 items-center px-4"
                >
                  <span
                    ref={(el) => {
                      tabRefs.current[i] = el
                    }}
                    className="t-label flex items-center transition-colors duration-200"
                    style={{ color: selected ? 'var(--color-brand)' : 'var(--color-ink-muted)' }}
                  >
                    {urgent && <LivePulse color="var(--color-appetite)" size={6} />}
                    {LABEL[stage]}
                    {count > 0 && (
                      <span
                        className="t-caption-sm ml-1.5 rounded-full px-1.5 py-0.5"
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          background: urgent ? 'var(--color-appetite)' : 'var(--color-sunken)',
                          color: urgent ? '#fff' : 'var(--color-ink-muted)',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            <span
              aria-hidden="true"
              className="absolute bottom-0 h-[2.5px] bg-brand transition-[left,width] duration-[280ms] ease-emph"
              style={{ left: indicator.left, width: indicator.width }}
            />
          </div>
        }
      />
      <div
        ref={pager}
        onScroll={onScroll}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {STAGES.map((stage, i) => (
          <div key={stage} className="scroll-y w-full shrink-0 snap-start snap-always" aria-hidden={i !== index || undefined}>
            {visited.has(i) && <OrderList stage={stage} state={lists[stage]} />}
          </div>
        ))}
      </div>
    </Page>
  )
}

function OrderList({ stage, state }: { stage: Stage; state: { docs: LiveDocs | null; error: boolean } }) {
  if (state.docs === null && !state.error) {
    return (
      <div className="p-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={190} radius={18} className="mb-3" />
        ))}
      </div>
    )
  }
  if (state.error && !state.docs) {
    return (
      <Empty
        title="Could not load orders"
        message="Check your connection. Orders already placed are safe."
        icon="round/wifi_off"
      />
    )
  }

  // Newest first, sorted here so the query needs no composite index — a
  // missing index would take the whole screen down.
  const docs = [...(state.docs ?? [])].sort((a, b) => {
    const ad = asDate(a.data().createdAt)
    const bd = asDate(b.data().createdAt)
    if (!ad || !bd) return 0
    return bd.getTime() - ad.getTime()
  })

  if (docs.length === 0) {
    return (
      <Empty
        title={EMPTY_TITLE[stage]}
        message={
          stage === 'newOrder'
            ? 'When a customer orders, it appears here with a sound.'
            : 'Orders move here as they progress.'
        }
        icon="round/inbox"
        compact
      />
    )
  }

  return (
    <div className="space-y-3 px-5 pb-[110px] pt-4">
      {docs.map((doc, i) => (
        <FadeSlideIn key={doc.id} delay={staggerFor(i, 4)}>
          <OrderCard id={doc.id} data={doc.data()} stage={stage} />
        </FadeSlideIn>
      ))}
    </div>
  )
}

const WARN_INK = 'var(--color-warning-ink)'

function OrderCard({ id, data, stage }: { id: string; data: DocumentData; stage: Stage }) {
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const orderId = asString(data.orderId, id)
  const shortId = orderId.replace(/ORD/g, '')
  const note = asString(data.customerNote)
  const phone = asString(data.userPhone)
  const lines = (Array.isArray(data.lines) ? data.lines : Array.isArray(data.items) ? data.items : []).filter(isRecord)
  const address = data.address
  const addressLabel = isRecord(address)
    ? [asString(address.addressLine1 ?? address.street), asString(address.city)].filter(Boolean).join(', ')
    : asString(address)
  const actionLabel = stage === 'newOrder' ? 'Accept order' : stage === 'preparing' ? 'Mark ready' : null
  // Only digits and a leading plus reach the dialler.
  const dial = phone.replace(/[^\d+]/g, '')

  const advance = async () => {
    setBusy(true)
    try {
      if (stage === 'newOrder') await acceptOrder(orderId)
      else if (stage === 'preparing') await markReady(orderId)
      haptic.medium()
      toast(
        stage === 'newOrder' ? 'Order accepted. Start cooking.' : 'Marked ready. A rider is being assigned.',
        { tone: 'success' },
      )
    } catch (e) {
      toast(errorText(e, 'Failed to update order status.'), { tone: 'danger' })
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
      <div
        className="flex items-center p-4"
        style={{ background: stage === 'newOrder' ? 'var(--color-appetite-soft)' : 'transparent' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="t-h3">#{shortId.length > 6 ? shortId.slice(-6) : shortId}</p>
            <Pill label={timeAgo(asDate(data.createdAt))} dense />
          </div>
          <p className="t-body-sm mt-1">{asString(data.userName, 'Customer')}</p>
        </div>
        <div className="flex flex-col items-end">
          <p className="t-price" style={{ fontSize: 17 }}>
            {money(asDouble(data.totalAmount))}
          </p>
          <p className="t-caption-sm mt-0.5">{asString(data.paymentMethod, 'paid') === 'wallet' ? 'Wallet' : 'Card'}</p>
        </div>
      </div>

      <Divider />

      <div className="p-4">
        {lines.map((line, i) => {
          const addons = Array.isArray(line.addons)
            ? line.addons
                .filter(isRecord)
                .map((a) => asString(a.name))
                .filter(Boolean)
            : []
          const lineNote = asString(line.note)
          return (
            <div key={i} className="mb-2 flex items-start gap-3">
              <span className="t-caption-sm grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-brand-soft font-extrabold text-brand-ink">
                {asInt(line.quantity, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-h4">{asString(line.name, 'Item')}</p>
                {addons.length > 0 && <p className="t-caption-sm mt-0.5 text-brand">{addons.join(', ')}</p>}
                {lineNote && (
                  <p className="t-caption-sm mt-1 inline-block rounded-[8px] bg-warning-soft px-2 py-1" style={{ color: WARN_INK }}>
                    {lineNote}
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {note && (
          <div className="mt-2 flex items-start gap-2 rounded-[10px] bg-warning-soft p-3">
            <Icon name="outlined/sticky_note_2" size={16} color={WARN_INK} />
            <p className="t-caption-sm flex-1" style={{ color: WARN_INK }}>
              {note}
            </p>
          </div>
        )}

        {addressLabel && (
          <div className="mt-3 flex items-start gap-2">
            <Icon name="outlined/location_on" size={15} color="var(--color-ink-faint)" />
            <p className="t-caption-sm flex-1">{addressLabel}</p>
          </div>
        )}
      </div>

      {(actionLabel || phone) && (
        <div className="flex items-center gap-3 px-4 pb-4">
          {phone && (
            <a
              href={`tel:${dial}`}
              title="Call customer"
              aria-label="Call customer"
              className="press grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-success-soft"
              style={{ '--ps': 0.9, border: '1px solid var(--color-line)' } as CSSProperties}
              onClick={() => haptic.selection()}
            >
              <Icon name="round/call" size={20} color="var(--color-success)" />
            </a>
          )}
          {actionLabel && (
            <div className="min-w-0 flex-1">
              <BlorbButton
                label={actionLabel}
                busy={busy}
                size="md"
                kind={stage === 'newOrder' ? 'appetite' : 'brand'}
                onClick={busy ? null : () => void advance()}
              />
            </div>
          )}
        </div>
      )}

      {stage === 'ready' && (
        <div className="flex items-center bg-brand-softer px-4 py-3">
          <LivePulse size={6} />
          <p className="t-caption-sm flex-1 text-brand-ink">
            Waiting for a rider. The customer confirms delivery with their PIN.
          </p>
        </div>
      )}
    </div>
  )
}
