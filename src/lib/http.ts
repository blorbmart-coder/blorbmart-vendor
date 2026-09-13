import { auth } from './firebase'

const FALLBACK_API_URL = 'https://blorbmart-tr1i.onrender.com'

/**
 * The API host.
 *
 * Blank means unset, deliberately. A hosting dashboard holding VITE_API_URL
 * with an empty value builds to '' rather than undefined, and '' as a base
 * sends every call to the static host serving this app, which answers 404 to
 * /api/* — the rider app shipped exactly that once.
 */
const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
export const API_BASE = configured ? configured.replace(/[/]+$/, '') : FALLBACK_API_URL

export class TimeoutError extends Error {
  constructor() {
    super('That took too long. Check your connection and try again.')
    this.name = 'TimeoutError'
  }
}

export class NetworkError extends Error {
  constructor() {
    super('No connection. Check your internet and try again.')
    this.name = 'NetworkError'
  }
}

export class SignedOutError extends Error {
  constructor(message = 'Please sign in again.') {
    super(message)
    this.name = 'SignedOutError'
  }
}

export interface HttpResponse {
  status: number
  ok: boolean
  /** The parsed JSON object, or {} when the body was empty or not JSON. */
  body: Record<string, unknown>
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Attach the Firebase ID token. */
  auth?: boolean
  timeoutMs?: number
}

/**
 * One fetch, with a timeout that covers the body as well as the headers.
 *
 * Never sends cookies: every authenticated call carries its own bearer token,
 * and `credentials: 'omit'` means there is no ambient credential for a
 * cross-site request to ride on.
 */
export async function http(path: string, opts: RequestOptions = {}): Promise<HttpResponse> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  if (opts.auth) {
    const user = auth.currentUser
    if (!user) throw new SignedOutError()
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    const text = await res.text()
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>
      }
    } catch {
      // Not JSON — a proxy error page, a cold-start splash. Callers fall back
      // to their own wording.
    }
    return { status: res.status, ok: res.ok, body }
  } catch {
    if (controller.signal.aborted) throw new TimeoutError()
    throw new NetworkError()
  } finally {
    clearTimeout(timer)
  }
}

/** The server's own message when it gave one, else the fallback. */
export function messageOf(res: HttpResponse, fallback: string): string {
  const m = res.body.message
  return typeof m === 'string' && m.trim() ? m : fallback
}

/** `{ status, data }` envelopes, unwrapped; a bare object passes through. */
export function dataOf(res: HttpResponse): Record<string, unknown> {
  const d = res.body.data
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : res.body
}

/** Readable text for anything thrown, with no "Exception:" noise. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
