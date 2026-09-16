import { doc, getDoc } from 'firebase/firestore'
import {
  ArrowDown,
  ArrowRight3,
  ArrowUp,
  Card as CardIcon,
  Chart2,
  Clock,
  Edit,
  Lock,
  MoneySend,
  ReceiptItem,
  Refresh,
  RefreshCircle,
  Setting2,
  ShieldTick,
  Timer1,
  Warning2,
} from 'iconsax-react'
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { showSheet } from '../../components/overlay'
import { PullToRefresh } from '../../components/PullToRefresh'
import { Spinner } from '../../components/Spinner'
import { db } from '../../lib/db'
import { auth } from '../../lib/firebase'
import { isSuccess, walletApi } from './api'
import {
  formatNaira,
  parseTransactions,
  summaryFromJson,
  summaryHasData,
  walletFromJson,
  type TransactionType,
  type WalletOverview,
  type WalletSummary,
  type WalletTransaction,
} from './model'
import { BRAND, ErrorView, GREEN, GREY, ORANGE_TX, RED, rw, WalletAppBar, WalletButton, WalletHandle } from './ui'

type IconComponent = ComponentType<{ size?: number; color?: string }>

export const TX_STYLE: Record<TransactionType, [IconComponent, string, string]> = {
  credit: [ArrowDown, '#E8F8F4', GREEN],
  debit: [ArrowUp, '#FDECEB', RED],
  reversal: [RefreshCircle, '#FEF5E7', ORANGE_TX],
  adjustment: [Edit, 'rgb(81 86 241 / 0.08)', BRAND],
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ago(d: Date): string {
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${d.getDate()} ${MONTHS[d.getMonth() + 1]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * When the summary endpoint has nothing, the last thirty days of credits are
 * summed here instead, so the earnings panel is never blank for a vendor who
 * has in fact been paid.
 */
async function fallbackSummary(): Promise<WalletSummary | null> {
  const since = Date.now() - 30 * 86_400_000
  const res = await walletApi.getTransactions({ limit: 100, fromMs: since })
  if (!isSuccess(res) || !res.data) return null
  const credits = parseTransactions(res.data).filter((tx) => tx.isCredit)
  if (credits.length === 0) return null

  const now = new Date()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const monthStart = new Date(now.getTime() - 30 * 86_400_000)
  const week = credits.filter((tx) => tx.createdAt >= weekStart)
  const month = credits.filter((tx) => tx.createdAt >= monthStart)

  const daily = Array(7).fill(0) as number[]
  for (const tx of week) daily[tx.createdAt.getDay()] += tx.amount
  let busiestDay: string | null = null
  if (daily.some((v) => v > 0)) {
    const max = daily.indexOf(Math.max(...daily))
    busiestDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][max]
  }
  const orderIds = new Set(month.map((tx) => tx.orderId).filter(Boolean))
  const sum = (list: WalletTransaction[]) => list.reduce((t, tx) => t + tx.amount, 0)

  return {
    earningsThisWeek: sum(week),
    earningsThisMonth: sum(month),
    ordersThisMonth: orderIds.size > 0 ? orderIds.size : month.length,
    dailyEarnings: daily,
    avgOrderValue: month.length ? sum(month) / month.length : 0,
    busiestDay,
  }
}

/** What the backend refuses a withdrawal under. */
const MIN_WITHDRAWAL = 1000

interface WithdrawGate {
  ready: boolean
  title: string
  message: string
  action?: { label: string; to: string }
}

/**
 * What stands between this vendor and their money, and where to send them.
 *
 * The Withdraw tile used to simply go grey whenever a bank account was
 * missing or the wallet's withdrawal lock was off — beside a balance card
 * still reading "Ready to withdraw". A vendor with ₦24,600 showing was given
 * a dead icon and no reason for it, and no way to find out what to do about
 * it (QA, 15 Sep 2026, item 6).
 *
 * So nothing here disables the tile. Every case that would have greyed it out
 * is a sentence and, where there is one, the screen that fixes it. The one
 * case left to the withdraw screen itself is a missing PIN, which it already
 * offers to set up.
 */
function withdrawGate(wallet: WalletOverview): WithdrawGate {
  if (!wallet.isWithdrawalEnabled) {
    return {
      ready: false,
      title: 'Withdrawals are paused',
      message:
        'Payouts from this wallet are on hold. Your balance is safe and keeps growing — contact support to have the hold lifted.',
    }
  }
  if (!wallet.bankAccount) {
    return {
      ready: false,
      title: 'Add a bank account first',
      message:
        'We pay out to a Nigerian bank account in your name. Add and verify one — it takes about a minute — and your balance is ready to withdraw.',
      action: { label: 'Add bank account', to: '/wallet/bank' },
    }
  }
  if (wallet.availableBalance < MIN_WITHDRAWAL) {
    return {
      ready: false,
      title: `Minimum withdrawal is ${formatNaira(MIN_WITHDRAWAL)}`,
      message: `You have ${formatNaira(wallet.availableBalance)} available. Once it reaches ${formatNaira(
        MIN_WITHDRAWAL,
      )} you can send it to your bank.`,
    }
  }
  return { ready: true, title: '', message: '' }
}

/** Earnings and payouts — the Flutter SellerWalletPage. */
export default function WalletPage() {
  const nav = useNav()
  const [wallet, setWallet] = useState<WalletOverview | null>(null)
  const [summary, setSummary] = useState<WalletSummary | null>(null)
  const [recent, setRecent] = useState<WalletTransaction[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vendorStatus, setVendorStatus] = useState('verified')
  const [filter, setFilter] = useState<'week' | 'month'>('week')
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )

  /**
   * `silent` is the background refresh below: it keeps what is on screen
   * while it fetches, and a failed attempt leaves the last good figures up
   * rather than swapping the page for an error.
   */
  const load = useCallback(async (silent = false): Promise<void> => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    // Status first: an account under review has no wallet to call.
    const uid = auth.currentUser?.uid
    if (uid) {
      try {
        const snap = await getDoc(doc(db, 'vendors', uid))
        const status = String(snap.data()?.vendorStatus ?? 'verified')
        if (!alive.current) return
        setVendorStatus(status)
        if (status === 'pending') {
          setLoading(false)
          return
        }
      } catch {
        // Carry on to the wallet; it will say if access is refused.
      }
    }

    const fetchAll = () =>
      Promise.all([walletApi.getWallet(), walletApi.getSummary(), walletApi.getTransactions({ limit: 4 })])
    let [walletRes, summaryRes, txRes] = await fetchAll()
    // One automatic retry on a cold-start timeout.
    if (!isSuccess(walletRes) && walletRes.statusCode === 0) [walletRes, summaryRes, txRes] = await fetchAll()
    if (!alive.current) return

    if (isSuccess(walletRes) && walletRes.data) {
      let nextSummary = isSuccess(summaryRes) && summaryRes.data ? summaryFromJson(summaryRes.data) : null
      if (!nextSummary || !summaryHasData(nextSummary)) nextSummary = await fallbackSummary()
      if (!alive.current) return
      setWallet(walletFromJson(walletRes.data))
      setSummary(nextSummary)
      if (isSuccess(txRes) && txRes.data) {
        setRecent(parseTransactions(txRes.data))
        setRecentError(null)
      } else {
        setRecent([])
        setRecentError(txRes.error || 'Failed to load transactions')
      }
    } else if (!silent) {
      setError(walletRes.error || 'Failed to load wallet')
      setRecent([])
      setRecentError(null)
    }
    setRecentLoading(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Money that lands while the vendor is on this screen — an order settling,
  // a payout completing — appears without a pull or a tap (QA-BM-WEB-002,
  // item 5): quietly every 30 seconds while the page is in view, and at once
  // when the vendor comes back to it.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])

  const reloadAfter = (to: string, data?: unknown) => void nav.push(to, data).then(() => load())

  const sellerAccessError = /seller|access|not a seller|vendor/i.test(error ?? '')
  const blocked = vendorStatus === 'pending' || vendorStatus === 'suspended' || (error != null && sellerAccessError)

  const openSettings = () =>
    void showSheet(
      (close) => (
        <div className="pb-safe px-5 pb-8">
          <WalletHandle />
          <h2 style={rw(20, 800, '#000')}>Wallet Settings</h2>
          <div className="mt-4">
            <SettingsRow
              icon={CardIcon}
              label="Bank Account"
              onClick={() => {
                close()
                reloadAfter('/wallet/bank')
              }}
            />
            <SettingsRow
              icon={Lock}
              label={wallet?.pinSet ? 'Change PIN' : 'Set Up PIN'}
              onClick={() => {
                close()
                reloadAfter(`/wallet/pin${wallet?.pinSet ? '?change=1' : ''}`)
              }}
            />
            <SettingsRow
              icon={ShieldTick}
              label="Withdrawal Lock"
              trailing={
                wallet?.isWithdrawalEnabled ? <StatusChip label="Enabled" color="#4CAF50" /> : <StatusChip label="Disabled" color="#F44336" />
              }
            />
            <SettingsRow icon={Timer1} label="Hold Period" trailing={<span style={rw(13, 600, '#000')}>24 hours</span>} />
          </div>
        </div>
      ),
      { handle: false },
    )

  return (
    <Page background="#fff">
      <WalletAppBar
        titleNode={
          <div>
            <h1 style={rw(20, 800, '#000', { lineHeight: 1.2 })}>My Wallet</h1>
            <p style={rw(12, 400, GREY[500])}>Blorbmart Seller</p>
          </div>
        }
        actions={
          <>
            <IconAction label="Refresh" disabled={loading} onClick={() => void load()}>
              <Refresh size={24} color={BRAND} />
            </IconAction>
            <IconAction label="Wallet settings" onClick={openSettings}>
              <Setting2 size={24} color="#000" />
            </IconAction>
            <span className="w-1" />
          </>
        }
      />
      {blocked ? (
        <PendingBody suspended={vendorStatus === 'suspended'} />
      ) : loading ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Spinner color={BRAND} />
          <p className="mt-5" style={rw(14, 400, GREY[500])}>
            Loading your wallet…
          </p>
          <p className="mt-1.5 text-center" style={rw(12, 400, GREY[400])}>
            This may take a moment on first load
          </p>
        </div>
      ) : error ? (
        <ErrorView message={error} onRetry={() => void load()} iconButton />
      ) : (
        wallet && (
          <PullToRefresh onRefresh={load} color={BRAND} className="flex-1">
            <div className="px-5 pt-2">
              <BalanceCard wallet={wallet} />
            </div>
            <div className="mt-6 flex justify-between px-5">
              <QuickAction
                icon={MoneySend}
                label="Withdraw"
                color={BRAND}
                onClick={() => {
                  const gate = withdrawGate(wallet)
                  if (gate.ready) return reloadAfter('/wallet/withdraw', { wallet })
                  void showSheet(
                    (close) => (
                      <WithdrawBlockedSheet
                        gate={gate}
                        onClose={close}
                        onAction={(to) => {
                          close()
                          reloadAfter(to)
                        }}
                      />
                    ),
                    { handle: false },
                  )
                }}
              />
              <QuickAction icon={ReceiptItem} label="History" color={GREEN} onClick={() => void nav.push('/wallet/transactions')} />
              <QuickAction icon={CardIcon} label="Bank" color={ORANGE_TX} onClick={() => reloadAfter('/wallet/bank')} />
              <QuickAction icon={Chart2} label="Payouts" color="#9B59B6" onClick={() => void nav.push('/wallet/payouts')} />
            </div>
            <div className="h-6" />
            {summary && (
              <>
                <div className="px-5">
                  <h2 style={rw(16, 700, '#000')}>Earnings</h2>
                  <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                    <Chip label="This Week" selected={filter === 'week'} onClick={() => setFilter('week')} />
                    <Chip label="This Month" selected={filter === 'month'} onClick={() => setFilter('month')} />
                  </div>
                </div>
                <div className="mt-3 px-5">
                  <BarChart data={summary.dailyEarnings} />
                </div>
                {/* Each tile names its own period. Only the earnings tile
                    follows the chip; average order and order count are always
                    a 30-day figure, and labelling them all "Total Earnings",
                    "Avg. Order" and "Orders" under a "This Week" chip read as
                    ₦0 earned beside a ₦12,300 average on the same screen
                    (QA, 15 Sep 2026, item 6, secondary). */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 px-5">
                  <StatTile
                    label={filter === 'week' ? 'Earned this week' : 'Earned this month'}
                    value={formatNaira(filter === 'week' ? summary.earningsThisWeek : summary.earningsThisMonth)}
                  />
                  <StatTile label="Avg. order · 30 days" value={formatNaira(summary.avgOrderValue)} />
                  <StatTile label="Orders · 30 days" value={`${summary.ordersThisMonth} fulfilled`} />
                  {summary.busiestDay && <StatTile label="Busiest day · 7 days" value={summary.busiestDay} />}
                </div>
                <div className="h-6" />
              </>
            )}
            <div className="flex items-center justify-between px-5">
              <h2 style={rw(16, 700, '#000')}>Recent Transactions</h2>
              <button type="button" onClick={() => void nav.push('/wallet/transactions')} style={rw(12, 600, BRAND)}>
                See all
              </button>
            </div>
            <div className="mt-2 pb-8">
              <Recent
                loading={recentLoading}
                error={recentError}
                items={recent}
                onOpen={() => void nav.push('/wallet/transactions')}
              />
            </div>
          </PullToRefresh>
        )
      )}
    </Page>
  )
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="ink m-1 grid h-10 w-10 place-items-center rounded-full disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** The purple balance card with its two faint circles. */
function BalanceCard({ wallet }: { wallet: WalletOverview }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] p-6" style={{ background: BRAND }}>
      <span className="absolute -right-[30px] -top-[30px] h-[100px] w-[100px] rounded-full" style={{ background: 'rgb(255 255 255 / 0.07)' }} />
      <span className="absolute -bottom-5 left-5 h-[60px] w-[60px] rounded-full" style={{ background: 'rgb(255 255 255 / 0.05)' }} />
      <div className="relative">
        <p style={rw(11, 700, 'rgb(255 255 255 / 0.7)', { letterSpacing: 1 })}>AVAILABLE BALANCE</p>
        <p className="mt-2" style={rw(34, 800, '#fff')}>
          {formatNaira(wallet.availableBalance)}
        </p>
        {/* The subtitle is the balance card's one claim, so it must not say
            "Ready to withdraw" over a Withdraw button that will turn the
            vendor away. */}
        <p style={rw(12, 400, 'rgb(255 255 255 / 0.65)')}>
          {!wallet.isWithdrawalEnabled
            ? 'Withdrawals paused'
            : !wallet.bankAccount
              ? 'Add a bank account to withdraw'
              : wallet.availableBalance < MIN_WITHDRAWAL
                ? `Withdraw from ${formatNaira(MIN_WITHDRAWAL)}`
                : 'Ready to withdraw'}
        </p>
        <div className="mt-5 flex gap-3">
          <Meta label="PENDING" value={formatNaira(wallet.pendingBalance)} />
          <Meta label="TOTAL EARNED" value={formatNaira(wallet.totalEarned)} />
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-[10px] px-3 py-2.5" style={{ background: 'rgb(255 255 255 / 0.12)' }}>
      <p style={rw(9, 700, 'rgb(255 255 255 / 0.65)', { letterSpacing: 0.8 })}>{label}</p>
      <p className="mt-1 truncate" style={rw(13, 700, '#fff')}>
        {value}
      </p>
    </div>
  )
}

function QuickAction({
  icon: IconC,
  label,
  color,
  onClick,
}: {
  icon: IconComponent
  label: string
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className="flex flex-col items-center"
      style={{ opacity: onClick ? 1 : 0.4 }}
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-[14px]"
        style={{
          background: `color-mix(in srgb, ${color} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
        }}
      >
        <IconC size={22} color={color} />
      </span>
      <span className="mt-2" style={rw(11, 600, GREY[600])}>
        {label}
      </span>
    </button>
  )
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="shrink-0 rounded-[20px] px-4 py-2"
      style={{
        background: selected ? BRAND : GREY[100],
        border: `1px solid ${selected ? BRAND : GREY[300]}`,
        ...rw(12, 600, selected ? '#fff' : GREY[600]),
      }}
    >
      {label}
    </button>
  )
}

/** Seven bars, Sunday to Saturday, the last drawn lighter. */
function BarChart({ data }: { data: number[] }) {
  const max = Math.max(...data)
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <div className="rounded-[16px] p-4" style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}>
      <p style={rw(13, 700, '#000')}>Daily revenue — last 7 days</p>
      <div className="mt-3.5 flex h-20 items-end">
        {data.map((value, i) => {
          const pct = max === 0 ? 0.05 : Math.min(1, Math.max(0.05, value / max))
          const last = i === 6
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center px-[3px]">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[4px] transition-[height] duration-[600ms] ease-out"
                  style={{ height: `${pct * 100}%`, background: last ? 'rgb(81 86 241 / 0.35)' : BRAND }}
                />
              </div>
              <span className="mt-1.5" style={rw(10, 700, last ? BRAND : GREY[500])}>
                {labels[i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex aspect-[2.2] min-w-0 flex-col justify-center rounded-[14px] px-3.5 py-3"
      style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}
    >
      <p style={rw(10, 700, GREY[500], { letterSpacing: 0.4 })}>{label}</p>
      <p className="mt-1 truncate" style={rw(14, 800, '#000')}>
        {value}
      </p>
    </div>
  )
}

function Recent({
  loading,
  error,
  items,
  onOpen,
}: {
  loading: boolean
  error: string | null
  items: WalletTransaction[]
  onOpen: () => void
}) {
  if (loading) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center px-5 py-3">
            <span className="h-[42px] w-[42px] rounded-[12px]" style={{ background: GREY[200] }} />
            <span className="ml-3.5 flex-1">
              <span className="block h-[13px] w-[140px] rounded-[4px]" style={{ background: GREY[200] }} />
              <span className="mt-1.5 block h-[11px] w-20 rounded-[4px]" style={{ background: GREY[100] }} />
            </span>
            <span className="h-3.5 w-[60px] rounded-[4px]" style={{ background: GREY[200] }} />
          </div>
        ))}
      </>
    )
  }
  if (error) {
    return (
      <div className="px-5 py-2">
        <div className="flex flex-col items-center rounded-[14px] px-4 py-5" style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}>
          <ReceiptItem size={36} color={GREY[400]} />
          <p className="mt-2.5" style={rw(13, 600, GREY[600])}>
            Unable to load transactions
          </p>
        </div>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <p className="py-6 text-center" style={rw(13, 400, GREY[400])}>
        No transactions yet
      </p>
    )
  }
  return (
    <>
      {items.map((tx) => {
        const [IconC, bg, fg] = TX_STYLE[tx.type]
        return (
          <button key={tx.id || tx.createdAt.getTime()} type="button" onClick={onOpen} className="ink flex w-full items-center px-5 py-3 text-left">
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px]" style={{ background: bg }}>
              <IconC size={18} color={fg} />
            </span>
            <span className="ml-3.5 min-w-0 flex-1">
              <span className="block truncate" style={rw(13, 600, '#000')}>
                {tx.description}
              </span>
              <span className="mt-0.5 block" style={rw(11, 400, GREY[500])}>
                {ago(tx.createdAt)}
              </span>
            </span>
            <span style={rw(14, 700, tx.isCredit ? GREEN : RED)}>
              {tx.isCredit ? '+' : '-'}
              {formatNaira(tx.amount)}
            </span>
          </button>
        )
      })}
    </>
  )
}

/**
 * Why the withdrawal cannot start yet, and the one tap that changes it.
 *
 * Shown instead of a greyed-out icon, because a vendor staring at money they
 * cannot reach needs a reason and a next step, not a lower opacity.
 */
function WithdrawBlockedSheet({
  gate,
  onClose,
  onAction,
}: {
  gate: WithdrawGate
  onClose: () => void
  onAction: (to: string) => void
}) {
  return (
    <div className="pb-safe px-5 pb-8">
      <WalletHandle />
      <div className="mt-2 grid h-[60px] w-[60px] place-items-center rounded-[18px]" style={{ background: 'rgb(81 86 241 / 0.08)' }}>
        <MoneySend size={28} color={BRAND} />
      </div>
      <h2 className="mt-4" style={rw(20, 800, '#000')}>
        {gate.title}
      </h2>
      <p className="mt-2" style={rw(13, 400, GREY[600], { lineHeight: 1.6 })}>
        {gate.message}
      </p>
      <div className="mt-6 space-y-2.5">
        {gate.action && (
          <WalletButton onClick={() => onAction(gate.action!.to)}>
            <span style={rw(16, 700)}>{gate.action.label}</span>
          </WalletButton>
        )}
        <WalletButton outline={GREY[300]} onClick={onClose}>
          <span style={rw(16, 700, GREY[600])}>Close</span>
        </WalletButton>
      </div>
    </div>
  )
}

function PendingBody({ suspended }: { suspended: boolean }) {
  const tint = suspended ? '#FF4545' : '#FF8C42'
  const soft = suspended ? '#FFF0F0' : '#FFF4ED'
  const IconC = suspended ? Warning2 : Clock
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-9 text-center">
      <div className="grid h-[84px] w-[84px] place-items-center rounded-[22px]" style={{ background: soft }}>
        <IconC size={38} color={tint} />
      </div>
      <h2 className="mt-6" style={rw(22, 800, '#0D0D14')}>
        {suspended ? 'Account Suspended' : 'Account Under Review'}
      </h2>
      <p className="mt-3" style={rw(14, 400, '#9898A8', { lineHeight: 1.6 })}>
        {suspended
          ? 'Your account has been suspended. Please contact support to resolve this.'
          : 'Your store is being verified by our team. Wallet features will be unlocked once your account is approved.'}
      </p>
      <div
        className="mt-5 flex items-center gap-1.5 rounded-[20px] px-4 py-2"
        style={{ background: soft, border: `1px solid color-mix(in srgb, ${tint} 30%, transparent)` }}
      >
        <IconC size={14} color={tint} />
        <span style={rw(12, 600, tint)}>{suspended ? 'Contact support' : 'Verification in progress'}</span>
      </div>
    </div>
  )
}

function SettingsRow({
  icon: IconC,
  label,
  onClick,
  trailing,
}: {
  icon: IconComponent
  label: string
  onClick?: () => void
  trailing?: ReactNode
}) {
  const content = (
    <>
      <IconC size={20} color={BRAND} />
      <span className="ml-3.5 flex-1" style={rw(14, 600, '#000')}>
        {label}
      </span>
      {trailing ?? <ArrowRight3 size={16} color="#9E9E9E" />}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="ink flex w-full items-center rounded-[12px] py-3.5 text-left">
      {content}
    </button>
  ) : (
    <div className="flex items-center py-3.5">{content}</div>
  )
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-[20px] px-2.5 py-1"
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, ...rw(11, 700, color) } as CSSProperties}
    >
      {label}
    </span>
  )
}
