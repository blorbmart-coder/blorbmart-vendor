import { dataOf, http, SignedOutError, TimeoutError } from '../../lib/http'

/**
 * The seller wallet API — /api/seller-wallet.
 *
 * Every call answers with an ApiResult rather than throwing, as the Flutter
 * wallet screens expect: they branch on `statusCode` (401 means a wrong PIN)
 * and on 0 (the request never completed, usually Render cold-starting).
 */
export interface ApiResult {
  data: Record<string, unknown> | null
  error: string | null
  /** 0 when the request never completed. */
  statusCode: number
  /**
   * The server's reason, where it gives one — PIN_ALREADY_SET, PIN_NOT_SET,
   * PIN_LOCKED, PIN_INVALID — so a screen can offer the fix, not just the text.
   */
  code?: string | null
}

export const isSuccess = (r: ApiResult) => r.statusCode >= 200 && r.statusCode < 300

// Render's free tier can take up to a minute to wake.
const TIMEOUT_MS = 90_000
const TIMEOUT_MESSAGE = 'Request timed out. The server may be waking up — please try again.'
const BASE = '/api/seller-wallet'

async function call(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown): Promise<ApiResult> {
  try {
    const res = await http(path, { method, body, auth: true, timeoutMs: TIMEOUT_MS })
    if (res.ok) return { data: dataOf(res), error: null, statusCode: res.status }
    const { message, code } = res.body
    return {
      data: null,
      error: typeof message === 'string' ? message : 'Request failed',
      statusCode: res.status,
      code: typeof code === 'string' ? code : null,
    }
  } catch (error) {
    if (error instanceof TimeoutError) return { data: null, error: TIMEOUT_MESSAGE, statusCode: 0 }
    if (error instanceof SignedOutError) return { data: null, error: error.message, statusCode: 0 }
    return { data: null, error: error instanceof Error ? error.message : 'Request failed', statusCode: 0 }
  }
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v))
  return q.toString()
}

export const walletApi = {
  getWallet: () => call(BASE),
  getSummary: () => call(`${BASE}/summary`),
  getTransactions: (o: { limit?: number; cursor?: string | null; type?: string | null; fromMs?: number } = {}) =>
    call(`${BASE}/transactions?${qs({ limit: o.limit ?? 20, cursor: o.cursor, type: o.type, from: o.fromMs })}`),
  getBanks: () => call(`${BASE}/banks`),
  getBankAccount: () => call(`${BASE}/bank-account`),
  verifyBankAccount: (bankCode: string, accountNumber: string) =>
    call(`${BASE}/bank-account/verify`, 'POST', { bankCode, accountNumber }),
  addBankAccount: (bankCode: string, accountNumber: string) =>
    call(`${BASE}/bank-account`, 'POST', { bankCode, accountNumber }),
  deleteBankAccount: () => call(`${BASE}/bank-account`, 'DELETE'),
  setupPin: (pin: string) => call(`${BASE}/pin/setup`, 'POST', { pin, confirmPin: pin }),
  changePin: (currentPin: string, newPin: string) =>
    call(`${BASE}/pin/change`, 'POST', { currentPin, newPin, confirmNewPin: newPin }),
  verifyPin: (pin: string) => call(`${BASE}/pin/verify`, 'POST', { pin }),
  /** Emails a 6-digit code; answers `{ emailMasked }`. The way back from a forgotten or locked PIN. */
  requestPinReset: () => call(`${BASE}/pin/reset-request`, 'POST', {}),
  resetPin: (otp: string, newPin: string) => call(`${BASE}/pin/reset`, 'POST', { otp, newPin }),
  /** The backend takes kobo, as an integer — never a naira float. */
  withdraw: (amountNaira: number, pin: string) =>
    call(`${BASE}/withdraw`, 'POST', { amountKobo: Math.round(amountNaira * 100), pin }),
  getWithdrawals: (o: { status?: string | null; cursor?: string | null; limit?: number } = {}) =>
    call(`${BASE}/withdrawals?${qs({ limit: o.limit ?? 20, status: o.status, cursor: o.cursor })}`),
}

/**
 * Bills — airtime, data, electricity and TV — paid from the vendor's
 * earnings. The same endpoints the customer app uses, with `payer: 'vendor'`,
 * so the backend debits (and on failure refunds) this wallet, behind its PIN.
 */
export const billsApi = {
  catalog: () => call('/api/bills/catalog'),
  plans: (serviceKey: string) => call(`/api/bills/services/${encodeURIComponent(serviceKey)}/variations`),
  verifyCustomer: (serviceKey: string, accountNumber: string, meterType?: string) =>
    call('/api/bills/verify-customer', 'POST', { serviceKey, accountNumber, meterType }),
  purchase: (body: {
    serviceKey: string
    amount?: number
    phone?: string
    accountNumber?: string
    variationCode?: string
    meterType?: string
    pin: string
    idempotencyKey: string
  }) => call('/api/bills/purchase', 'POST', { ...body, payer: 'vendor', paymentMethod: 'wallet' }),
  history: () => call(`/api/bills/history?${qs({ payer: 'vendor', limit: 10 })}`),
}
