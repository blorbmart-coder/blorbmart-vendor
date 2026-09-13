import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { db } from '../lib/db'
import { auth } from '../lib/firebase'
import { asString } from '../lib/format'
import type { University } from '../services/universities'
import { menuRepo } from './menuRepo'
import { BUSINESS, blankStore, storeFromDoc, storeToFirestore, type BusinessType, type StoreProfile } from './models'

interface StoreSnapshot {
  store: StoreProfile | null
  loading: boolean
  /**
   * Whether the store has actually been read: found, or confirmed by the
   * server not to exist. Until then a null store means "not loaded yet", not
   * "this vendor has no store", and nothing should route on it.
   */
  known: boolean
}

/* ─────────────────────────────────────────────────────────────────────────
   The vendor's own store, held for the life of the session, because every
   screen needs the store id and business type and re-reading it per screen
   would be both slow and a needless cost.

   Onboarding SAVES AT EVERY STEP through this. A vendor filling it in on a
   bus with bad signal must never lose what they already typed.
   ───────────────────────────────────────────────────────────────────────── */
class StoreRepo {
  private snap: StoreSnapshot = { store: null, loading: false, known: false }
  private unsub: Unsubscribe | null = null
  private readonly listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.snap

  get store() {
    return this.snap.store
  }

  get known() {
    return this.snap.known
  }

  get needsOnboarding() {
    return this.snap.store == null || !this.snap.store.onboardingComplete
  }

  private set(next: Partial<StoreSnapshot>) {
    this.snap = { ...this.snap, ...next }
    this.listeners.forEach((fn) => fn())
  }

  /**
   * Loads the store and keeps listening, so a change made on another device
   * lands here without a refresh.
   *
   * Resolves once the store is known. An empty answer served from cache is
   * not taken as final — only the server can say a store does not exist —
   * so callers should put a timeout on this and treat a still-unknown store
   * as unknown rather than missing.
   */
  start(): Promise<void> {
    const uid = auth.currentUser?.uid
    if (!uid) return Promise.resolve()

    this.unsub?.()
    this.set({ loading: true, known: false })

    return new Promise((settle) => {
      let settled = false
      const done = () => {
        if (!settled) {
          settled = true
          settle()
        }
      }
      this.unsub = onSnapshot(
        query(collection(db, 'stores'), where('vendorId', '==', uid), limit(1)),
        { includeMetadataChanges: true },
        (snap) => {
          const first = snap.docs[0]
          const store = first ? storeFromDoc(first.id, first.data()) : null
          if (first || !snap.metadata.fromCache) {
            this.set({ store, known: true, loading: false })
            done()
          } else {
            this.set({ store })
          }
        },
        (error) => {
          console.warn('StoreRepo: stream failed', error.code)
          this.set({ loading: false })
          done()
        },
      )
    })
  }

  /** Forgets the store on sign-out, so the next account never sees it. */
  stop() {
    this.unsub?.()
    this.unsub = null
    this.set({ store: null, loading: false, known: false })
  }

  /**
   * Creates the store document if this vendor has none — adopting a legacy
   * one written by the older signup rather than creating a duplicate.
   */
  async ensureStore(businessName: string, type: BusinessType = 'restaurant'): Promise<StoreProfile> {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Not signed in')

    const existing = await getDocs(query(collection(db, 'stores'), where('vendorId', '==', uid), limit(1)))
    if (!existing.empty) {
      const store = storeFromDoc(existing.docs[0].id, existing.docs[0].data())
      this.set({ store, known: true })
      return store
    }

    // The campus was chosen at signup and lives on the vendor document. A store
    // created without it could not list a single product: the rules refuse
    // any product that carries no campus.
    const vendor = (await getDoc(doc(db, 'vendors', uid))).data() ?? {}
    const ref = doc(collection(db, 'stores'))
    const store: StoreProfile = {
      ...blankStore,
      id: ref.id,
      vendorId: uid,
      name: businessName,
      type,
      universityId: asString(vendor.universityId),
      universityName: asString(vendor.universityName),
      isActive: false,
    }
    await setDoc(ref, {
      ...storeToFirestore(store),
      rating: 0,
      ratingCount: 0,
      totalOrders: 0,
      followersCount: 0,
      createdAt: serverTimestamp(),
    })
    this.set({ store, known: true })
    return store
  }

  /**
   * Writes a partial update, merging it into the cached copy first so the UI
   * never waits on a round trip to show what was just typed.
   */
  async patch(fields: DocumentData, optimistic?: StoreProfile) {
    const id = this.snap.store?.id
    if (!id) return
    if (optimistic) this.set({ store: optimistic })
    await setDoc(doc(db, 'stores', id), { ...fields, updatedAt: serverTimestamp() }, { merge: true })
  }

  /**
   * Moves the store to another campus, and every product with it. A store
   * that moved while its menu stayed behind would be invisible on the new
   * campus and still listed on the old one.
   */
  async setCampus(campus: University) {
    const store = this.snap.store
    if (!store) throw new Error('No store to update')
    if (store.universityId === campus.id) return

    const updated = { ...store, universityId: campus.id, universityName: campus.name }
    await this.patch({ universityId: campus.id, universityName: campus.name }, updated)
    await menuRepo.reindexAll(updated)
  }

  /** Saves one onboarding step, with the step number, so resuming is exact. */
  async saveStep(step: number, updated: StoreProfile) {
    const next = { ...updated, onboardingStep: step }
    await this.patch({ ...storeToFirestore(next), onboardingStep: step }, next)
  }

  /** Finishes onboarding and puts the store live on the buyer app. */
  async completeOnboarding(finished: StoreProfile) {
    const live: StoreProfile = {
      ...finished,
      onboardingComplete: true,
      onboardingStep: 99,
      isActive: true,
      isOpen: true,
    }
    await this.patch(
      { ...storeToFirestore(live), onboardingComplete: true, isActive: true, goLiveAt: serverTimestamp() },
      live,
    )

    // Mirror the business type onto the vendor document so reporting and
    // admin tooling can group by vertical without joining stores.
    const uid = auth.currentUser?.uid
    if (uid) {
      try {
        await setDoc(
          doc(db, 'vendors', uid),
          {
            vertical: BUSINESS[live.type].id,
            businessName: live.name,
            businessPhone: live.phone,
            address: live.address,
            storeId: live.id,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch (error) {
        console.warn('StoreRepo: vendor mirror failed', error)
      }
    }
  }

  /**
   * The open/closed switch. Instant, because a vendor flipping it has
   * usually just run out of gas and needs orders to stop now.
   */
  async setOpen(open: boolean) {
    const current = this.snap.store
    if (!current) return
    await this.patch({ isOpen: open }, { ...current, isOpen: open })
  }
}

export const storeRepo = new StoreRepo()

export const useStoreState = () => useSyncExternalStore(storeRepo.subscribe, storeRepo.getSnapshot)
export const useStore = () => useStoreState().store
