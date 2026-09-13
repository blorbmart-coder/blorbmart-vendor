import { ReceiptItem } from 'iconsax-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Page } from '../../components/AppBar'
import { showSheet } from '../../components/overlay'
import { PullToRefresh } from '../../components/PullToRefresh'
import { Spinner } from '../../components/Spinner'
import { isSuccess, walletApi } from './api'
import { fmtLong, fmtShort, formatNaira, nextCursor, parseTransactions, type TransactionType, type WalletTransaction } from './model'
import { BRAND, DetailRow, ErrorView, FilterChips, GREEN, GREY, RED, rw, WalletAppBar, WalletHandle } from './ui'
import { TX_STYLE } from './WalletPage'

const FILTERS: Array<[string | null, string]> = [
  [null, 'All'],
  ['credit', 'Credits'],
  ['debit', 'Debits'],
  ['reversal', 'Reversals'],
  ['adjustment', 'Adjustments'],
]

const TYPE_LABEL: Record<TransactionType, string> = {
  credit: 'Credit',
  debit: 'Debit',
  reversal: 'Reversal',
  adjustment: 'Adjustment',
}

export function TypePill({ type }: { type: TransactionType }) {
  const [, bg, fg] = TX_STYLE[type]
  return (
    <span className="rounded-[20px] px-2 py-[3px]" style={{ background: bg, ...rw(10, 700, fg) }}>
      {TYPE_LABEL[type]}
    </span>
  )
}

/** Transaction History — paged, filterable, pull to refresh. */
export default function TransactionsPage() {
  const [filter, setFilter] = useState<string | null>(null)
  const [items, setItems] = useState<WalletTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = useRef({ cursor: null as string | null, hasMore: true, busy: false, retried: false })
  const scroller = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (type: string | null, reset: boolean) => {
    const s = state.current
    if (reset) {
      s.cursor = null
      s.hasMore = true
      s.retried = false
      setItems([])
      setLoading(true)
      setError(null)
    }
    s.busy = true
    let res = await walletApi.getTransactions({ limit: 20, cursor: s.cursor, type })
    // One automatic retry on a cold-start timeout.
    if (!isSuccess(res) && res.statusCode === 0 && !s.retried) {
      s.retried = true
      res = await walletApi.getTransactions({ limit: 20, cursor: s.cursor, type })
    }
    if (isSuccess(res)) {
      const raw = res.data ?? {}
      const page = parseTransactions(raw)
      const next = nextCursor(raw)
      setItems((prev) => [...prev, ...page])
      s.cursor = next
      s.hasMore = next != null && page.length > 0
      setError(null)
    } else if (type == null) {
      // With a filter on, a failure most likely means "none of that kind".
      setError(res.error || 'Failed to load transactions')
    }
    s.busy = false
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    void fetchPage(filter, true)
  }, [filter, fetchPage])

  const onScroll = () => {
    const el = scroller.current
    const s = state.current
    if (!el || s.busy || !s.hasMore || loading) return
    if (el.scrollTop > el.scrollHeight - el.clientHeight - 200) {
      setLoadingMore(true)
      void fetchPage(filter, false)
    }
  }

  const showDetail = (tx: WalletTransaction) =>
    void showSheet(
      () => (
        <div className="pb-safe px-5 pb-8">
          <WalletHandle />
          <p className="text-center" style={rw(32, 800, tx.isCredit ? GREEN : RED)}>
            {tx.isCredit ? '+' : '-'}
            {formatNaira(tx.amount)}
          </p>
          <div className="mb-5 mt-1 flex justify-center">
            <TypePill type={tx.type} />
          </div>
          <DetailRow label="Description" value={tx.description} />
          <DetailRow label="Date" value={fmtLong(tx.createdAt)} />
          <DetailRow label="Balance After" value={formatNaira(tx.balanceAfter)} />
          {tx.reference && <DetailRow label="Reference" value={tx.reference} />}
          {tx.orderId && <DetailRow label="Order ID" value={tx.orderId} />}
        </div>
      ),
      { handle: false },
    )

  return (
    <Page background="#fff">
      <WalletAppBar title="Transaction History" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color={BRAND} />
        </div>
      ) : error ? (
        <ErrorView message={error} onRetry={() => void fetchPage(filter, true)} />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <ReceiptItem size={72} color={GREY[300]} />
          <p className="mt-4" style={rw(16, 600, GREY[500])}>
            {filter ? `No ${filter} transactions found` : 'No transactions yet'}
          </p>
          {filter && (
            <button type="button" onClick={() => setFilter(null)} className="mt-2 px-3 py-2" style={rw(13, 600, BRAND)}>
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <PullToRefresh onRefresh={() => fetchPage(filter, true)} color={BRAND} className="flex-1" scrollRef={scroller} onScroll={onScroll}>
          {items.map((tx, i) => {
            const [IconC, bg, fg] = TX_STYLE[tx.type]
            return (
              <button key={tx.id || i} type="button" onClick={() => showDetail(tx)} className="ink flex w-full items-center px-5 py-3.5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: bg }}>
                  <IconC size={18} color={fg} />
                </span>
                <span className="ml-3.5 min-w-0 flex-1">
                  <span className="block truncate" style={rw(13, 600, '#000')}>
                    {tx.description}
                  </span>
                  <span className="mt-[3px] flex items-center gap-2">
                    <span style={rw(11, 400, GREY[500])}>{fmtShort(tx.createdAt)}</span>
                    <TypePill type={tx.type} />
                  </span>
                </span>
                <span className="ml-3 flex flex-col items-end">
                  <span style={rw(14, 700, tx.isCredit ? GREEN : RED)}>
                    {tx.isCredit ? '+' : '-'}
                    {formatNaira(tx.amount)}
                  </span>
                  <span style={rw(10, 400, GREY[400])}>Bal: {formatNaira(tx.balanceAfter)}</span>
                </span>
              </button>
            )
          })}
          {loadingMore && (
            <div className="flex justify-center p-4">
              <Spinner size={24} stroke={2} color={BRAND} />
            </div>
          )}
        </PullToRefresh>
      )}
    </Page>
  )
}
