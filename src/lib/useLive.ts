import { onSnapshot, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'

export type LiveDocs = QueryDocumentSnapshot<DocumentData>[]

/**
 * A live Firestore query — StreamBuilder over `.snapshots()`.
 *
 * `docs` is null until the first answer lands (ConnectionState.waiting).
 * Pass a memoised query: a new query object per render would reopen the
 * listener on every render.
 */
export function useLiveDocs(q: Query<DocumentData> | null): { docs: LiveDocs | null; error: boolean } {
  const [state, setState] = useState<{ q: Query<DocumentData> | null; docs: LiveDocs | null; error: boolean }>({
    q,
    docs: null,
    error: false,
  })

  useEffect(() => {
    if (!q) return
    return onSnapshot(
      q,
      (snap) => setState({ q, docs: snap.docs, error: false }),
      (error) => {
        console.warn('live query failed', error.code)
        setState((s) => ({ q, docs: s.q === q ? s.docs : null, error: true }))
      },
    )
  }, [q])

  // A result for a previous query is not a result for this one.
  return state.q === q ? { docs: state.docs, error: state.error } : { docs: null, error: false }
}
