import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Material 3 Slider, discrete, as the prep-time step themes it: a 5px track
 * (the active side 2px taller), brand thumb, 12% brand overlay while held,
 * and a tick mark at every division.
 */
export function Slider({
  value,
  min,
  max,
  divisions,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  divisions: number
  onChange: (value: number) => void
  label: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const step = (max - min) / divisions
  const clamped = Math.min(max, Math.max(min, value))
  const pct = ((clamped - min) / (max - min)) * 100

  const valueAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return min + Math.round((t * (max - min)) / step) * step
  }

  const emit = (next: number) => {
    const snapped = Math.round(next)
    if (snapped !== Math.round(clamped)) onChange(snapped)
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    emit(valueAt(e.clientX))
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) emit(valueAt(e.clientX))
  }
  const onUp = () => setDragging(false)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') emit(Math.min(max, clamped + step))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') emit(Math.max(min, clamped - step))
    else if (e.key === 'Home') emit(min)
    else if (e.key === 'End') emit(max)
    else return
    e.preventDefault()
  }

  const ticks = Array.from({ length: divisions + 1 }, (_, i) => (i / divisions) * 100)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(clamped)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      className="relative h-12 cursor-pointer touch-none select-none px-6"
    >
      <div ref={trackRef} className="relative top-1/2 h-[5px] -translate-y-1/2">
        <div className="absolute inset-0 rounded-full bg-line" />
        <div
          className="absolute left-0 top-1/2 h-[7px] -translate-y-1/2 rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute top-1/2 h-[2.5px] w-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${t}%`,
              background: t <= pct ? 'rgb(255 255 255 / 0.38)' : 'rgb(107 120 145 / 0.38)',
            }}
          />
        ))}
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height] duration-150"
          style={{
            left: `${pct}%`,
            width: dragging ? 48 : 0,
            height: dragging ? 48 : 0,
            background: 'rgb(31 119 241 / 0.12)',
          }}
        />
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
          style={{ left: `${pct}%`, boxShadow: '0 1px 2px rgb(0 0 0 / 0.2)' }}
        />
      </div>
    </div>
  )
}
