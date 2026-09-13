import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { cx } from '../lib/cx'
import { Spinner } from './Spinner'

const TRIGGER = 64
const MAX = 110

/**
 * Material RefreshIndicator: pull down from the top of a list and a white
 * disc with the progress arc follows the finger; let go past the line and
 * the list refreshes.
 */
export function PullToRefresh({
  onRefresh,
  children,
  color = 'var(--color-brand)',
  className,
  onScroll,
  scrollRef,
}: {
  onRefresh: () => Promise<unknown>
  children: ReactNode
  color?: string
  className?: string
  onScroll?: () => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
}) {
  const own = useRef<HTMLDivElement>(null)
  const ref = scrollRef ?? own
  const start = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onStart = (e: TouchEvent) => {
    if (refreshing || (ref.current?.scrollTop ?? 0) > 0) return
    start.current = e.touches[0].clientY
  }
  const onMove = (e: TouchEvent) => {
    if (start.current == null) return
    const dy = e.touches[0].clientY - start.current
    if (dy <= 0 || (ref.current?.scrollTop ?? 0) > 0) {
      start.current = null
      setPull(0)
      return
    }
    setPull(Math.min(MAX, dy * 0.5))
  }
  const onEnd = async () => {
    if (start.current == null) return
    start.current = null
    if (pull < TRIGGER) {
      setPull(0)
      return
    }
    setRefreshing(true)
    setPull(TRIGGER)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setPull(0)
    }
  }

  const progress = Math.min(1, pull / TRIGGER)

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={() => void onEnd()}
      onTouchCancel={() => void onEnd()}
      className={cx('scroll-y relative', className)}
    >
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none absolute left-1/2 top-0 z-20 grid h-10 w-10 place-items-center rounded-full bg-white shadow-md"
        style={{
          translate: `-50% ${pull - 44}px`,
          opacity: pull > 0 ? 1 : 0,
          transition: start.current == null ? 'translate 200ms var(--ease-emph), opacity 150ms' : undefined,
        }}
      >
        {refreshing ? (
          <Spinner size={22} stroke={2.5} color={color} track={null} />
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" style={{ rotate: `${progress * 270}deg` }}>
            <circle
              cx="11"
              cy="11"
              r="9.75"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${progress * 80} 100`}
              transform="rotate(-90 11 11)"
            />
          </svg>
        )}
      </div>
      {children}
    </div>
  )
}
