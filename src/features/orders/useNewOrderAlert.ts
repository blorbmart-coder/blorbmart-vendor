import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect } from 'react'
import { toast } from '../../components/overlay'
import { playAlert, primeAlertSound } from '../../lib/alertSound'
import { db } from '../../lib/db'

/**
 * Rings the loud Blorbmart alert when a new paid order arrives, from whichever
 * tab the vendor has open. It keeps ringing until they tap anywhere, for up to
 * a minute — a vendor is usually across the kitchen from the screen.
 *
 * The first answer is the queue as it already stands and does not ring: only
 * an order that turns up while the app is open does. A draft is "placed" long
 * before it is paid, so the query also requires the payment, as the Orders
 * screen does.
 */
export function useNewOrderAlert(storeId: string | null | undefined) {
  useEffect(() => {
    primeAlertSound()
  }, [])

  useEffect(() => {
    if (!storeId) return
    let baseline = false
    return onSnapshot(
      query(
        collection(db, 'vendorOrders'),
        where('storeId', '==', storeId),
        where('orderStatus', '==', 'placed'),
        where('paymentStatus', '==', 'completed'),
        limit(50),
      ),
      { includeMetadataChanges: true },
      (snap) => {
        if (!baseline) {
          if (!snap.metadata.fromCache) baseline = true
          return
        }
        const fresh = snap.docChanges().filter((change) => change.type === 'added')
        if (!fresh.length) return
        playAlert({ repeatFor: 60_000 })
        toast(fresh.length === 1 ? 'New order — tap to silence' : `${fresh.length} new orders — tap to silence`, {
          tone: 'success',
          duration: 8000,
        })
      },
      (error) => console.warn('new-order alert stopped', error.code),
    )
  }, [storeId])
}
