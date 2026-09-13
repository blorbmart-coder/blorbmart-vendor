import { isRecord } from '../lib/format'

/* ─────────────────────────────────────────────────────────────────────────
   What an organizer sells: an event, and the tiers of entry to it. These go
   through the backend, not Firestore, so the coercions match the Flutter
   event_models.dart rather than the Firestore formatters.
   ───────────────────────────────────────────────────────────────────────── */

const num = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback
  const n = Number.parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

const int = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : fallback
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v))

/**
 * DateTime.tryParse: an ISO string with an offset is an instant; one without
 * is local wall time. JavaScript's Date follows the same rule for full
 * date-time strings, which is what keeps both apps showing the same hour.
 */
const date = (v: unknown): Date | null => {
  if (v == null) return null
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/**
 * Dart's `toIso8601String()` on a local DateTime: wall time, no offset. The
 * Flutter app writes events this way, so this app writes them the same way —
 * an event edited on either device must come back at the same hour on both.
 */
export function dartIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  )
}

/** One tier of entry. A price of zero is a free ticket, a real product. */
export interface EventTier {
  id: string
  name: string
  description: string
  price: number
  /** 0 means uncapped. */
  quantity: number
  sold: number
  maxPerOrder: number
  salesEndAt: Date | null
}

export const tierIsFree = (t: EventTier) => t.price <= 0
export const tierRevenue = (t: EventTier) => t.price * t.sold

function tierToJson(t: EventTier) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    price: t.price,
    quantity: t.quantity,
    maxPerOrder: t.maxPerOrder,
    ...(t.salesEndAt ? { salesEndAt: dartIso(t.salesEndAt) } : {}),
  }
}

function tierFromMap(m: Record<string, unknown>): EventTier {
  return {
    id: str(m.id),
    name: str(m.name, 'Ticket'),
    description: str(m.description),
    price: num(m.price),
    quantity: int(m.quantity),
    sold: int(m.sold),
    maxPerOrder: int(m.maxPerOrder),
    salesEndAt: date(m.salesEndAt),
  }
}

export interface VendorEvent {
  id: string
  title: string
  description: string
  category: string
  coverUrl: string
  venueName: string
  venueAddress: string
  city: string
  startsAt: Date | null
  endsAt: Date | null
  status: string
  tiers: EventTier[]
  totalSold: number
  totalCapacity: number
}

export const blankEvent: VendorEvent = {
  id: '',
  title: '',
  description: '',
  category: 'music',
  coverUrl: '',
  venueName: '',
  venueAddress: '',
  city: '',
  startsAt: null,
  endsAt: null,
  status: 'draft',
  tiers: [],
  totalSold: 0,
  totalCapacity: 0,
}

export const eventIsNew = (e: VendorEvent) => e.id === ''
export const eventIsPublished = (e: VendorEvent) => e.status === 'published'
export const eventIsCancelled = (e: VendorEvent) => e.status === 'cancelled'

export function eventHasEnded(e: VendorEvent): boolean {
  const ends = e.endsAt ?? e.startsAt
  return ends != null && ends.getTime() < Date.now()
}

export const eventRevenue = (e: VendorEvent) => e.tiers.reduce((sum, t) => sum + tierRevenue(t), 0)

export function eventStatusLabel(e: VendorEvent): string {
  if (eventIsCancelled(e)) return 'Cancelled'
  if (eventHasEnded(e)) return 'Finished'
  return eventIsPublished(e) ? 'On sale' : 'Draft'
}

export function eventStatusColor(e: VendorEvent): string {
  if (eventIsCancelled(e)) return 'var(--color-danger)'
  if (eventHasEnded(e)) return 'var(--color-ink-faint)'
  return eventIsPublished(e) ? 'var(--color-success)' : 'var(--color-warning)'
}

/** What still has to be true before this can go on sale. */
export function eventBlockers(e: VendorEvent): string[] {
  const missing: string[] = []
  if (e.title.trim().length < 3) missing.push('Event name')
  if (!e.startsAt) missing.push('Date and time')
  if (!e.venueName.trim() && !e.venueAddress.trim()) missing.push('Venue')
  if (e.tiers.length === 0) missing.push('At least one ticket type')
  return missing
}

