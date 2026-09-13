/**
 * Naira formatting and the coercions every Firestore read goes through.
 *
 * Ported one-for-one from the Flutter app's formatters.dart, because the two
 * apps render the same documents and a price must never read differently
 * depending on which device a vendor happens to be holding.
 */

const nairaWhole = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 })
const nairaKobo = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * NaN and Infinity turn a formatter into "₦NaN". They reach us for real — a
 * computed field that once divided by zero, or a document imported with the
 * literal string "NaN" — so every money and count formatter funnels through
 * here and treats them as "no value".
 */
export function finiteOrZero(value: unknown): number {
  if (value == null) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

const signed = (n: number, body: string) => (n < 0 ? `-₦${body}` : `₦${body}`)

/** Whole naira, the Nigerian norm for food prices. */
export function money(value: unknown): string {
  const n = Math.round(finiteOrZero(value))
  return signed(n, nairaWhole.format(Math.abs(n)))
}

/** Kobo shown, for ledgers. */
export function moneyExact(value: unknown): string {
  const n = finiteOrZero(value)
  return signed(n, nairaKobo.format(Math.abs(n)))
}

/** Compact counts for social proof: 1200 -> "1.2k". */
export function compactCount(value: unknown): string {
  const v = finiteOrZero(value)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`
  if (v >= 1000) {
    const k = v / 1000
    return `${k.toFixed(k >= 10 ? 0 : 1)}k`
  }
  return String(Math.round(v))
}

/** "25-35 min". Food apps sell certainty, so always a range. */
export function etaWindow(minutes: number, spread = 10): string {
  const low = minutes < 5 ? 5 : minutes
  return `${low}-${low + spread} min`
}

/**
 * Firestore timestamps arrive as Timestamp, number, string or null depending
 * on which client wrote them. One coercion point avoids scattering checks.
 */
export function asDate(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 100_000_000_000 ? value : value * 1000)
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Non-finite input yields the fallback rather than NaN. */
export function asDouble(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string' && value.trim() !== '') {
    const d = Number(value)
    return Number.isFinite(d) ? d : fallback
  }
  return fallback
}

export function asInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number.parseInt(value, 10)
  return fallback
}

export function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === 'yes' || v === '1') return true
    if (v === 'false' || v === 'no' || v === '0') return false
  }
  return fallback
}

export function asString(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  const s = String(value).trim()
  return s === '' ? fallback : s
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((e) => (e == null ? '' : String(e).trim())).filter((e) => e !== '')
  }
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()]
  return []
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const monthName = (index: number) => MONTHS[index]

/** "3 Mar" — intl's `d MMM`. */
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`

/** "7:05 PM" — intl's `h:mm a`. */
export function clock12(d: Date): string {
  const h = d.getHours()
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "12 Sep, 7:05 PM" — intl's `d MMM, h:mm a`. */
export const dayAndTime = (when: Date | null | undefined) =>
  when ? `${dayMonth(when)}, ${clock12(when)}` : ''

/** Human relative time: "Just now", "12 min ago", "Yesterday", "3 Mar". */
export function timeAgo(when: Date | null | undefined): string {
  if (!when) return ''
  const seconds = Math.floor((Date.now() - when.getTime()) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (seconds < 45) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return dayMonth(when)
}

/** "jollof rice AND chicken" -> "Jollof Rice And Chicken". */
export function titleCase(input: string): string {
  const s = input.trim()
  if (!s) return s
  return s
    .split(/\s+/)
    .map((w) => (w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** FilteringTextInputFormatter.digitsOnly. */
export const digitsOnly = (v: string) => v.replace(/\D+/g, '')

/** Parses a typed amount the way double.tryParse does, commas tolerated. */
export function parseAmount(text: string): number {
  const n = Number(text.replace(/,/g, '').trim())
  return text.trim() !== '' && Number.isFinite(n) ? n : 0
}
