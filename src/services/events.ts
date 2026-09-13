import {
  attendeeFromMap,
  broadcastFromMap,
  checkInFromMap,
  eventFromMap,
  eventIsNew,
  eventToJson,
  type Attendee,
  type BroadcastResult,
  type CheckInResult,
  type VendorEvent,
} from '../data/eventModels'
import { isRecord } from '../lib/format'
import { http, SignedOutError, type HttpResponse } from '../lib/http'

const BASE = '/api/events'

/** Anything the organizer needs to read, with a message already fit to show. */
export class EventsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventsError'
  }
}

async function call(path: string, opts: Parameters<typeof http>[1] = {}): Promise<HttpResponse> {
  try {
    return await http(path, { ...opts, auth: true })
  } catch (error) {
    if (error instanceof SignedOutError) throw new EventsError('Please sign in again.')
    throw error
  }
}

function unwrap(res: HttpResponse): Record<string, unknown> {
  if (res.status < 200 || res.status >= 300) {
    const m = res.body.message
    throw new EventsError(typeof m === 'string' && m ? m : 'That did not work. Please try again.')
  }
  const data = res.body.data
  return isRecord(data) ? data : res.body
}

/* ─────────────────────────────────────────────────────────────────────────
   The organizer's side of ticketing. Everything goes through the backend:
   seats are reserved in a transaction and tickets are signed with a secret,
   and neither belongs in a browser.
   ───────────────────────────────────────────────────────────────────────── */

export async function myEvents(): Promise<VendorEvent[]> {
  const data = unwrap(await call(`${BASE}/mine`))
  return (Array.isArray(data.events) ? data.events : []).filter(isRecord).map(eventFromMap)
}

/** Creates or updates. The backend keeps `sold` counts across an edit. */
export async function saveEvent(event: VendorEvent, storeId?: string, organizerName?: string) {
  const body = eventToJson(event, storeId, organizerName)
  const res = eventIsNew(event)
    ? await call(BASE, { method: 'POST', body })
    : await call(`${BASE}/${encodeURIComponent(event.id)}`, { method: 'PUT', body })
  return eventFromMap(unwrap(res))
}

export async function setEventStatus(eventId: string, status: string) {
  return eventFromMap(
    unwrap(await call(`${BASE}/${encodeURIComponent(eventId)}/status`, { method: 'PATCH', body: { status } })),
  )
}

/** The door list, plus how many are already inside. */
export async function eventAttendees(eventId: string): Promise<{ attendees: Attendee[]; checkedIn: number }> {
  const data = unwrap(await call(`${BASE}/${encodeURIComponent(eventId)}/attendees`))
  return {
    attendees: (Array.isArray(data.tickets) ? data.tickets : []).filter(isRecord).map(attendeeFromMap),
    checkedIn: typeof data.checkedIn === 'number' ? Math.trunc(data.checkedIn) : 0,
  }
}

/**
 * Checks a scanned code in. A rejected ticket is a normal answer with
 * `ok: false` — the door needs the reason on screen, not an exception.
 * Twelve seconds, not thirty: there is a queue behind this person.
 */
export async function checkIn(code: string): Promise<CheckInResult> {
  return checkInFromMap(
    unwrap(await call(`${BASE}/tickets/check-in`, { method: 'POST', body: { code }, timeoutMs: 12_000 })),
  )
}

/**
 * Messages everyone holding a ticket. Ninety seconds, because the backend
 * sends before it answers; a timeout here does not mean nothing went.
 */
export async function broadcast(
  eventId: string,
  { message, title = '', push = true, email = true }: { message: string; title?: string; push?: boolean; email?: boolean },
): Promise<BroadcastResult> {
  return broadcastFromMap(
    unwrap(
      await call(`${BASE}/${encodeURIComponent(eventId)}/broadcast`, {
        method: 'POST',
        body: {
          title: title.trim(),
          message: message.trim(),
          channels: [...(push ? ['push'] : []), ...(email ? ['email'] : [])],
        },
        timeoutMs: 90_000,
      }),
    ),
  )
}
