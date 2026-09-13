import { isRecord } from '../../lib/format'

/* The wallet's data, ported from wallet_model.dart. All money is naira. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** intl's `d MMM · HH:mm`. */
export const fmtShort = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
/** intl's `d MMM yyyy, HH:mm`. */
export const fmtLong = (d: Date) =>
  `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`

const naira = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** NumberFormat.currency(symbol: '₦', decimalDigits: 2): "₦1,500.00". */
export const formatNaira = (n: number) => `${n < 0 ? '-' : ''}₦${naira.format(Math.abs(Number.isFinite(n) ? n : 0))}`

const toDouble = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

const stringOrNull = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

const firstPresent = (json: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (json[k] != null) return json[k]
  return null
}

function parseDate(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v < 1_000_000_000_000 ? v * 1000 : v)
  if (isRecord(v)) {
    const seconds = v._seconds ?? v.seconds
    const nanos = toDouble(v._nanoseconds ?? v.nanoseconds)
    if (typeof seconds === 'number') return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000))
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

function readAmount(amount: unknown, amountNaira: unknown, amountKobo: unknown) {
  if (amountNaira != null) return toDouble(amountNaira)
  if (amount != null) return toDouble(amount)
  if (amountKobo != null) return toDouble(amountKobo) / 100
  return 0
}

export interface BankAccountSummary {
  masked: string
  bankName: string
}

export interface WalletOverview {
  availableBalance: number
  pendingBalance: number
  totalEarned: number
  isWithdrawalEnabled: boolean
  pinSet: boolean
  bankAccount: BankAccountSummary | null
}

export function walletFromJson(d: Record<string, unknown>): WalletOverview {
  const bank = isRecord(d.bankAccount) ? d.bankAccount : null
  return {
    availableBalance: toDouble(d.availableBalance),
    pendingBalance: toDouble(d.pendingBalance),
    totalEarned: toDouble(d.totalEarned),
    isWithdrawalEnabled: typeof d.isWithdrawalEnabled === 'boolean' ? d.isWithdrawalEnabled : true,
    pinSet: d.pinSet === true,
    bankAccount: bank
      ? { masked: String(bank.accountMasked ?? bank.masked ?? '****'), bankName: String(bank.bankName ?? '') }
      : null,
  }
}

export interface WalletSummary {
  earningsThisWeek: number
  earningsThisMonth: number
  ordersThisMonth: number
  /** Seven values, Sunday to Saturday. */
  dailyEarnings: number[]
  avgOrderValue: number
  busiestDay: string | null
}

export const summaryHasData = (s: WalletSummary) =>
  s.earningsThisWeek > 0 ||
  s.earningsThisMonth > 0 ||
  s.avgOrderValue > 0 ||
  s.ordersThisMonth > 0 ||
  s.dailyEarnings.some((v) => v > 0)

const normalise = (values: number[], target = 7) =>
  values.length === target
    ? values
    : values.length > target
      ? values.slice(values.length - target)
      : [...Array(target - values.length).fill(0), ...values]

const DAY_ORDER: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}

function parseDaily(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return normalise(
      raw.map((e) => (isRecord(e) ? toDouble(e.amount ?? e.value ?? e.earnings ?? e.revenue ?? e.total) : toDouble(e))),
    )
  }
  if (isRecord(raw)) {
    const keys = Object.keys(raw)
    if (keys.some((k) => k.toLowerCase() in DAY_ORDER)) {
      const values = Array(7).fill(0) as number[]
      for (const k of keys) {
        const i = DAY_ORDER[k.toLowerCase()]
        if (i != null) values[i] = toDouble(raw[k])
      }
      return values
    }
    return normalise(Object.values(raw).map(toDouble))
  }
  return Array(7).fill(0)
}

export function summaryFromJson(json: Record<string, unknown>): WalletSummary {
  const nested = firstPresent(json, ['summary', 'analytics', 'stats', 'overview'])
  const root = isRecord(nested) ? nested : json
  return {
    earningsThisWeek: toDouble(firstPresent(root, ['earningsThisWeek', 'weeklyEarnings', 'weekEarnings', 'weekTotal'])),
    earningsThisMonth: toDouble(firstPresent(root, ['earningsThisMonth', 'monthlyEarnings', 'monthEarnings', 'monthTotal'])),
    ordersThisMonth: Math.trunc(
      toDouble(firstPresent(root, ['ordersThisMonth', 'monthlyOrders', 'ordersFulfilledThisMonth', 'totalOrdersThisMonth'])),
    ),
    dailyEarnings: parseDaily(
      firstPresent(root, ['dailyEarnings', 'dailyRevenue', 'dailyRevenueGraph', 'earningsByDay', 'last7Days', 'weeklyBreakdown']),
    ),
    avgOrderValue: toDouble(firstPresent(root, ['avgOrderValue', 'averageOrderValue', 'avgOrder', 'averageTicket'])),
    busiestDay: stringOrNull(firstPresent(root, ['busiestDay', 'topDay', 'bestDay'])),
  }
}

