import { collection, limit, query, where, type DocumentData } from 'firebase/firestore'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AppBar, Page } from '../../components/AppBar'
import { BlorbButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { FadeSlideIn, LivePulse, staggerFor } from '../../components/motion'
import { showSheet, toast, type SetDismissible } from '../../components/overlay'
import { Divider, Empty, Pill, Skeleton } from '../../components/ui'
import { useStore } from '../../data/storeRepo'
import { db } from '../../lib/db'
import { asDate, asDouble, asInt, asString, isRecord, money, timeAgo } from '../../lib/format'
import { haptic } from '../../lib/haptics'
import { errorText } from '../../lib/http'
import { useLiveDocs, type LiveDocs } from '../../lib/useLive'
import { acceptOrder, markReady, rejectOrder, REJECT_REASONS, type RejectReason } from '../../services/orders'

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
 *
 * The lists come from `vendorOrders`, the backend's copy of each order for
 * this store: the customer's name, this store's items and prices, and their
 * subtotal. Orders themselves carry the buyer's grand total, fees, phone,
 * address and payment method, and Firestore cannot hide fields of a
 * document, so reading them showed a vendor all of it (QA-BM-WEB-002, item 2).
 */
function useStage(storeId: string, stage: Stage) {
  const q = useMemo(
    () =>
      stage === 'newOrder'
        ? // Copies are only written for paid orders. The payment filter stays
          // for the one that is not: an order whose payment was reversed after
          // the fact keeps its copy, and must not sit here as one to accept.
          query(
            collection(db, 'vendorOrders'),
            where('storeId', '==', storeId),
            where('orderStatus', '==', 'placed'),
            where('paymentStatus', '==', 'completed'),
            limit(50),
          )
        : query(
            collection(db, 'vendorOrders'),
            where('storeId', '==', storeId),
            where('orderStatus', 'in', STATUSES[stage]),
            limit(50),
          ),
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

/**
 * Add-ons arrive as names, already carrying their count where there is more
 * than one. Older copies still hold `{ name, quantity }` objects, and the
 * count matters just as much there: the kitchen makes what this line says.
 */
const addonNames = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((a) => {
          if (typeof a === "string") return a
          if (!isRecord(a)) return ""
          const name = asString(a.name)
          const count = asInt(a.quantity, 1)
          return name && count > 1 ? name + " x" + count : name
        })
        .filter(Boolean)
    : []

/**
 * One order, as the kitchen needs it: who it is for, what to make, what this
 * store is owed for it, and the one button that moves it on. The customer's
 * contact details, the delivery fee and the buyer's grand total are the
 * rider's and the platform's business, and are not on the copy at all.
 */
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
  const lines = (Array.isArray(data.items) ? data.items : []).filter(isRecord)
  const actionLabel = stage === 'newOrder' ? 'Accept order' : stage === 'preparing' ? 'Mark ready' : null

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

  const reject = async () => {
    const result = await showSheet<{ refunded: boolean }>((close, setDismissible) => (
      <RejectSheet orderId={orderId} shortId={shortId} onDone={close} setDismissible={setDismissible} />
    ))
    if (!result) return
    haptic.medium()
    toast(
      result.refunded
        ? 'Order rejected. The customer has been refunded.'
        : 'Order rejected. Support will finish the customer’s refund.',
      { tone: 'neutral' },
    )
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
          <p className="t-body-sm mt-1">{asString(data.customerName, 'Customer')}</p>
          {/* A scheduled order reaches this tab shortly before its time. The
              kitchen cooks to the customer's time, not to when it came in. */}
          {asString(data.fulfillmentType) === 'scheduled' && asString(data.scheduledLabel) && (
            <p className="t-caption-sm mt-1 inline-flex items-center gap-1 rounded-[8px] bg-brand-soft px-2 py-1 font-extrabold text-brand-ink">
              <Icon name="round/schedule" size={14} />
              Deliver by {asString(data.scheduledLabel)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end">
          <p className="t-price" style={{ fontSize: 17 }}>
            {money(asDouble(data.subtotal))}
          </p>
          <p className="t-caption-sm mt-0.5">Your items</p>
        </div>
      </div>

      <Divider />

      <div className="p-4">
        {lines.map((line, i) => {
          const addons = addonNames(line.addons)
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
              <p className="t-body-sm shrink-0 tabular-nums">{money(asDouble(line.lineTotal))}</p>
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
      </div>

      {actionLabel && stage === 'newOrder' && (
        // Two answers to a new order, side by side: no is as easy to give as
        // yes, and a customer is refunded the moment a kitchen says it.
        <div className="flex gap-3 px-4 pb-4">
          <div className="w-[38%]">
            <BlorbButton
              label="Reject"
              icon="round/close"
              size="md"
              kind="outline"
              onClick={busy ? null : () => void reject()}
            />
          </div>
          <BlorbButton
            label={actionLabel}
            icon="round/check"
            busy={busy}
            size="md"
            kind="appetite"
            glow
            onClick={busy ? null : () => void advance()}
          />
        </div>
      )}

      {actionLabel && stage !== 'newOrder' && (
        <div className="px-4 pb-4">
          <BlorbButton
            label={actionLabel}
            busy={busy}
            size="md"
            kind="brand"
            onClick={busy ? null : () => void advance()}
          />
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

/**
 * Why the order is being turned down. The customer reads the reason, so it is
 * chosen from a short list rather than typed, and the refund is spelled out
 * before the button that triggers it.
 */
function RejectSheet({
  orderId,
  shortId,
  onDone,
  setDismissible,
}: {
  orderId: string
  shortId: string
  onDone: (value?: { refunded: boolean }) => void
  setDismissible: SetDismissible
}) {
  const [reason, setReason] = useState<RejectReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!reason) return
    setBusy(true)
    setDismissible(false)
    setError(null)
    try {
      onDone(await rejectOrder(orderId, reason))
    } catch (e) {
      setError(errorText(e, 'Could not reject this order.'))
      setBusy(false)
      setDismissible(true)
    }
  }

  return (
    <div className="px-5 pb-6 pt-1">
      <h2 className="t-h2">Reject order #{shortId.length > 6 ? shortId.slice(-6) : shortId}?</h2>
      <p className="t-body mt-1.5">
        The customer is refunded in full to their Blorbmart wallet straight away, and told why.
      </p>

      <p className="t-overline mb-2 mt-5">Reason</p>
      <div role="radiogroup" className="space-y-2">
        {REJECT_REASONS.map((option) => {
          const chosen = reason === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={busy}
              onClick={() => {
                haptic.selection()
                setReason(option.id)
              }}
              className="press flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-4 text-left transition-colors"
              style={{
                background: chosen ? 'var(--color-danger-soft)' : 'var(--color-surface)',
                border: `1.3px solid ${chosen ? 'var(--color-danger)' : 'var(--color-line)'}`,
              }}
            >
              <Icon
                name={chosen ? 'round/check_circle' : 'round/radio_button_unchecked'}
                size={20}
                color={chosen ? 'var(--color-danger)' : 'var(--color-ink-faint)'}
              />
              <span className="t-label-lg flex-1">{option.label}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="t-body-sm mt-4 rounded-[12px] bg-danger-soft px-4 py-3 font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <BlorbButton label="Keep it" kind="outline" size="md" onClick={busy ? null : () => onDone()} />
        <BlorbButton
          label={reason ? 'Reject and refund' : 'Choose a reason'}
          kind="danger"
          size="md"
          busy={busy}
          onClick={reason && !busy ? () => void submit() : null}
        />
      </div>
    </div>
  )
}
