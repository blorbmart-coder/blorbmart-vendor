import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { cx } from '../lib/cx'
import { BlorbButton } from './Button'
import { Icon, type IconName } from './Icon'
import { FadeSlideIn } from './motion'

/** Keyboard parity for things that are tapped: Enter and Space press them. */
export function pressKeys(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      action()
    }
  }
}

/** The standard white card — BlorbCard. */
export function Card({
  children,
  padding = 16,
  onClick,
  radius = 18,
  color = 'var(--color-surface)',
  border,
  shadow = 'var(--shadow-sm)',
  clip = false,
  className,
  style,
  label,
}: {
  children: ReactNode
  padding?: number | string
  onClick?: () => void
  radius?: number
  color?: string
  border?: string
  shadow?: string | null
  clip?: boolean
  className?: string
  style?: CSSProperties
  label?: string
}) {
  const interactive = Boolean(onClick)
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onClick={onClick}
      onKeyDown={interactive ? pressKeys(onClick!) : undefined}
      className={cx(interactive && 'press', className)}
      style={
        {
          '--ps': 0.985,
          padding,
          borderRadius: radius,
          background: color,
          border: border ? `1px solid ${border}` : undefined,
          boxShadow: shadow ?? undefined,
          overflow: clip ? 'hidden' : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  )
}

/** Section header with an optional action on the right. */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  padding = '24px 20px 12px',
}: {
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  padding?: string
}) {
  return (
    <div className="flex items-center" style={{ padding }}>
      <div className="min-w-0 flex-1">
        <h2 className="t-h2">{title}</h2>
        {subtitle && <p className="t-body-sm mt-0.5">{subtitle}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="press flex items-center px-2 py-1"
          style={{ '--ps': 0.94 } as CSSProperties}
        >
          <span className="t-label text-brand">{actionLabel}</span>
          <Icon name="round/chevron_right" size={18} color="var(--color-brand)" />
        </button>
      )}
    </div>
  )
}

export type PillTone = 'neutral' | 'brand' | 'appetite' | 'success' | 'warning' | 'danger' | 'amber'

const PILL: Record<PillTone, [string, string]> = {
  neutral: ['var(--color-sunken)', 'var(--color-ink-body)'],
  brand: ['var(--color-brand-soft)', 'var(--color-brand-ink)'],
  appetite: ['var(--color-appetite-soft)', 'var(--color-appetite-deep)'],
  success: ['var(--color-success-soft)', 'var(--color-success)'],
  warning: ['var(--color-warning-soft)', 'var(--color-warning-ink)'],
  danger: ['var(--color-danger-soft)', 'var(--color-danger)'],
  amber: ['var(--color-amber-soft)', 'var(--color-amber-ink)'],
}

/** A small status pill. Seven semantic tones cover every use in the app. */
export function Pill({
  label,
  icon,
  tone = 'neutral',
  dense = false,
  solid = false,
}: {
  label: string
  icon?: IconName
  tone?: PillTone
  dense?: boolean
  solid?: boolean
}) {
  const [bg, fg] = PILL[tone]
  const ink = solid ? '#fff' : fg
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap"
      style={{ padding: dense ? '3px 7px' : '5px 10px', background: solid ? fg : bg, borderRadius: 10 }}
    >
      {icon && <Icon name={icon} size={dense ? 11 : 13} color={ink} style={{ marginRight: 4 }} />}
      <span className={dense ? 't-caption-sm' : 't-label-sm'} style={{ color: ink }}>
        {label}
      </span>
    </span>
  )
}

/** Empty / error state. Always offers a way forward — never a dead end. */
export function Empty({
  title,
  message,
  icon = 'round/search_off',
  actionLabel,
  onAction,
  tone = 'var(--color-brand)',
  compact = false,
}: {
  title: string
  message: string
  icon?: IconName
  actionLabel?: string
  onAction?: () => void
  tone?: string
  compact?: boolean
}) {
  const circle = compact ? 64 : 84
  return (
    <div
      className="flex flex-1 items-center justify-center"
      style={{ padding: `${compact ? 24 : 56}px 32px` }}
    >
      <FadeSlideIn className="flex flex-col items-center text-center">
        <div
          className="grid place-items-center rounded-full"
          style={{
            width: circle,
            height: circle,
            background: `color-mix(in srgb, ${tone} 10%, transparent)`,
          }}
        >
          <Icon name={icon} size={compact ? 28 : 36} color={tone} />
        </div>
        <h2 className={cx(compact ? 't-h3' : 't-h2', 'mt-5')}>{title}</h2>
        <p className="t-body mt-2">{message}</p>
        {actionLabel && onAction && (
          <div className="mt-6">
            <BlorbButton label={actionLabel} onClick={onAction} expand={false} size="md" />
          </div>
        )}
      </FadeSlideIn>
    </div>
  )
}

/** Drag handle for bottom sheets. */
export function SheetHandle() {
  return <div aria-hidden="true" className="mx-auto my-3 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
}

/** A shimmering block. */
export function Skeleton({
  width,
  height = 14,
  radius = 8,
  circle = false,
  className,
}: {
  width?: number | string
  height?: number
  radius?: number
  circle?: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cx('skeleton', className)}
      style={{ width, height, borderRadius: circle ? '50%' : radius }}
    />
  )
}

/** A 1px hairline. */
export function Divider({ indent = 0, endIndent = 0 }: { indent?: number; endIndent?: number }) {
  return (
    <div aria-hidden="true" className="h-px shrink-0 bg-line" style={{ marginLeft: indent, marginRight: endIndent }} />
  )
}
