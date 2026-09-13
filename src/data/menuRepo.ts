import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/db'
import {
  creationFields,
  productFromDoc,
  productToFirestore,
  type ProductDraft,
  type StoreProfile,
} from './models'

const byStore = (storeId: string) =>
  query(collection(db, 'products'), where('storeId', '==', storeId), limit(400))

/* ─────────────────────────────────────────────────────────────────────────
   The vendor's catalogue.

   Every write goes through save(), the single place that produces a
   `products` document. The buyer app's search depends on `searchKeywords`,
   and one code path that forgot to write it would create items that exist
   but cannot be found.
   ───────────────────────────────────────────────────────────────────────── */
export const menuRepo = {
  /** Live catalogue, sorted by name. Returns the unsubscribe function. */
  watch(storeId: string, onData: (items: ProductDraft[]) => void, onError: () => void) {
    return onSnapshot(
      byStore(storeId),
      (snap) => {
        const items = snap.docs.map((d) => productFromDoc(d.id, d.data()))
        items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        onData(items)
      },
      (error) => {
        console.warn('menu watch failed', error.code)
        onError()
      },
    )
  },

  async list(storeId: string): Promise<ProductDraft[]> {
    try {
      const snap = await getDocs(byStore(storeId))
      return snap.docs.map((d) => productFromDoc(d.id, d.data()))
    } catch (error) {
      console.warn('menu list failed', error)
      return []
    }
  },

  /** One product, for an editor opened from a link rather than the menu. */
  async get(productId: string): Promise<ProductDraft | null> {
    const snap = await getDoc(doc(db, 'products', productId))
    return snap.exists() ? productFromDoc(snap.id, snap.data()) : null
  },

  /**
   * Creates or updates. Creation fields (sales counters, rating) are written
   * only on insert, so editing a dish never wipes its history.
   */
  async save(draft: ProductDraft, store: StoreProfile): Promise<string> {
    const data = productToFirestore(draft, store)
    if (!draft.id) {
      const ref = doc(collection(db, 'products'))
      await setDoc(ref, { ...data, ...creationFields() })
      return ref.id
    }
    await setDoc(doc(db, 'products', draft.id), data, { merge: true })
    return draft.id
  },

  /**
   * Flips availability without opening the editor — the action a vendor
   * takes most often, usually because something just ran out.
   */
  async setAvailable(productId: string, available: boolean) {
    await updateDoc(doc(db, 'products', productId), {
      isAvailable: available,
      status: available ? 'active' : 'inactive',
      updatedAt: serverTimestamp(),
    })
  },

  async remove(productId: string) {
    await deleteDoc(doc(db, 'products', productId))
  },

  /**
   * Re-saves every product so the search index and the denormalised store
   * fields are rebuilt — after a rename, a campus move, or to backfill items
   * made before the index existed. Batched: Firestore caps a batch at 500.
   */
  async reindexAll(store: StoreProfile): Promise<number> {
    const products = await this.list(store.id)
    let written = 0
    for (let i = 0; i < products.length; i += 400) {
      const batch = writeBatch(db)
      for (const product of products.slice(i, i + 400)) {
        batch.set(doc(db, 'products', product.id), productToFirestore(product, store), { merge: true })
        written++
      }
      await batch.commit()
    }
    return written
  },

  /** Sections already in use, offered alongside the suggestions. */
  async sectionsInUse(storeId: string): Promise<string[]> {
    const products = await this.list(storeId)
    return [...new Set(products.map((p) => p.section.trim()).filter(Boolean))].sort()
  },
}
