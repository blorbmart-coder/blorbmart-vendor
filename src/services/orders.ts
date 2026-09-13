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

/** preparing → out_for_delivery: ready for a rider. */
export const markReadyForDelivery = (orderId: string) => updateStatus(orderId, 'out_for_delivery')
