import { useRef, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../lib/cx'

/** Motion.stagger — 55ms between siblings, capped so long lists do not crawl. */
export const staggerFor = (index: number, cap = 8) => 55 * Math.min(index, cap)

/**
 * Fades and lifts a child into place once, on mount.
 *
 * CSS only: the animation runs on the compositor and the subtree is never
 * re-rendered for it, which is the web's version of the Flutter widget
 * building its child once and repainting only the transform layer.
 */
export function FadeSlideIn({
  children,
  delay = 0,
  duration,
  x,
  y,
  scaleFrom,
  ease,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  duration?: number
  /** Offsets as a fraction of the element's own size, e.g. '0' and '6%'. */
  x?: string
  y?: string
  scaleFrom?: number
  ease?: string
  className?: string
  style?: CSSProperties
}) {
  const vars = {
    '--fsi-delay': delay ? `${delay}ms` : undefined,
    '--fsi-dur': duration ? `${duration}ms` : undefined,
    '--fsi-x': x,
    '--fsi-y': y,
    '--fsi-s': scaleFrom,
    '--fsi-ease': ease,
  } as CSSProperties
  return (
    <div className={cx('fsi', className)} style={{ ...vars, ...style }}>
      {children}
    </div>
  )
}

/**
 * Slides a new value in whenever its key changes — badge counts, status
 * lines, the prep-time readout.
 *
 * Like AnimatedSwitcher, the first value is not animated: only a change is.
 */
export function SwapIn({
  swapKey,
  children,
  className,
  horizontal = false,
}: {
  swapKey: string | number | boolean
  children: ReactNode
  className?: string
  horizontal?: boolean
}) {
  const mountKey = useRef(swapKey)
  const animate = swapKey !== mountKey.current
  return (
    <span
      key={String(swapKey)}
      className={cx('inline-flex', animate && 'swap-in', className)}
      style={horizontal ? ({ '--swap-x': '35%', '--swap-y': '0' } as CSSProperties) : undefined}
    >
      {children}
    </span>
  )
}

/** A soft, slow pulse behind a live status dot. */
export function LivePulse({ color = 'var(--color-success)', size = 9 }: { color?: string; size?: number }) {
  return <span aria-hidden="true" className="live-pulse" style={{ '--s': `${size}px`, '--c': color } as CSSProperties} />
}
