import { dataOf, http, TimeoutError } from '../lib/http'
import { isRecord } from '../lib/format'

/** One campus, as served by the backend registry. */
export interface University {
  id: string
  name: string
  shortName: string
  state: string | null
  city: string | null
  billsOnly: boolean
  /** "University of Osun (UNIOSUN)", or just the name. */
  label: string
}

function fromMap(m: Record<string, unknown>): University {
  const name = String(m.name ?? '')
  const shortName = String(m.shortName ?? '')
  return {
    id: String(m.id ?? ''),
    name,
    shortName,
    state: m.state == null ? null : String(m.state),
    city: m.city == null ? null : String(m.city),
    billsOnly: m.billsOnly === true,
    label: !shortName || shortName === name ? name : `${name} (${shortName})`,
  }
}

let cache: University[] | null = null

/**
 * Real campuses only, from the backend registry the buyer and rider apps
 * share — so a renamed campus never drifts out of step here.
 *
 * The bills-only entry is left out: it means "I have no campus", which a
 * buyer can say and a shop that physically stands somewhere cannot. The
 * backend rejects it on this field too.
 */
export async function campuses(refresh = false): Promise<University[]> {
  if (!refresh && cache) return cache
  // Sixty seconds and one quiet retry, not the Flutter app's twenty: this is
  // usually the first call a new vendor's browser makes, it often lands on a
  // Render instance that is still waking up, and a campus list that never
  // arrives is a sign-up that can never be finished.
  const fetchList = () => http('/api/universities', { timeoutMs: 60_000 })
  const res = await fetchList().catch((error: unknown) => {
    if (error instanceof TimeoutError) return fetchList()
    throw error
  })
  if (res.status !== 200) throw new Error('Could not load the campus list.')
  const list = dataOf(res).universities
  cache = (Array.isArray(list) ? list : [])
    .filter(isRecord)
    .map(fromMap)
    .filter((u) => u.id && !u.billsOnly)
  return cache
}

export function cachedCampus(id: string | null | undefined): University | null {
  if (!id) return null
  return cache?.find((u) => u.id === id) ?? null
}
