import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { auth } from '../lib/firebase'

/** Where a vendor account stands with the platform. */
export type VendorApproval = 'pending' | 'active' | 'suspended' | 'rejected' | 'unknown'

function parse(raw: string): VendorApproval {
  switch (raw.trim().toLowerCase()) {
    case 'active':
    case 'verified':
      return 'active'
    case 'suspended':
      return 'suspended'
    case 'rejected':
      return 'rejected'
    case 'pending':
      return 'pending'
    default:
      return 'unknown'
  }
}

interface StatusSnapshot {
  status: VendorApproval
  /** Why the account was suspended or rejected, when an admin gave one. */
  reason: string | null
  loading: boolean
}

/**
 * The approval state on `vendors/{uid}`.
 *
 * Every seller endpoint answers 403 until an admin approves the account, so
 * this has to be known before the dashboard is worth showing. It is a live
 * subscription, so an approval that lands while the vendor is sitting on the
 * waiting screen moves them straight through.
 */
class StatusRepo {
  private snap: StatusSnapshot = { status: 'unknown', reason: null, loading: true }
  private unsub: Unsubscribe | null = null
  private readonly listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.snap

  get isApproved() {
    return this.snap.status === 'active'
  }

  private set(next: StatusSnapshot) {
    this.snap = next
    this.listeners.forEach((fn) => fn())
  }

  /** Resolves on the first snapshot — never later than six seconds. */
  start(): Promise<void> {
    const uid = auth.currentUser?.uid
    if (!uid) {
      this.set({ status: 'unknown', reason: null, loading: false })
      return Promise.resolve()
    }

    this.unsub?.()
    return new Promise((settle) => {
      let settled = false
      const done = () => {
        if (!settled) {
          settled = true
          settle()
        }
      }
      const timer = window.setTimeout(() => {
        this.set({ ...this.snap, loading: false })
        done()
      }, 6000)

      this.unsub = onSnapshot(
        doc(db, 'vendors', uid),
        (snap) => {
          const data = snap.data() ?? {}
          const raw = String(data.status ?? data.vendorStatus ?? '')
          const reason = typeof data.statusReason === 'string' ? data.statusReason.trim() : ''
          // A vendor document with no status is not treated as approved —
          // the backend gate makes the same call.
          this.set({ status: snap.exists() ? parse(raw) : 'unknown', reason: reason || null, loading: false })
          window.clearTimeout(timer)
          done()
        },
        (error) => {
          console.warn('StatusRepo: stream failed', error.code)
          this.set({ ...this.snap, loading: false })
          window.clearTimeout(timer)
          done()
        },
      )
    })
  }

  stop() {
    this.unsub?.()
    this.unsub = null
    this.set({ status: 'unknown', reason: null, loading: true })
  }
}

export const statusRepo = new StatusRepo()

export const useVendorStatus = () => useSyncExternalStore(statusRepo.subscribe, statusRepo.getSnapshot)
