import { cx } from '../lib/cx'

/**
 * CircularProgressIndicator as the theme draws it: brand arc, round caps, and
 * the surfaceSunken track the Flutter theme sets as `circularTrackColor`.
 */
export function Spinner({
  size = 36,
  stroke = 4,
  color = 'var(--color-brand)',
  track = 'var(--color-sunken)',
  className,
  label = 'Loading',
}: {
  size?: number
  stroke?: number
  color?: string
  track?: string | null
  className?: string
  label?: string
}) {
  const c = size / 2
  const r = (size - stroke) / 2
  return (
    <svg
      className={cx('spinner', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={label}
    >
      {track && <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />}
      <circle
        className="arc"
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength={100}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  )
}

/** A spinner centred in whatever space it is given. */
export function CenterSpinner({ size }: { size?: number }) {
  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <Spinner size={size} />
    </div>
  )
}
