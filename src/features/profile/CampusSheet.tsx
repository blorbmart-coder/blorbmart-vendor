import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { showSheet } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { Empty } from '../../components/ui'
import { storeRepo, useStore } from '../../data/storeRepo'
import { campuses, type University } from '../../services/universities'

/** Opens the campus picker. Resolves true when the campus changed. */
export function showCampusSheet() {
  return showSheet<boolean>((close) => <CampusSheet onDone={close} />)
}

/**
 * Which campus this store trades on. Changing it re-stamps the whole menu,
 * which can take a moment on a large catalogue — hence an explicit saving
 * state rather than an optimistic close that hides a half-finished move.
 */
function CampusSheet({ onDone }: { onDone: (changed?: boolean) => void }) {
  const current = useStore()?.universityId ?? ''
  const [list, setList] = useState<University[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    campuses()
      .then((l) => live && setList(l))
      .catch(() => live && setError('Could not load the campus list. Check your connection.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const choose = async (campus: University) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await storeRepo.setCampus(campus)
      onDone(true)
    } catch {
      setSaving(false)
      setError('Could not move your store. Try again.')
    }
  }

  return (
    <div className="scroll-y pb-safe min-h-0 flex-1">
      <div className="px-5 pb-2">
        <h2 className="t-h3">Campus</h2>
        <p className="t-caption-sm mt-1.5">
          Students on this campus are the ones who see your shop. Changing it moves your whole menu with you.
        </p>
        <div className="h-5" />
        {loading ? (
          <div className="flex justify-center py-5">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <Empty
            icon="outlined/school"
            title="No campuses loaded"
            message={error ?? 'Check your connection and try again.'}
          />
        ) : (
          <div className="space-y-2">
            {list.map((campus) => {
              const selected = campus.id === current
              return (
                <button
                  key={campus.id}
                  type="button"
                  disabled={saving}
                  aria-pressed={selected}
                  onClick={() => void choose(campus)}
                  className="ink flex w-full items-center gap-3 rounded-[14px] p-3 text-left"
                  style={{ background: selected ? 'var(--color-brand-soft)' : 'var(--color-sunken)' }}
                >
                  <Icon
                    name="outlined/school"
                    size={20}
                    color={selected ? 'var(--color-brand)' : 'var(--color-ink-faint)'}
                  />
                  <span className="t-body flex-1 font-bold text-ink">{campus.label}</span>
                  {selected && <Icon name="round/check_circle" size={20} color="var(--color-brand)" />}
                </button>
              )
            })}
          </div>
        )}
        {saving && (
          <div className="mt-3 flex items-center gap-3">
            <Spinner size={16} stroke={2} />
            <span className="t-caption-sm">Moving your menu…</span>
          </div>
        )}
        {error && list.length > 0 && <p className="t-caption-sm mt-2 text-danger">{error}</p>}
      </div>
    </div>
  )
}