export function eventToJson(e: VendorEvent, storeId?: string, organizerName?: string) {
  return {
    title: e.title.trim(),
    description: e.description.trim(),
    category: e.category,
    coverUrl: e.coverUrl,
    venueName: e.venueName.trim(),
    venueAddress: e.venueAddress.trim(),
    city: e.city.trim(),
    ...(e.startsAt ? { startsAt: dartIso(e.startsAt) } : {}),
    ...(e.endsAt ? { endsAt: dartIso(e.endsAt) } : {}),
    status: e.status,
    ticketTypes: e.tiers.map(tierToJson),
    ...(storeId != null ? { storeId } : {}),
    ...(organizerName != null ? { organizerName } : {}),
  }
}

export function eventFromMap(m: Record<string, unknown>): VendorEvent {
  return {
    id: str(m.id),
    title: str(m.title),
    description: str(m.description),
    category: str(m.category, 'music'),
    coverUrl: str(m.coverUrl),
    venueName: str(m.venueName),
    venueAddress: str(m.venueAddress),
    city: str(m.city),
    startsAt: date(m.startsAt),
    endsAt: date(m.endsAt),
    status: str(m.status, 'draft'),
    tiers: (Array.isArray(m.ticketTypes) ? m.ticketTypes : []).filter(isRecord).map(tierFromMap),
    totalSold: int(m.totalSold),
    totalCapacity: int(m.totalCapacity),
  }
}

/** One person on the door list. */
export interface Attendee {
  id: string
  holderName: string
  holderPhone: string
  ticketTypeName: string
  reference: string
  status: string
  price: number
  usedAt: Date | null
}

export const attendeeCheckedIn = (a: Attendee) => a.status === 'used'

export function attendeeFromMap(m: Record<string, unknown>): Attendee {
  return {
    id: str(m.id),
    holderName: str(m.holderName),
    holderPhone: str(m.holderPhone),
    ticketTypeName: str(m.ticketTypeName),
    reference: str(m.reference),
    status: str(m.status, 'valid'),
    price: num(m.price),
    usedAt: date(m.usedAt),
  }
}

/** What went out when an organizer messaged everyone with a ticket. */
export interface BroadcastResult {
  recipients: number
  tickets: number
  pushSent: number | null
  emailSent: number | null
  emailMissing: number
}

export function broadcastFromMap(m: Record<string, unknown>): BroadcastResult {
  const push = isRecord(m.push) ? m.push : null
  const email = isRecord(m.email) ? m.email : null
  return {
    recipients: int(m.recipients),
    tickets: int(m.tickets),
    pushSent: push ? int(push.sent) : null,
    emailSent: email ? int(email.sent) : null,
    emailMissing: email ? int(email.noAddress) : 0,
  }
}

/** One line for the toast, in the organizer's terms. */
export function broadcastSummary(r: BroadcastResult): string {
  const people = `${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`
  const parts = [
    ...(r.pushSent != null ? [`${r.pushSent} ${r.pushSent === 1 ? 'phone' : 'phones'} notified`] : []),
    ...(r.emailSent != null ? [`${r.emailSent} ${r.emailSent === 1 ? 'email' : 'emails'} sent`] : []),
  ]
  const main = parts.length === 0 ? `Sent to ${people}.` : `Sent to ${people}: ${parts.join(', ')}.`
  if (r.emailSent == null || r.emailMissing === 0) return main
  return `${main} ${r.emailMissing} ${r.emailMissing === 1 ? 'has' : 'have'} no email on file.`
}

/** The answer to one scan at the door. */
export interface CheckInResult {
  ok: boolean
  message: string
  reason: string
  holderName: string
  ticketTypeName: string
  usedAt: Date | null
}

/**
 * "Already used" is its own colour: not a forgery, but the person must not
 * be let in twice, and the door has to tell the two apart instantly.
 */
export const checkInIsDuplicate = (r: CheckInResult) => r.reason === 'already_used'

export function checkInFromMap(m: Record<string, unknown>): CheckInResult {
  const ticket = isRecord(m.ticket) ? m.ticket : {}
  return {
    ok: m.ok === true,
    message: str(m.message, 'Scanned.'),
    reason: str(m.reason),
    holderName: str(ticket.holderName),
    ticketTypeName: str(ticket.ticketTypeName),
    usedAt: date(ticket.usedAt),
  }
}
