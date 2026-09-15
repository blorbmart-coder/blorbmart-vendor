import { http, messageOf } from '../lib/http'

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