export type TransactionType = 'credit' | 'debit' | 'reversal' | 'adjustment'
const TX_TYPES: TransactionType[] = ['credit', 'debit', 'reversal', 'adjustment']

export interface WalletTransaction {
  id: string
  type: TransactionType
  isCredit: boolean
  amount: number
  balanceAfter: number
  reference: string | null
  orderId: string | null
  description: string
  createdAt: Date
}

function transactionFromJson(json: Record<string, unknown>): WalletTransaction {
  const typeStr = String(json.type ?? 'credit').toLowerCase()
  const dir = String(json.direction ?? json.flow ?? json.entryType ?? 'in').toLowerCase()
  return {
    id: stringOrNull(json.id) ?? stringOrNull(json._id) ?? stringOrNull(json.transactionId) ?? '',
    type: TX_TYPES.includes(typeStr as TransactionType) ? (typeStr as TransactionType) : 'credit',
    isCredit: dir === 'in' || dir === 'inward' || dir === 'credit',
    amount: readAmount(json.amount, json.amountNaira, json.amountKobo),
    balanceAfter: readAmount(json.balanceAfter, json.balanceAfterNaira, json.balanceAfterKobo),
    reference: stringOrNull(json.reference ?? json.txRef),
    orderId: stringOrNull(json.orderId),
    description: stringOrNull(json.description ?? json.title ?? json.narration) ?? '',
    createdAt: parseDate(json.createdAt ?? json.timestamp ?? json.date),
  }
}

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed'
const WD_STATUSES: WithdrawalStatus[] = ['pending', 'processing', 'completed', 'failed']

export interface Withdrawal {
  id: string
  amount: number
  status: WithdrawalStatus
  paystackReference: string | null
  failureReason: string | null
  initiatedAt: Date
  completedAt: Date | null
  bankName: string | null
  bankMasked: string | null
}

function withdrawalFromJson(json: Record<string, unknown>): Withdrawal {
  const status = String(json.status ?? 'pending').toLowerCase()
  const bankAccount = isRecord(json.bankAccount) ? json.bankAccount : {}
  const bank = isRecord(json.bank) ? json.bank : {}
  const completed = json.completedAt ?? json.processedAt
  return {
    id: stringOrNull(json.id) ?? stringOrNull(json._id) ?? stringOrNull(json.withdrawalId) ?? '',
    amount: readAmount(json.amount, json.amountNaira, json.amountKobo),
    status: WD_STATUSES.includes(status as WithdrawalStatus) ? (status as WithdrawalStatus) : 'pending',
    paystackReference: stringOrNull(json.paystackReference ?? json.reference ?? json.transferCode),
    failureReason: stringOrNull(json.failureReason ?? json.reason ?? json.error),
    initiatedAt: parseDate(json.initiatedAt ?? json.createdAt ?? json.timestamp),
    completedAt: completed != null ? parseDate(completed) : null,
    bankName: stringOrNull(json.bankName ?? bankAccount.bankName ?? bank.name),
    bankMasked: stringOrNull(json.accountMasked ?? bankAccount.accountMasked ?? bankAccount.masked ?? bank.masked),
  }
}

const firstList = (raw: Record<string, unknown>, keys: string[]) => {
  const v = firstPresent(raw, keys)
  return Array.isArray(v) ? v : null
}

export const parseTransactions = (raw: Record<string, unknown>) =>
  (firstList(raw, ['transactions', 'items', 'records', 'history']) ?? []).filter(isRecord).map(transactionFromJson)

export const parseWithdrawals = (raw: Record<string, unknown>) =>
  (firstList(raw, ['withdrawals', 'items', 'records', 'history']) ?? []).filter(isRecord).map(withdrawalFromJson)

export const nextCursor = (raw: Record<string, unknown>) =>
  stringOrNull(firstPresent(raw, ['nextCursor', 'cursor', 'nextPageCursor']))

export interface BankAccount {
  id: string
  bankCode: string
  bankName: string
  maskedAccountNumber: string
  accountName: string
  isVerified: boolean
}

export const bankAccountFromJson = (json: Record<string, unknown>): BankAccount => ({
  id: String(json.id ?? ''),
  bankCode: String(json.bankCode ?? ''),
  bankName: String(json.bankName ?? ''),
  maskedAccountNumber: String(json.accountMasked ?? ''),
  accountName: String(json.accountName ?? ''),
  isVerified: json.isVerified === true,
})
