import { useEffect, useRef, useState } from 'react'
import { Spinner } from './Spinner'

const TRIGGER = 64
const MAX = 110

/**
 * Pull down from the top of any screen to reload it — the gesture every phone
 * browser gives a page, and one this app switches off.
 *
 * The frame is `position: fixed` with `overscroll-behavior: none` so the app
 * feels native: no rubber-banding, no address bar sliding about. That also
 * removes the browser's own pull-to-refresh, so on every screen without a
 * refresh of its own a vendor swiped down and nothing happened
 * (QA-BM-WEB-002, item 1). This puts the gesture back: pull from the top of
 * the list you are on, let go past the line, and the page reloads at the same
 * address, re-reading everything.
 *
 * Screens with their own <PullToRefresh> (it marks itself `data-ptr`) keep
 * it. Dialogs and sheets, text fields, and anything marked `data-no-ptr` are
 * left alone, and a swipe that starts sideways — between the Orders tabs — is
 * never a pull.
 */
export function GlobalPullToRefresh() {
  const [pull, setPull] = useState(0)
  const [reloading, setReloading] = useState(false)
  const dragging = useRef(false)

  useEffect(() => {
    let gesture: { startX: number; startY: number; scroller: HTMLElement | null; active: boolean } | null = null
    let distance = 0

    const eligible = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      if (target.closest('[data-ptr], [data-no-ptr], [role="dialog"], input, textarea, select, [contenteditable="true"]')) {
        return null
      }
      return { scroller: target.closest<HTMLElement>('.scroll-y') }
    }

    const reset = () => {
      gesture = null
      distance = 0
      dragging.current = false
      setPull(0)
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const found = eligible(e.target)
      // Only from the top of a list: anywhere lower, pulling down is scrolling up.
      if (!found || (found.scroller && found.scroller.scrollTop > 0)) return
      gesture = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, scroller: found.scroller, active: false }
    }

    const onMove = (e: TouchEvent) => {
      if (!gesture) return
      const dx = e.touches[0].clientX - gesture.startX
      const dy = e.touches[0].clientY - gesture.startY
      if (!gesture.active) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) return reset()
        if (dy < 0) return reset()
        if (dy < 8) return
        if (gesture.scroller && gesture.scroller.scrollTop > 0) return reset()
        gesture.active = true
        dragging.current = true
      }
      distance = Math.min(MAX, Math.max(0, dy * 0.5))
      setPull(distance)
    }

    const onEnd = () => {
      if (!gesture?.active) {
        gesture = null
        return
      }
      if (distance >= TRIGGER) {
        gesture = null
        dragging.current = false
        setPull(TRIGGER)
        setReloading(true)
        window.location.reload()
        return
      }
      reset()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', reset)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }, [])

  if (pull <= 0 && !reloading) return null
  const progress = Math.min(1, pull / TRIGGER)

  return (
    <div
      aria-hidden={!reloading}
      role={reloading ? 'status' : undefined}
      aria-label={reloading ? 'Refreshing' : undefined}
      className="pointer-events-none fixed left-1/2 top-0 z-[1000] grid h-10 w-10 place-items-center rounded-full bg-white shadow-md"
      style={{
        translate: `-50% calc(env(safe-area-inset-top) + ${pull - 36}px)`,
        transition: dragging.current ? undefined : 'translate 200ms var(--ease-emph)',
      }}
    >
      {reloading ? (
        <Spinner size={22} stroke={2.5} color="var(--color-brand)" track={null} />
      ) : (
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ rotate: `${progress * 270}deg` }}>
          <circle
            cx="11"
            cy="11"
            r="9.75"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${progress * 80} 100`}
            transform="rotate(-90 11 11)"
          />
        </svg>
      )}
    </div>
  )
}
