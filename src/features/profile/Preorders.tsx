import { useEffect, useState } from 'react'
import { AppBar, BottomBar, Page, PageBody } from '../../components/AppBar'
import { BlorbButton, TextButton } from '../../components/Button'
import { VendorField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { FadeSlideIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { showDatePicker, showTimePicker } from '../../components/pickers'
import { Spinner } from '../../components/Spinner'
import { Switch } from '../../components/Switch'
import { haptic } from '../../lib/haptics'
import { dataOf, errorText, http, messageOf } from '../../lib/http'

/* ─────────────────────────────────────────────────────────────────────────
   Pre-orders — the store's pre-order window (backend preorderService).

   A vendor picks the days they cook pre-orders: every week on chosen days,
   on one-off dates (a Christmas rice day), or both. Customers order and pay
   until the cutoff, and the order reaches the kitchen on the morning of the
   day. The money lands like any other order's: only once it is delivered.
   ───────────────────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CUTOFFS = [
  { hours: 0, label: 'Up to cooking time' },
  { hours: 3, label: '3 hours before' },
  { hours: 12, label: '12 hours before' },
  { hours: 24, label: 'The day before' },
  { hours: 48, label: 'Two days before' },
]

interface Config {
  enabled: boolean
  fulfillmentDays: string[]
  specificDates: string[]
  fulfillmentTime: string
  cutoffHoursBefore: number
  maxOrdersPerDay: number | null
  allowAsapWhenOpen: boolean
}

interface Upcoming {
  date: string
  label: string
  cutoffLabel: string
  ordersRemaining: number | null
}

const asConfig = (raw: Record<string, unknown> | undefined): Config => ({
  enabled: Boolean(raw?.enabled),
  fulfillmentDays: Array.isArray(raw?.fulfillmentDays) ? raw.fulfillmentDays.map(String) : [],
  specificDates: Array.isArray(raw?.specificDates) ? raw.specificDates.map(String) : [],
  fulfillmentTime: typeof raw?.fulfillmentTime === 'string' ? raw.fulfillmentTime : '12:00',
  cutoffHoursBefore: Number.isFinite(Number(raw?.cutoffHoursBefore)) ? Number(raw?.cutoffHoursBefore) : 24,
  maxOrdersPerDay: raw?.maxOrdersPerDay == null ? null : Number(raw.maxOrdersPerDay) || null,
  // A store with no settings yet keeps taking normal orders while open.
  allowAsapWhenOpen: raw?.allowAsapWhenOpen === undefined ? true : Boolean(raw.allowAsapWhenOpen),
})

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const dateText = (key: string) =>
  fromKey(key).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })

const timeText = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function PreordersScreen() {
  const [config, setConfig] = useState<Config | null>(null)
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [capText, setCapText] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    setLoadError(null)
    try {
      const res = await http('/api/stores/me/preorder', { auth: true, timeoutMs: 90_000 })
      if (!res.ok) throw new Error(messageOf(res, 'Could not load your pre-order settings.'))
      const data = dataOf(res)
      const next = asConfig(data.preorderConfig as Record<string, unknown> | undefined)
      setConfig(next)
      setCapText(next.maxOrdersPerDay ? String(next.maxOrdersPerDay) : '')
      setUpcoming(Array.isArray(data.upcoming) ? (data.upcoming as Upcoming[]) : [])
      setDirty(false)
    } catch (e) {
      setLoadError(errorText(e, 'Could not load your pre-order settings.'))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const change = (patch: Partial<Config>) => {
    if (!config) return
    setConfig({ ...config, ...patch })
    setDirty(true)
  }

  const toggleDay = (day: string) => {
    if (!config) return
    haptic.selection()
    const on = config.fulfillmentDays.includes(day)
    change({ fulfillmentDays: on ? config.fulfillmentDays.filter((d) => d !== day) : [...config.fulfillmentDays, day] })
  }

  const addDate = async () => {
    if (!config) return
    const today = new Date()
    const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 89)
    const picked = await showDatePicker({ initial: today, first: today, last })
    if (!picked) return
    const key = dateKey(picked)
    if (config.specificDates.includes(key)) return
    change({ specificDates: [...config.specificDates, key].sort() })
  }

  const pickTime = async () => {
    if (!config) return
    const [hour, minute] = config.fulfillmentTime.split(':').map(Number)
    const picked = await showTimePicker({ hour, minute })
    if (!picked) return
    change({ fulfillmentTime: `${String(picked.hour).padStart(2, '0')}:${String(picked.minute).padStart(2, '0')}` })
  }

  const save = async () => {
    if (!config) return
    if (config.enabled && !config.fulfillmentDays.length && !config.specificDates.length) {
      toast('Pick at least one day: a weekday or a date.')
      return
    }
    setSaving(true)
    try {
      const cap = capText.trim() ? Math.max(1, Number(capText)) : null
      const res = await http('/api/stores/me/preorder', {
        method: 'PUT',
        auth: true,
        timeoutMs: 90_000,
        body: { ...config, maxOrdersPerDay: cap },
      })
      if (!res.ok) throw new Error(messageOf(res, 'Could not save. Try again.'))
      haptic.heavy()
      toast(config.enabled ? 'Pre-orders saved. Customers can order now.' : 'Pre-orders are off.', { tone: 'success' })
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not save. Try again.'), { tone: 'danger' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <AppBar title="Pre-orders" />
      <PageBody>
        {!config ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            {loadError ? (
              <>
                <p className="t-body">{loadError}</p>
                <TextButton onClick={() => void load()}>Try again</TextButton>
              </>
            ) : (
              <Spinner />
            )}
          </div>
        ) : (
          <div className="px-5 pb-8 pt-2">
            <FadeSlideIn>
              <div className="flex items-center rounded-[14px] border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="t-h4">Take pre-orders</p>
                  <p className="t-caption-sm mt-1">
                    Customers order and pay ahead for the days you cook. You are paid once each order is delivered.
                  </p>
                </div>
                <div className="ml-3">
                  <Switch checked={config.enabled} onChange={(v) => change({ enabled: v })} label="Take pre-orders" />
                </div>
              </div>
            </FadeSlideIn>

            {config.enabled && (
              <FadeSlideIn>
                <h3 className="t-h3 mt-7">Every week on</h3>
                <p className="t-body-sm mt-1">Leave these empty if you only cook on particular dates.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const on = config.fulfillmentDays.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleDay(day)}
                        className="press t-label h-10 rounded-full border px-4"
                        style={{
                          background: on ? 'var(--color-brand)' : 'var(--color-surface)',
                          color: on ? '#fff' : 'var(--color-ink-body)',
                          borderColor: on ? 'var(--color-brand)' : 'var(--color-line)',
                        }}
                      >
                        {day.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>

                <h3 className="t-h3 mt-7">On these dates</h3>
                <p className="t-body-sm mt-1">One-off days, like a festive special. Up to three months ahead.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {config.specificDates.map((key) => (
                    <span key={key} className="t-label inline-flex h-10 items-center gap-1 rounded-full bg-brand-soft pl-4 pr-1.5 text-brand-ink">
                      {dateText(key)}
                      <button
                        type="button"
                        aria-label={`Remove ${dateText(key)}`}
                        className="press grid h-7 w-7 place-items-center rounded-full"
                        onClick={() => change({ specificDates: config.specificDates.filter((d) => d !== key) })}
                      >
                        <Icon name="round/close" size={16} color="var(--color-brand-ink)" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => void addDate()}
                    className="press t-label inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-ink-body"
                  >
                    <Icon name="round/add" size={18} color="var(--color-ink-muted)" />
                    Add a date
                  </button>
                </div>

                <h3 className="t-h3 mt-7">Ready by</h3>
                <button
                  type="button"
                  onClick={() => void pickTime()}
                  className="press mt-3 flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface p-4 text-left"
                >
                  <Icon name="round/schedule" size={20} color="var(--color-brand)" />
                  <span className="t-h4 flex-1">{timeText(config.fulfillmentTime)}</span>
                  <span className="t-label text-brand">Change</span>
                </button>
                <p className="t-caption-sm mt-2">
                  The order reaches your Orders tab early that morning, and riders deliver from this time.
                </p>

                <h3 className="t-h3 mt-7">Last orders</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CUTOFFS.map((c) => {
                    const on = config.cutoffHoursBefore === c.hours
                    return (
                      <button
                        key={c.hours}
                        type="button"
                        aria-pressed={on}
                        onClick={() => change({ cutoffHoursBefore: c.hours })}
                        className="press t-label h-10 rounded-full border px-4"
                        style={{
                          background: on ? 'var(--color-ink)' : 'var(--color-surface)',
                          color: on ? '#fff' : 'var(--color-ink-body)',
                          borderColor: on ? 'var(--color-ink)' : 'var(--color-line)',
                        }}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-7">
                  <VendorField
                    value={capText}
                    onChange={(v) => {
                      setCapText(v)
                      setDirty(true)
                    }}
                    label="Most orders per day (optional)"
                    hint="No limit"
                    inputMode="numeric"
                    digits
                    maxLength={4}
                    helper="Stops taking pre-orders for a day once it is full."
                  />
                </div>

                <div className="mt-7 flex items-center rounded-[14px] border border-line bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <p className="t-h4">Also take normal orders</p>
                    <p className="t-caption-sm mt-1">
                      Off means customers can only pre-order from you, even while you are open.
                    </p>
                  </div>
                  <div className="ml-3">
                    <Switch
                      checked={config.allowAsapWhenOpen}
                      onChange={(v) => change({ allowAsapWhenOpen: v })}
                      label="Also take normal orders"
                    />
                  </div>
                </div>

                {upcoming.length > 0 && !dirty && (
                  <div className="mt-7 rounded-[14px] bg-sunken p-4">
                    <p className="t-h4">What customers can choose now</p>
                    <ul className="mt-2 space-y-1.5">
                      {upcoming.map((u) => (
                        <li key={u.date} className="t-body-sm flex gap-2">
                          <Icon name="round/event" size={17} color="var(--color-ink-muted)" />
                          <span className="flex-1">
                            {u.label} · order by {u.cutoffLabel}
                            {u.ordersRemaining != null ? ` · ${u.ordersRemaining} left` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </FadeSlideIn>
            )}
          </div>
        )}
      </PageBody>
      {config && (
        <BottomBar>
          <BlorbButton label="Save" busy={saving} glow onClick={dirty ? () => void save() : null} />
        </BottomBar>
      )}
    </Page>
  )
}
