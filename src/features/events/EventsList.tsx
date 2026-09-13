import { useCallback, useEffect, useRef, useState } from 'react'
import { useNav } from '../../app/stack'
import { AppBar, Fab, Page } from '../../components/AppBar'
import { BlorbImage } from '../../components/BlorbImage'
import { IconBtn, TextButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { PullToRefresh } from '../../components/PullToRefresh'
import { CenterSpinner } from '../../components/Spinner'
import { Divider, Empty } from '../../components/ui'
import {
  eventHasEnded,
  eventIsCancelled,
  eventIsPublished,
  eventRevenue,
  eventStatusColor,
  eventStatusLabel,
  type VendorEvent,
} from '../../data/eventModels'
import { dayAndTime, money } from '../../lib/format'
import { EventsError, myEvents } from '../../services/events'

const rank = (e: VendorEvent) => (eventIsCancelled(e) ? 3 : eventHasEnded(e) ? 2 : eventIsPublished(e) ? 0 : 1)

/**
 * Anything still selling first, drafts next, finished last. Upcoming events
 * read best soonest-first; finished ones newest-first.
 */
function sorted(events: VendorEvent[]) {
  return [...events].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    if (!a.startsAt || !b.startsAt) return 0
    return rank(a) === 2 ? b.startsAt.getTime() - a.startsAt.getTime() : a.startsAt.getTime() - b.startsAt.getTime()
  })
}

/** The organizer's events. */
export default function EventsListScreen() {
  const nav = useNav()
  const [events, setEvents] = useState<VendorEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    setLoading(count.current === 0)
    setError(null)
    try {
      const list = sorted(await myEvents())
      count.current = list.length
      setEvents(list)
    } catch (e) {
      setError(e instanceof EventsError ? e.message : 'Could not load your events. Pull down to retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = async (event?: VendorEvent) => {
    const saved = await nav.push<boolean>(event ? `/events/${encodeURIComponent(event.id)}` : '/events/new', { event })
    if (saved) void load()
  }

  const live = events.some((e) => eventIsPublished(e) && !eventHasEnded(e))

  return (
    <Page>
      <AppBar
        title="Events"
        back={false}
        actions={
          <>
            {/* Only worth showing when there is a door to work. */}
            {live && <IconBtn icon="round/qr_code_scanner" tooltip="Scan tickets" onClick={() => void nav.push('/scan')} />}
            <span className="w-2" />
          </>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PullToRefresh onRefresh={load} className="flex min-h-0 flex-1 flex-col">
          {loading ? (
            <CenterSpinner />
          ) : error ? (
            <Empty
              title="Could not load events"
              message={error}
              icon="round/wifi_off"
              actionLabel="Try again"
              onAction={() => void load()}
            />
          ) : events.length === 0 ? (
            <Empty
              title="No events yet"
              message="Create one, add a ticket type — free or paid — and put it on sale."
              icon="outlined/confirmation_number"
              actionLabel="Create your first event"
              onAction={() => void openEditor()}
            />
          ) : (
            <div className="space-y-3 px-5 pb-[120px] pt-4">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onEdit={() => void openEditor(event)}
                  onAttendees={() =>
                    void nav
                      .push(`/events/${encodeURIComponent(event.id)}/attendees`, { event })
                      .then(() => load())
                  }
                />
              ))}
            </div>
          )}
        </PullToRefresh>
        <Fab icon="round/add" label="New event" labelClass="t-label-lg" onClick={() => void openEditor()} />
      </div>
    </Page>
  )
}

function EventRow({ event, onEdit, onAttendees }: { event: VendorEvent; onEdit: () => void; onAttendees: () => void }) {
  const color = eventStatusColor(event)
  const revenue = eventRevenue(event)
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <button type="button" onClick={onEdit} className="ink flex w-full items-start p-4 text-left">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px]">
          {event.coverUrl ? (
            <BlorbImage url={event.coverUrl} decodeWidth={200} />
          ) : (
            <span className="grid h-full w-full place-items-center bg-events-soft">
              <Icon name="round/confirmation_number" color="var(--color-events)" />
            </span>
          )}
        </span>
        <span className="ml-3 min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="t-h4 min-w-0 flex-1 truncate">{event.title || 'Untitled event'}</span>
            <span
              className="t-caption-sm shrink-0 rounded-[10px] px-2 py-[3px] font-bold"
              style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
            >
              {eventStatusLabel(event)}
            </span>
          </span>
          <span className="t-caption-sm mt-1 block truncate">
            {[event.startsAt ? dayAndTime(event.startsAt) : '', event.venueName].filter(Boolean).join('  ·  ')}
          </span>
          <span className="mt-2 flex items-center">
            <Icon name="round/people_alt" size={14} color="var(--color-ink-faint)" />
            <span className="t-caption-sm ml-1">
              {event.totalCapacity > 0 ? `${event.totalSold} of ${event.totalCapacity} sold` : `${event.totalSold} sold`}
            </span>
            {revenue > 0 && <span className="t-caption-sm ml-3 font-bold text-success">{money(revenue)}</span>}
          </span>
        </span>
      </button>
      <Divider />
      <div className="flex items-center">
        <div className="flex flex-1 justify-center">
          <TextButton icon="outlined/edit" onClick={onEdit} className="w-full">
            Edit
          </TextButton>
        </div>
        <span className="h-[22px] w-px bg-line" />
        <div className="flex flex-1 justify-center">
          <TextButton icon="round/people_outline" onClick={onAttendees} className="w-full">
            Attendees
          </TextButton>
        </div>
      </div>
    </div>
  )
}
