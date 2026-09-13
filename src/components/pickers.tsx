import { useRef, useState, type PointerEvent } from 'react'
import { monthName } from '../lib/format'
import { IconBtn, TextButton } from './Button'
import { showDialog } from './overlay'
import { Divider } from './ui'

/* ─────────────────────────────────────────────────────────────────────────
   Material 3 date and time pickers — showDatePicker and showTimePicker —
   in the Blorbmart colour scheme.
   ───────────────────────────────────────────────────────────────────────── */

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameDay = (a: Date, b: Date) => dayStart(a).getTime() === dayStart(b).getTime()

export function showDatePicker(opts: { initial: Date; first: Date; last: Date }) {
  return showDialog<Date>((close) => <DatePicker {...opts} onDone={close} />, { width: 360 })
}

function DatePicker({
  initial,
  first,
  last,
  onDone,
}: {
  initial: Date
  first: Date
  last: Date
  onDone: (d?: Date) => void
}) {
  const [selected, setSelected] = useState(dayStart(initial))
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1))
  const today = new Date()
  const min = dayStart(first)
  const max = dayStart(last)

  const lead = month.getDay()
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ]
  const canPrev = new Date(month.getFullYear(), month.getMonth(), 0) >= min
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= max

  return (
    <div className="flex flex-col">
      <div className="flex h-[120px] flex-col justify-between px-6 pb-3 pt-4">
        <p className="t-label-lg text-ink-muted">Select date</p>
        <p className="t-h1">
          {WEEKDAYS_SHORT[selected.getDay()]}, {monthName(selected.getMonth())} {selected.getDate()}
        </p>
      </div>
      <Divider />
      <div className="flex h-14 items-center pl-6 pr-2">
        <p className="t-label flex-1 text-ink-muted">
          {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month.getMonth()]}{' '}
          {month.getFullYear()}
        </p>
        <IconBtn
          icon="round/chevron_left"
          tooltip="Previous month"
          color="var(--color-ink-muted)"
          disabled={!canPrev}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        />
        <IconBtn
          icon="round/chevron_right"
          tooltip="Next month"
          color="var(--color-ink-muted)"
          disabled={!canNext}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        />
      </div>
      <div className="grid grid-cols-7 px-3">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="t-body-sm grid h-12 place-items-center text-ink">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />
          const disabled = date < min || date > max
          const isSelected = sameDay(date, selected)
          const isToday = sameDay(date, today)
          return (
            <button
              key={date.getTime()}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={date.toDateString()}
              onClick={() => setSelected(date)}
              className="ink mx-auto grid h-10 w-10 place-items-center rounded-full text-[14px] font-medium"
              style={{
                margin: '4px auto',
                background: isSelected ? 'var(--color-brand)' : undefined,
                color: isSelected ? '#fff' : disabled ? 'rgb(11 18 32 / 0.38)' : isToday ? 'var(--color-brand)' : 'var(--color-ink)',
                boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--color-brand)' : undefined,
              }}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
      <div className="flex justify-end gap-2 px-3 pb-3 pt-2">
        <TextButton onClick={() => onDone()}>Cancel</TextButton>
        <TextButton onClick={() => onDone(selected)}>OK</TextButton>
      </div>
    </div>
  )
}

export interface TimeOfDay {
  hour: number
  minute: number
}

export function showTimePicker(initial: TimeOfDay) {
  return showDialog<TimeOfDay>((close) => <TimePicker initial={initial} onDone={close} />, { width: 328 })
}

const DIAL = 256
const RADIUS = 100

