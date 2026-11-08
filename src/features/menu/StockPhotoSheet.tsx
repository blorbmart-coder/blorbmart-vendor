import { useEffect, useMemo, useState } from 'react'
import { BlorbImage } from '../../components/BlorbImage'
import { Icon } from '../../components/Icon'
import { showSheet } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { Empty } from '../../components/ui'
import { http } from '../../lib/http'

export interface StockPhoto {
  id: string
  title: string
  category: string
  tags: string[]
  url: string
}

let cache: StockPhoto[] | null = null

/** The Blorbmart stock food photos (admin → Stock food photos). Public, cached per session. */
export async function stockPhotos(): Promise<StockPhoto[]> {
  if (cache) return cache
  const res = await http('/api/stock-images', { timeoutMs: 20_000 })
  const data = res.body.data
  if (!res.ok || !Array.isArray(data)) throw new Error('Could not load Blorbmart photos.')
  cache = data
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      id: String(row.id ?? ''),
      title: String(row.title ?? ''),
      category: String(row.category ?? ''),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      url: String(row.url ?? ''),
    }))
    .filter((row) => row.id && row.url.startsWith('https://'))
  return cache
}

/**
 * Lets a vendor without a photo of their own pick one of Blorbmart's. Resolves
 * the chosen photo, or undefined when dismissed. `hint` (the dish name typed
 * so far) seeds the search, so "Jollof rice" opens on jollof pictures.
 */
export function showStockPhotoSheet(hint = '') {
  return showSheet<StockPhoto>((close) => <StockPhotoSheet hint={hint} onDone={close} />)
}

function StockPhotoSheet({ hint, onDone }: { hint: string; onDone: (photo?: StockPhoto) => void }) {
  const [list, setList] = useState<StockPhoto[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    stockPhotos()
      .then((rows) => live && setList(rows))
      .catch(() => live && setError('Could not load Blorbmart photos. Check your connection.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  const shown = useMemo(() => {
    const haystack = (p: StockPhoto) => `${p.title} ${p.category} ${p.tags.join(' ')}`.toLowerCase()
    const q = query.trim().toLowerCase()
    if (q) return list.filter((p) => haystack(p).includes(q))
    // No search typed: photos matching the dish name come first.
    const hints = words(hint)
    if (!hints.length) return list
    const score = (p: StockPhoto) => hints.filter((w) => haystack(p).includes(w)).length
    return [...list].sort((a, b) => score(b) - score(a))
  }, [list, query, hint])

  return (
    <div className="scroll-y pb-safe min-h-0 flex-1">
      <div className="px-5 pb-4">
        <h2 className="t-h3">Blorbmart photos</h2>
        <p className="t-caption-sm mt-1.5">
          No photo of your own yet? Use one of ours. Pick the one that looks most like what you serve — you can swap
          in your own photo any time.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-sunken px-3">
          <Icon name="round/search" size={20} color="var(--color-ink-faint)" />
          <input
            aria-label="Search photos"
            placeholder="Search: jollof, shawarma, drinks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="t-body h-11 min-w-0 flex-1 bg-transparent text-ink outline-none"
          />
        </div>
        <div className="h-4" />
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : error ? (
          <Empty icon="outlined/image" title="Photos not loaded" message={error} />
        ) : shown.length === 0 ? (
          <Empty icon="round/search_off" title="No photo matches" message="Try another word, or upload your own photo." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => onDone(photo)}
                className="press overflow-hidden rounded-[14px] bg-sunken text-left"
              >
                <div className="aspect-[4/3] w-full">
                  <BlorbImage url={photo.url} radius={0} decodeWidth={320} />
                </div>
                <p className="t-caption-sm truncate px-2.5 py-2 font-bold text-ink">{photo.title}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
