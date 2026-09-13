import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useLayer, useNav } from '../../app/stack'
import { AppBar, Page, PageBody } from '../../components/AppBar'
import { BlorbImage } from '../../components/BlorbImage'
import { BlorbButton, IconBtn, TextButton } from '../../components/Button'
import { useValidation, VendorField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { toast } from '../../components/overlay'
import { showDatePicker, showTimePicker } from '../../components/pickers'
import { CenterSpinner, Spinner } from '../../components/Spinner'
import { Empty, Pill, SectionHeader } from '../../components/ui'
import {
  blankEvent,
  eventBlockers,
  eventIsNew,
  eventIsPublished,
  tierIsFree,
  type EventTier,
  type VendorEvent,
} from '../../data/eventModels'
import { useStore } from '../../data/storeRepo'
import { pickImages, prepareImage, uploadImage, UploadError } from '../../lib/cloudinary'
import { dayAndTime, money } from '../../lib/format'
import { EventsError, myEvents, saveEvent, setEventStatus } from '../../services/events'
import { showTierEditor } from './TierEditor'

const CATEGORIES: Array<[string, string]> = [
  ['music', 'Music'],
  ['party', 'Party'],
  ['conference', 'Conference'],
  ['sports', 'Sports'],
  ['faith', 'Faith'],
  ['comedy', 'Comedy'],
  ['theatre', 'Theatre'],
  ['general', 'Other'],
]

const DAY = 86_400_000

/** Opens the editor for a new event, or an existing one passed or linked. */
export default function EventEditorScreen() {
  const { eventId } = useParams()
  const layer = useLayer<{ event?: VendorEvent }>()
  const [event, setEvent] = useState<VendorEvent | null | undefined>(
    layer.data?.event ?? (eventId ? undefined : blankEvent),
  )

  useEffect(() => {
    if (event !== undefined || !eventId) return
    myEvents()
      .then((list) => setEvent(list.find((e) => e.id === eventId) ?? null))
      .catch(() => setEvent(null))
  }, [event, eventId])

  if (event === undefined) {
    return (
      <Page>
        <AppBar title="Edit event" />
        <CenterSpinner />
      </Page>
    )
  }
  if (event === null) {
    return (
      <Page>
        <AppBar title="Edit event" />
        <Empty title="Not found" message="That event is no longer on your list." icon="round/search_off" />
      </Page>
    )
  }
  return <Editor initial={event} />
}

/**
 * Saves as a draft freely; publishing is the deliberate act, gated on a
 * checklist the organizer can see the whole time.
 */
function Editor({ initial }: { initial: VendorEvent }) {
  const nav = useNav()
  const store = useStore()
  const [draft, setDraft] = useState<VendorEvent>(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const form = useValidation<'title'>()
  const blockers = eventBlockers(draft)
  const canPublish = blockers.length === 0
  const set = (patch: Partial<VendorEvent>) => setDraft((d) => ({ ...d, ...patch }))

  const pickCover = () => {
    void pickImages().then(async ([file]) => {
      if (!file) return
      setUploading(true)
      try {
        const url = await uploadImage(await prepareImage(file, 1600, 0.85), 'events/covers')
        set({ coverUrl: url })
      } catch (e) {
        toast(e instanceof UploadError ? e.message : 'Could not open your photos.', { tone: 'danger' })
      } finally {
        setUploading(false)
      }
    })
  }

  const pickStart = async () => {
    const now = new Date()
    const initialDate = draft.startsAt ?? new Date(now.getTime() + 7 * DAY)
    const date = await showDatePicker({
      initial: initialDate < now ? now : initialDate,
      first: new Date(now.getTime() - DAY),
      last: new Date(now.getTime() + 730 * DAY),
    })
    if (!date) return
    const time = await showTimePicker({ hour: initialDate.getHours(), minute: initialDate.getMinutes() })
    const starts = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time?.hour ?? 19, time?.minute ?? 0)
    // An end time that now sits before the start is worse than none.
    setDraft((d) => ({ ...d, startsAt: starts, endsAt: d.endsAt && d.endsAt > starts ? d.endsAt : null }))
  }

  const pickEnd = async () => {
    const start = draft.startsAt
    if (!start) {
      toast('Set the start time first.')
      return
    }
    const initialDate = draft.endsAt ?? new Date(start.getTime() + 4 * 3_600_000)
    const date = await showDatePicker({ initial: initialDate, first: start, last: new Date(start.getTime() + 30 * DAY) })
    if (!date) return
    const time = await showTimePicker({ hour: initialDate.getHours(), minute: initialDate.getMinutes() })
    const ends = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time?.hour ?? 23, time?.minute ?? 0)
    if (ends <= start) {
      toast('The end has to be after the start.', { tone: 'danger' })
      return
    }
    set({ endsAt: ends })
  }

  const editTier = async (tier?: EventTier) => {
    const result = await showTierEditor(tier)
    if (!result) return
    setDraft((d) => {
      const index = d.tiers.findIndex((t) => t.id === result.id)
      return { ...d, tiers: index === -1 ? [...d.tiers, result] : d.tiers.map((t, i) => (i === index ? result : t)) }
    })
  }

  const removeTier = (tier: EventTier) => {
    if (tier.sold > 0) {
      toast(`${tier.sold} of those are already sold. Close sales instead of deleting it.`, { tone: 'danger' })
      return
    }
    setDraft((d) => ({ ...d, tiers: d.tiers.filter((t) => t.id !== tier.id) }))
  }

  const save = async (publish: boolean) => {
    if (!form.validate({ title: draft.title.trim().length < 3 ? 'Give the event a name' : null })) return
    let event = draft
    if (publish) {
      if (!canPublish) {
        toast(`Still needed: ${blockers.join(', ')}.`, { tone: 'danger' })
        return
      }
      event = { ...event, status: 'published' }
    } else if (!event.status) {
      event = { ...event, status: 'draft' }
    }

    setSaving(true)
    try {
      await saveEvent(event, store?.id, store?.name)
      toast(publish ? 'Event is on sale.' : 'Saved as a draft.', { tone: 'success' })
      nav.pop(true)
    } catch (e) {
      setSaving(false)
      toast(e instanceof EventsError ? e.message : 'Could not save that event.', { tone: 'danger' })
    }
  }

  const unpublish = async () => {
    setSaving(true)
    try {
      await setEventStatus(draft.id, 'draft')
      toast('Sales closed. The event is a draft again.')
      nav.pop(true)
    } catch (e) {
      setSaving(false)
      toast(e instanceof EventsError ? e.message : 'Could not update that event.', { tone: 'danger' })
    }
  }

  return (
    <Page>
      <AppBar
        title={eventIsNew(initial) ? 'New event' : 'Edit event'}
        actions={
          <>
            {!eventIsNew(initial) && eventIsPublished(initial) && (
              <TextButton onClick={saving ? null : () => void unpublish()}>Close sales</TextButton>
            )}
            <span className="w-2" />
          </>
        }
      />
      <PageBody>
        <form className="px-5 pb-[160px] pt-4" noValidate onSubmit={(e) => e.preventDefault()}>
          <button
            type="button"
            disabled={uploading}
            onClick={pickCover}
            aria-label={draft.coverUrl ? 'Change cover photo' : 'Add a cover photo'}
            className="ink relative block aspect-video w-full overflow-hidden rounded-[14px] border border-line bg-events-soft"
          >
            {draft.coverUrl && <BlorbImage url={draft.coverUrl} decodeWidth={900} />}
            {uploading ? (
              <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgb(0 0 0 / 0.26)' }}>
                <Spinner color="#fff" />
              </span>
            ) : !draft.coverUrl ? (
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <Icon name="outlined/add_photo_alternate" size={30} color="var(--color-events)" />
                <span className="t-label mt-2 text-events">Add a cover photo</span>
                <span className="t-caption-sm mt-0.5">This is what people scroll past</span>
              </span>
            ) : (
              <span
                className="t-caption-sm absolute bottom-2 right-2 rounded-[10px] px-2.5 py-[5px] text-white"
                style={{ background: 'rgb(0 0 0 / 0.54)' }}
              >
                Change
              </span>
            )}
          </button>

          <div className="h-6" />
          <SectionHeader title="The event" padding="0 0 8px" />
          <div className="mt-3 space-y-3">
            <VendorField
              value={draft.title}
              onChange={(title) => set({ title })}
              label="Event name"
              hint="Lagos Tech Night"
              capitalize="words"
              error={form.errors.title}
            />
            <VendorField
              value={draft.description}
              onChange={(description) => set({ description })}
              label="What is it"
              hint="Who it is for, what happens, what to bring."
              maxLines={4}
              capitalize="sentences"
            />
          </div>
          <p className="t-label mt-4">Category</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map(([key, label]) => {
              const selected = draft.category === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set({ category: key })}
                  className="ink t-label-sm rounded-full px-3.5 py-2"
                  style={
                    {
                      background: selected ? 'var(--color-ink)' : 'var(--color-surface)',
                      border: `1px solid ${selected ? 'var(--color-ink)' : 'var(--color-line)'}`,
                      color: selected ? '#fff' : 'var(--color-ink-muted)',
                    } as CSSProperties
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="h-6" />
          <SectionHeader title="When" padding="0 0 8px" />
          <div className="mt-3 space-y-3">
            <DateRow
              label="Starts"
              value={draft.startsAt ? dayAndTime(draft.startsAt) : 'Choose a date and time'}
              placeholder={!draft.startsAt}
              onClick={() => void pickStart()}
            />
            <DateRow
              label="Ends"
              value={draft.endsAt ? dayAndTime(draft.endsAt) : 'Optional'}
              placeholder={!draft.endsAt}
              onClick={() => void pickEnd()}
              onClear={draft.endsAt ? () => set({ endsAt: null }) : undefined}
            />
          </div>

          <div className="h-6" />
          <SectionHeader title="Where" padding="0 0 8px" />
          <div className="mt-3 space-y-3">
            <VendorField
              value={draft.venueName}
              onChange={(venueName) => set({ venueName })}
              label="Venue"
              hint="Landmark Centre"
              capitalize="words"
            />
            <VendorField
              value={draft.venueAddress}
              onChange={(venueAddress) => set({ venueAddress })}
              label="Address"
              hint="Water Corporation Road, Victoria Island"
              capitalize="words"
            />
            <VendorField
              value={draft.city}
              onChange={(city) => set({ city })}
              label="City"
              hint="Lagos"
              action="done"
              capitalize="words"
            />
          </div>

          <div className="h-7" />
          <SectionHeader title="Tickets" actionLabel="Add" onAction={() => void editTier()} padding="0 0 8px" />
          <div className="mt-3">
            {draft.tiers.length === 0 ? (
              <button
                type="button"
                onClick={() => void editTier()}
                className="ink flex w-full flex-col items-center rounded-[14px] border border-line bg-surface p-5"
              >
                <Icon name="outlined/confirmation_number" size={26} color="var(--color-ink-faint)" />
                <span className="t-h4 mt-2">Add a ticket type</span>
                <span className="t-caption-sm mt-1 text-center">Price it, or set it to zero for a free event.</span>
              </button>
            ) : (
              <div className="space-y-3">
                {draft.tiers.map((tier) => (
                  <TierRow key={tier.id} tier={tier} onEdit={() => void editTier(tier)} onRemove={() => removeTier(tier)} />
                ))}
              </div>
            )}
          </div>

          {blockers.length > 0 && (
            <div className="mt-6 rounded-[14px] bg-warning-soft p-4">
              <p className="t-h4 text-warning-ink">Before it can go on sale</p>
              <ul className="mt-2">
                {blockers.map((b) => (
                  <li key={b} className="mb-[3px] flex items-center gap-2">
                    <Icon name="round/radio_button_unchecked" size={13} color="var(--color-warning-ink)" />
                    <span className="t-caption-sm text-warning-ink">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </PageBody>
      <div
        data-bottom-bar=""
        className="flex shrink-0 gap-3 px-5 pt-3"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <BlorbButton label="Save draft" kind="outline" busy={saving} onClick={saving ? null : () => void save(false)} />
        <BlorbButton
          label={eventIsPublished(initial) ? 'Update' : 'Put on sale'}
          busy={saving}
          onClick={saving || !canPublish ? null : () => void save(true)}
        />
      </div>
    </Page>
  )
}

function DateRow({
  label,
  value,
  placeholder,
  onClick,
  onClear,
}: {
  label: string
  value: string
  placeholder: boolean
  onClick: () => void
  onClear?: () => void
}) {
  return (
    <div className="ink flex items-center rounded-[14px] border border-line bg-surface">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center p-4 text-left">
        <Icon name="round/event" size={19} color="var(--color-ink-muted)" />
        <span className="t-label ml-3">{label}</span>
        <span className="t-body ml-auto truncate pl-3" style={{ color: placeholder ? 'var(--color-ink-faint)' : 'var(--color-ink)' }}>
          {value}
        </span>
      </button>
      {onClear && <IconBtn icon="round/close" size={17} tooltip="Clear end time" compact onClick={onClear} />}
    </div>
  )
}

function TierRow({ tier, onEdit, onRemove }: { tier: EventTier; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="ink flex items-center rounded-[14px] border border-line bg-surface">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 p-4 text-left">
        <span className="flex items-center gap-2">
          <span className="t-h4 truncate">{tier.name}</span>
          {tierIsFree(tier) && <Pill label="Free" tone="success" dense />}
        </span>
        <span className="t-caption-sm mt-1 block">
          {[
            tierIsFree(tier) ? 'Free' : money(tier.price),
            tier.quantity > 0 ? `${tier.sold} of ${tier.quantity} sold` : `${tier.sold} sold · no limit`,
          ].join('  ·  ')}
        </span>
      </button>
      <IconBtn
        icon="round/delete_outline"
        size={19}
        tooltip="Remove ticket type"
        compact
        color={tier.sold > 0 ? 'var(--color-ink-faint)' : 'var(--color-danger)'}
        onClick={onRemove}
      />
      <span className="w-2" />
    </div>
  )
}
