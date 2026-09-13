import { Card as CardIcon, MoneySend, Warning2 } from 'iconsax-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Page } from '../../components/AppBar'
import { showSheet } from '../../components/overlay'
import { PullToRefresh } from '../../components/PullToRefresh'
import { Spinner } from '../../components/Spinner'
import { isSuccess, walletApi } from './api'
import { fmtLong, formatNaira, nextCursor, parseWithdrawals, type Withdrawal, type WithdrawalStatus } from './model'
import { BRAND, DetailRow, ErrorView, FilterChips, GREY, rw, WalletAppBar, WalletHandle } from './ui'

const FILTERS: Array<[string | null, string]> = [
  [null, 'All'],
  ['pending', 'Pending'],
  ['processing', 'Processing'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
]

const STATUS: Record<WithdrawalStatus, [string, string, string]> = {
  pending: ['Pending', '#FEF5E7', '#F39C12'],
  processing: ['Processing', '#E8F0FE', '#3498DB'],
  completed: ['Completed', '#E8F8F4', '#00B894'],
  failed: ['Failed', '#FDECEB', '#E74C3C'],
}

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const [label, bg, fg] = STATUS[status]
  return (
    <span className="inline-flex items-center gap-[5px] rounded-[20px] px-2.5 py-[5px]" style={{ background: bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: fg }} />
      <span style={rw(11, 700, fg)}>{label}</span>
    </span>
  )
}

/** Payout History — every withdrawal and where it stands. */
export default function PayoutsPage() {
  const [filter, setFilter] = useState<string | null>(null)
  const [items, setItems] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = useRef({ cursor: null as string | null, hasMore: true, busy: false, retried: false })
  const scroller = useRef<HTMLDivElement>(null)

  const fetchPage = useCallback(async (status: string | null, reset: boolean) => {
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
    let res = await walletApi.getWithdrawals({ status, cursor: s.cursor })
    if (!isSuccess(res) && res.statusCode === 0 && !s.retried) {
      s.retried = true
      res = await walletApi.getWithdrawals({ status, cursor: s.cursor })
    }
    if (isSuccess(res) && res.data) {
      const page = parseWithdrawals(res.data)
      const next = nextCursor(res.data)
      setItems((prev) => [...prev, ...page])
      s.cursor = next
      s.hasMore = next != null && page.length > 0
      setError(null)
    } else {
      setError(res.error || 'Failed to load payouts')
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

  const showDetail = (wd: Withdrawal) =>
    void showSheet(
      () => (
        <div className="pb-safe px-5 pb-8">
          <WalletHandle />
          <p className="text-center" style={rw(32, 800, '#000')}>
            {formatNaira(wd.amount)}
          </p>
          <div className="my-2 flex justify-center">
            <StatusBadge status={wd.status} />
          </div>
          <div className="h-2" />
          <DetailRow label="Withdrawal ID" value={wd.id} flex={[1, 1]} />
          {wd.paystackReference && <DetailRow label="Reference" value={wd.paystackReference} flex={[1, 1]} />}
          {wd.bankName && <DetailRow label="Bank" value={wd.bankName} flex={[1, 1]} />}
          {wd.bankMasked && <DetailRow label="Account" value={wd.bankMasked} flex={[1, 1]} />}
          <DetailRow label="Initiated" value={fmtLong(wd.initiatedAt)} flex={[1, 1]} />
          <DetailRow label="Completed" value={wd.completedAt ? fmtLong(wd.completedAt) : 'Pending'} flex={[1, 1]} />
          {wd.failureReason && <DetailRow label="Failure Reason" value={wd.failureReason} flex={[1, 1]} />}
        </div>
      ),
      { handle: false },
    )

  return (
    <Page background="#fff">
      <WalletAppBar title="Payout History" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner color={BRAND} />
        </div>
      ) : error ? (
        <ErrorView message={error} onRetry={() => void fetchPage(filter, true)} />
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <MoneySend size={72} color={GREY[300]} />
          <p className="mt-4" style={rw(16, 600, GREY[500])}>
            {filter ? `No ${filter} payouts` : 'No payouts yet'}
          </p>
          <p className="mt-2" style={rw(13, 400, GREY[400])}>
            {filter ? 'Try a different filter' : 'Your payout history will appear here'}
          </p>
          {filter && (
            <button type="button" onClick={() => setFilter(null)} className="mt-2 px-3 py-2" style={rw(13, 600, BRAND)}>
              Clear filter
            </button>
          )}
        </div>
      ) : (
        <PullToRefresh onRefresh={() => fetchPage(filter, true)} color={BRAND} className="flex-1" scrollRef={scroller} onScroll={onScroll}>
          <div className="px-5 py-1">
            {items.map((wd, i) => {
              const bank =
                wd.bankName && wd.bankMasked ? `${wd.bankName} ${wd.bankMasked}` : (wd.bankName ?? wd.bankMasked ?? 'Bank account')
              return (
                <button
                  key={wd.id || i}
                  type="button"
                  onClick={() => showDetail(wd)}
                  className="mb-2.5 block w-full rounded-[16px] bg-white p-4 text-left"
                  style={{ border: `1px solid ${GREY[200]}` }}
                >
                  <span className="flex items-start justify-between">
                    <span>
                      <span className="block" style={rw(20, 800, '#000')}>
                        {formatNaira(wd.amount)}
                      </span>
                      {wd.paystackReference && (
                        <span className="mt-1 block" style={rw(11, 400, GREY[400])}>
                          {wd.paystackReference}
                        </span>
                      )}
                    </span>
                    <StatusBadge status={wd.status} />
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-[5px]">
                      <CardIcon size={13} color={GREY[400]} />
                      <span className="truncate" style={rw(12, 400, GREY[500])}>
                        {bank}
                      </span>
                    </span>
                    <span className="shrink-0" style={rw(11, 400, GREY[400])}>
                      {wd.completedAt ? `Done ${fmtLong(wd.completedAt)}` : fmtLong(wd.initiatedAt)}
                    </span>
                  </span>
                  {wd.failureReason && (
                    <span className="mt-2 flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5" style={{ background: 'rgb(244 67 54 / 0.06)' }}>
                      <Warning2 size={13} color="#F44336" />
                      <span className="flex-1" style={rw(11, 400, '#F44336')}>
                        {wd.failureReason}
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
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
