import type { CSSProperties, ReactNode } from 'react'
import { useLayer, useNav } from '../app/stack'
import { cx } from '../lib/cx'
import { IconBtn } from './Button'
import { Icon, type IconName } from './Icon'

/**
 * The Material AppBar as the theme sets it: white, flat, 56px, the title in
 * h2 twenty points from its leading edge, and an implied back arrow whenever
 * the page has somewhere to go back to.
 */
export function AppBar({
  title,
  titleNode,
  back,
  onBack,
  leading,
  actions,
  bottom,
  background = 'var(--color-surface)',
  color,
}: {
  title?: string
  titleNode?: ReactNode
  back?: boolean
  onBack?: () => void
  leading?: ReactNode
  actions?: ReactNode
  bottom?: ReactNode
  background?: string
  color?: string
}) {
  const layer = useLayer()
  const nav = useNav()
  const showBack = leading === undefined && (back ?? layer.canPop)
  const lead =
    leading ??
    (showBack ? (
      <IconBtn icon="filled/arrow_back" tooltip="Back" color={color} onClick={onBack ?? (() => nav.pop())} />
    ) : null)

  return (
    <header className="pt-safe relative z-10 shrink-0" style={{ background, color }}>
      <div className="flex h-14 items-center">
        {lead && <div className="flex w-14 shrink-0 justify-center">{lead}</div>}
        <div className="min-w-0 flex-1 px-5">
          {titleNode ?? (
            <h1 className="t-h2 truncate" style={color ? { color } : undefined}>
              {title}
            </h1>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
      </div>
      {bottom}
    </header>
  )
}

/** A page: header, a scrolling body, and optionally a pinned bottom bar. */
export function Page({
  children,
  background = 'var(--color-canvas)',
  className,
}: {
  children: ReactNode
  background?: string
  className?: string
}) {
  return (
    <div className={cx('flex h-full min-h-0 flex-col', className)} style={{ background }}>
      {children}
    </div>
  )
}

/** The scrolling part of a page. Floating buttons position against it. */
export function PageBody({
  children,
  className,
  style,
  scroll = true,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  scroll?: boolean
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cx(scroll ? 'scroll-y' : 'overflow-hidden', 'flex min-h-0 flex-1 flex-col', className)} style={style}>
        {children}
      </div>
    </div>
  )
}

/**
 * The white bar pinned under a form, with the lift shadow. Toasts float
 * above it rather than over the button a vendor is about to press.
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-bottom-bar=""
      className={cx('relative z-10 shrink-0 bg-surface px-5 pt-4 shadow-lift', className)}
      style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

/** Material 3 extended FloatingActionButton. */
export function Fab({
  icon,
  label,
  onClick,
  labelClass = 't-label',
}: {
  icon: IconName
  label: string
  onClick: () => void
  labelClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ink absolute bottom-4 right-4 z-10 flex h-14 items-center gap-2 rounded-[16px] bg-brand pl-4 pr-5 text-white"
      style={
        {
          boxShadow: '0 1px 3px rgb(16 24 40 / 0.16), 0 4px 10px 3px rgb(16 24 40 / 0.08)',
          '--ink': 'rgb(255 255 255 / 0.12)',
        } as CSSProperties
      }
    >
      <Icon name={icon} size={24} />
      <span className={cx(labelClass, 'text-white')}>{label}</span>
    </button>
  )
}
