import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLayer, useNav } from '../../app/stack'
import { AppBar, Page } from '../../components/AppBar'
import { BlorbButton, IconBtn } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { toast } from '../../components/overlay'
import { PullToRefresh } from '../../components/PullToRefresh'
import { SearchField } from '../../components/SearchField'
import { CenterSpinner } from '../../components/Spinner'
import { Divider, Empty, Pill } from '../../components/ui'
import {
  attendeeCheckedIn,
  blankEvent,
  broadcastSummary,
  type Attendee,
  type VendorEvent,
} from '../../data/eventModels'
import { dayAndTime } from '../../lib/format'
import { eventAttendees, EventsError } from '../../services/events'
import { showBroadcastSheet } from './Broadcast'

/**
 * The door list — and the manual fallback for the scanner: at some point a
 * phone will be dead or the camera useless in the dark, and the door still
 * has to move, so it searches by name, phone or reference.
 */
export default function AttendeesScreen() {
  const nav = useNav()
  const { eventId = '' } = useParams()
  const layer = useLayer<{ event?: VendorEvent }>()
  const event = layer.data?.event ?? { ...blankEvent, id: eventId }

  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [checkedIn, setCheckedIn] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const loaded = useRef(false)

  const load = useCallback(async () => {
    setLoading(!loaded.current)
    setError(null)
    try {
      const result = await eventAttendees(eventId)
      loaded.current = result.attendees.length > 0
      setAttendees(result.attendees)
      setCheckedIn(result.checkedIn)
    } catch (e) {
      setError(e instanceof EventsError ? e.message : 'Could not load the attendee list.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attendees
    return attendees.filter(
      (a) =>
        a.holderName.toLowerCase().includes(q) ||
        a.holderPhone.toLowerCase().includes(q) ||
        a.reference.toLowerCase().includes(q),
    )
  }, [attendees, query])

  const messageEveryone = async () => {
    const result = await showBroadcastSheet(event)
    if (result) toast(broadcastSummary(result), { tone: 'success', duration: 5000 })
  }

  return (
    <Page>
      <AppBar
        title="Attendees"
        actions={
          <>
            <IconBtn
              icon="round/qr_code_scanner"
              tooltip="Scan tickets"
              onClick={() => void nav.push('/scan').then(() => load())}
            />
            <span className="w-2" />
          </>
        }
      />
      {loading ? (
        <CenterSpinner />
      ) : error ? (
        <Empty title="Could not load" message={error} icon="round/wifi_off" actionLabel="Try again" onAction={() => void load()} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-3 px-5 pb-3 pt-4">
            <Stat label="Tickets out" value={attendees.length} color="var(--color-brand)" />
            <Stat label="Checked in" value={checkedIn} color="var(--color-success)" />
            <Stat label="Still out" value={attendees.length - checkedIn} color="var(--color-warning)" />
          </div>
          {attendees.length > 0 && (
            <>
              <div className="px-5 pb-3">
                <BlorbButton
                  label="Message everyone"
                  icon="round/campaign"
                  kind="soft"
                  size="md"
                  onClick={() => void messageEveryone()}
                />
              </div>
              <div className="px-5">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  hint="Search name, phone or reference"
                  border="var(--color-line)"
                  clearable
                />
              </div>
            </>
          )}
          <PullToRefresh onRefresh={load} className="flex min-h-0 flex-1 flex-col">
            {attendees.length === 0 ? (
              <Empty
                title="Nobody yet"
                message="People who get a ticket appear here, and you can check them in at the door."
                icon="round/people_outline"
              />
            ) : visible.length === 0 ? (
              <Empty title="No match" message="Nothing on the list matches that." icon="round/search_off" />
            ) : (
              <div className="px-5 pb-8 pt-4">
                {visible.map((a, i) => (
                  <div key={a.id || i}>
                    <AttendeeRow attendee={a} />
                    {i !== visible.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            )}
          </PullToRefresh>
        </div>
      )}
    </Page>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col items-center rounded-[14px] py-3"
      style={{ background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <span className="t-h1" style={{ fontSize: 22, color }}>
        {value}
      </span>
      <span className="t-caption-sm mt-0.5">{label}</span>
    </div>
  )
}

function AttendeeRow({ attendee }: { attendee: Attendee }) {
  const inside = attendeeCheckedIn(attendee)
  return (
    <div className="flex items-center py-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ background: inside ? 'var(--color-success-soft)' : 'var(--color-sunken)' }}
      >
        <Icon
          name={inside ? 'round/how_to_reg' : 'round/person_outline'}
          size={18}
          color={inside ? 'var(--color-success)' : 'var(--color-ink-muted)'}
        />
      </span>
      <div className="ml-3 min-w-0 flex-1">
        <p className="t-h4 truncate">{attendee.holderName || 'Ticket holder'}</p>
        <p className="t-caption-sm mt-0.5 truncate">
          {[attendee.ticketTypeName, attendee.holderPhone, attendee.reference].filter(Boolean).join('  ·  ')}
        </p>
      </div>
      <div className="ml-2 flex flex-col items-end">
        {inside ? (
          <>
            <Pill label="In" tone="success" dense />
            {attendee.usedAt && <span className="t-caption-sm mt-0.5">{dayAndTime(attendee.usedAt)}</span>}
          </>
        ) : (
          <Pill label="Not in" dense />
        )}
      </div>
    </div>
  )
}
