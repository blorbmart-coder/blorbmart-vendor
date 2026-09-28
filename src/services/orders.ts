import { dataOf, http, messageOf } from '../lib/http'

const BASE = '/api/orders'

async function updateStatus(orderId: string, status: string) {
  const res = await http(`${BASE}/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: { status },
    auth: true,
  })
  if (res.status !== 200) throw new Error(messageOf(res, 'Failed to update order status.'))
}

/**
 * placed → confirmed. The backend treats confirmed → confirmed as a no-op, so
 * this is safe even when Paystack has already auto-confirmed the order.
 */
export const acceptOrder = (orderId: string) => updateStatus(orderId, 'confirmed')

/**
 * Anything in the Preparing tab → ready: waiting for a rider. The rider's
 * pickup is what moves it on to out_for_delivery; asking for that here was
 * refused for every accepted order ("Unsupported status transition").
 */
export const markReady = (orderId: string) => updateStatus(orderId, 'ready')

/** Why a kitchen turned an order down. The backend words each for the customer. */
export type RejectReason = 'out_of_stock' | 'too_busy' | 'closing' | 'other'

export const REJECT_REASONS: Array<{ id: RejectReason; label: string }> = [
  { id: 'out_of_stock', label: 'Some items are out of stock' },
  { id: 'too_busy', label: 'Too busy right now' },
  { id: 'closing', label: 'We are closing' },
  { id: 'other', label: 'Something else' },
]

/**
 * placed → cancelled, with the customer refunded in full to their Blorbmart
 * wallet and the job taken off the rider board — all on the server, in one
 * call. Only a new order can be rejected; once accepted, it is support's.
 * Resolves with whether the refund went through (a failed one is flagged for
 * support rather than failing the rejection).
 */
export async function rejectOrder(orderId: string, reason: RejectReason): Promise<{ refunded: boolean }> {
  const res = await http(`${BASE}/${encodeURIComponent(orderId)}/reject`, {
    method: 'POST',
    body: { reason },
    auth: true,
  })
  if (res.status !== 200) throw new Error(messageOf(res, 'Could not reject this order.'))
  return { refunded: dataOf(res).refunded === true }
}

let syncing: Promise<void> | null = null

/**
 * Asks the backend to rewrite this vendor's copies of their open orders.
 *
 * The order screens read `vendorOrders`, copies the backend writes when an
 * order is paid and whenever it moves. Those writes can fail without failing
 * the payment, so the app asks for a repair once per session. Never throws:
 * the screens still show every copy that already exists, and a later session
 * tries again.
 */
export function syncOrderCopies(): Promise<void> {
  syncing ??= http('/api/vendor-orders/sync', { method: 'POST', auth: true }).then(
    () => undefined,
    () => {
      syncing = null
    },
  )
  return syncing
}