function TimePicker({ initial, onDone }: { initial: TimeOfDay; onDone: (t?: TimeOfDay) => void }) {
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  const dial = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pm = hour >= 12
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  const fromPointer = (e: PointerEvent) => {
    const rect = dial.current!.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    const angle = (Math.atan2(x, -y) * 180) / Math.PI
    const turn = (angle + 360) % 360
    if (mode === 'hour') {
      const h = Math.round(turn / 30) % 12
      setHour((h === 0 ? 0 : h) + (pm ? 12 : 0))
    } else {
      setMinute(Math.round(turn / 6) % 60)
    }
  }

  const selectedValue = mode === 'hour' ? hour12 % 12 : minute
  const selectedAngle = mode === 'hour' ? selectedValue * 30 : selectedValue * 6
  const handX = Math.sin((selectedAngle * Math.PI) / 180) * RADIUS
  const handY = -Math.cos((selectedAngle * Math.PI) / 180) * RADIUS

  const labels =
    mode === 'hour'
      ? Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i, angle: i * 30, text: String(i === 0 ? 12 : i) }))
      : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, angle: i * 30, text: String(i * 5).padStart(2, '0') }))

  const box = (active: boolean) => ({
    background: active ? 'var(--color-brand-soft)' : 'var(--color-sunken)',
    color: active ? 'var(--color-brand-ink)' : 'var(--color-ink)',
  })

  return (
    <div className="flex flex-col p-6 pb-3">
      <p className="t-label text-ink-muted">Select time</p>
      <div className="mt-5 flex items-center gap-3">
        <div className="flex flex-1 items-center">
          <button type="button" onClick={() => setMode('hour')} className="t-display-lg h-20 flex-1 rounded-[8px] tabular-nums" style={box(mode === 'hour')}>
            {hour12}
          </button>
          <span className="t-display-lg w-6 text-center">:</span>
          <button
            type="button"
            onClick={() => setMode('minute')}
            className="t-display-lg h-20 flex-1 rounded-[8px] tabular-nums"
            style={box(mode === 'minute')}
          >
            {String(minute).padStart(2, '0')}
          </button>
        </div>
        <div className="flex h-20 w-[52px] shrink-0 flex-col overflow-hidden rounded-[8px] border border-line-strong">
          {(['AM', 'PM'] as const).map((period) => {
            const active = (period === 'PM') === pm
            return (
              <button
                key={period}
                type="button"
                aria-pressed={active}
                onClick={() => setHour((h) => (period === 'PM' ? (h % 12) + 12 : h % 12))}
                className="t-h3 flex-1"
                style={{
                  background: active ? 'var(--color-appetite-soft)' : 'transparent',
                  color: active ? 'var(--color-appetite-deep)' : 'var(--color-ink-muted)',
                  borderTop: period === 'PM' ? '1px solid var(--color-line-strong)' : undefined,
                }}
              >
                {period}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={dial}
        role="slider"
        aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
        aria-valuenow={mode === 'hour' ? hour12 : minute}
        tabIndex={0}
        className="relative mx-auto mt-9 touch-none select-none rounded-full bg-sunken"
        style={{ width: DIAL, height: DIAL }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          fromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          dragging.current = false
          if (mode === 'hour') setMode('minute')
        }}
      >
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
        <span
          className="absolute left-1/2 top-1/2 h-[2px] origin-left bg-brand"
          style={{ width: RADIUS, rotate: `${selectedAngle - 90}deg`, translate: '0 -50%' }}
        />
        <span
          className="absolute h-12 w-12 rounded-full bg-brand"
          style={{ left: DIAL / 2 + handX - 24, top: DIAL / 2 + handY - 24 }}
        />
        {labels.map((l) => {
          const x = Math.sin((l.angle * Math.PI) / 180) * RADIUS
          const y = -Math.cos((l.angle * Math.PI) / 180) * RADIUS
          const on = mode === 'hour' ? l.value % 12 === hour12 % 12 : l.value === minute
          return (
            <span
              key={l.text}
              className="t-body-lg pointer-events-none absolute grid h-12 w-12 place-items-center"
              style={{ left: DIAL / 2 + x - 24, top: DIAL / 2 + y - 24, color: on ? '#fff' : 'var(--color-ink)' }}
            >
              {l.text}
            </span>
          )
        })}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <TextButton onClick={() => onDone()}>Cancel</TextButton>
        <TextButton onClick={() => onDone({ hour, minute })}>OK</TextButton>
      </div>
    </div>
  )
}
