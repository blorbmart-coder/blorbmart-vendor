import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../lib/cx'
import { haptic } from '../lib/haptics'
import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'

export type ButtonKind = 'brand' | 'appetite' | 'soft' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const PALETTE: Record<ButtonKind, { bg: string; fg: string; border?: string; gradient?: string }> = {
  brand: { bg: 'var(--color-brand)', fg: '#fff', gradient: 'bg-brand-gradient' },
  appetite: { bg: 'var(--color-appetite)', fg: '#fff', gradient: 'bg-appetite-gradient' },
  soft: { bg: 'var(--color-brand-soft)', fg: 'var(--color-brand-ink)' },
  outline: { bg: '#fff', fg: 'var(--color-ink)', border: 'var(--color-line-strong)' },
  ghost: { bg: 'transparent', fg: 'var(--color-brand)' },
  danger: { bg: 'var(--color-danger)', fg: '#fff' },
}

const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 50, lg: 56 }
const TEXT: Record<ButtonSize, string> = { sm: 't-label-sm', md: 't-label', lg: 't-label-lg' }

/**
 * The one button in the app — BlorbButton.
 *
 * Press-scale, a busy state that keeps its own width (the label stays laid
 * out underneath the spinner, so the layout never jumps), a light haptic,
 * and a disabled state that stays legible at 55%.
 */
export function BlorbButton({
  label,
  onClick,
  kind = 'brand',
  size = 'lg',
  icon,
  trailing,
  busy = false,
  expand = true,
  glow = false,
  className,
}: {
  label: string
  onClick?: (() => void) | null
  kind?: ButtonKind
  size?: ButtonSize
  icon?: IconName
  trailing?: ReactNode
  busy?: boolean
  expand?: boolean
  glow?: boolean
  className?: string
}) {
  const enabled = Boolean(onClick) && !busy
  const p = PALETTE[kind]
  const glowShadow =
    enabled && glow
      ? kind === 'appetite'
        ? 'var(--shadow-appetite)'
        : kind === 'brand'
          ? 'var(--shadow-brand)'
          : undefined
      : undefined

  return (
    <button
      type="button"
      disabled={!enabled}
      aria-busy={busy || undefined}
      onClick={
        enabled
          ? () => {
              haptic.light()
              onClick?.()
            }
          : undefined
      }
      className={cx(
        'press relative inline-flex shrink-0 items-center justify-center overflow-hidden',
        p.gradient,
        expand && 'w-full',
        className,
      )}
      style={
        {
          '--ps': 0.972,
          height: HEIGHT[size],
          paddingInline: size === 'sm' ? 16 : 24,
          borderRadius: size === 'sm' ? 10 : 14,
          backgroundColor: p.gradient ? undefined : p.bg,
          color: p.fg,
          border: p.border ? `1.3px solid ${p.border}` : undefined,
          boxShadow: glowShadow,
          opacity: enabled ? 1 : 0.55,
        } as CSSProperties
      }
    >
      <span
        className={cx('flex min-w-0 items-center justify-center gap-2', expand && 'w-full')}
        style={{ visibility: busy ? 'hidden' : undefined }}
      >
        {icon && <Icon name={icon} size={size === 'sm' ? 16 : 19} />}
        <span className={cx(TEXT[size], 'truncate')} style={{ color: p.fg }}>
          {label}
        </span>
        {trailing}
      </span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={20} stroke={2.2} color={p.fg} />
        </span>
      )}
    </button>
  )
}

/**
 * Round icon button on a surface ground with a hairline — BlorbIconButton.
 */
export function BlorbIconButton({
  icon,
  onClick,
  size = 42,
  iconSize = 20,
  background = 'var(--color-surface)',
  foreground = 'var(--color-ink)',
  tooltip,
}: {
  icon: IconName
  onClick?: () => void
  size?: number
  iconSize?: number
  background?: string
  foreground?: string
  tooltip?: string
}) {
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip ?? 'Back'}
      disabled={!onClick}
      onClick={
        onClick
          ? () => {
              haptic.selection()
              onClick()
            }
          : undefined
      }
      className="press grid shrink-0 place-items-center rounded-full"
      style={
        {
          '--ps': 0.9,
          width: size,
          height: size,
          background,
          color: foreground,
          border: '1px solid var(--color-line)',
        } as CSSProperties
      }
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}

/**
 * Material TextButton, as the theme sets it: brand label, stadium shape,
 * 44px minimum so it is still a comfortable target.
 */
export function TextButton({
  children,
  onClick,
  icon,
  color = 'var(--color-brand)',
  className,
  label,
}: {
  children: ReactNode
  onClick?: (() => void) | null
  icon?: IconName
  color?: string
  className?: string
  label?: string
}) {
  const enabled = Boolean(onClick)
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={label}
      onClick={onClick ?? undefined}
      className={cx(
        'ink t-label inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-full',
        icon ? 'pl-3 pr-4' : 'px-3',
        className,
      )}
      style={
        {
          color: enabled ? color : 'rgb(11 18 32 / 0.38)',
          '--ink': 'color-mix(in srgb, currentColor 10%, transparent)',
        } as CSSProperties
      }
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

/**
 * Material IconButton — the app-bar and in-row kind. A 48px target with the
 * 40px press circle of Material 3.
 */
export function IconBtn({
  icon,
  onClick,
  size = 22,
  color = 'var(--color-ink)',
  tooltip,
  compact = false,
  disabled = false,
}: {
  icon: IconName
  onClick?: (() => void) | null
  size?: number
  color?: string
  tooltip: string
  compact?: boolean
  disabled?: boolean
}) {
  const enabled = Boolean(onClick) && !disabled
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      disabled={!enabled}
      onClick={onClick ?? undefined}
      className="ink grid shrink-0 place-items-center rounded-full"
      style={
        {
          width: compact ? 40 : 40,
          height: compact ? 40 : 40,
          margin: compact ? 0 : 4,
          color: enabled ? color : 'rgb(11 18 32 / 0.38)',
          '--ink': 'color-mix(in srgb, currentColor 10%, transparent)',
        } as CSSProperties
      }
    >
      <Icon name={icon} size={size} />
    </button>
  )
}
