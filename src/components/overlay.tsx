import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cx } from '../lib/cx'
import { haptic } from '../lib/haptics'
import { BlorbButton } from './Button'
import { Icon, type IconName } from './Icon'
import { SheetHandle } from './ui'

/* ─────────────────────────────────────────────────────────────────────────
   Overlays: sheets, dialogs, menus and the toast.

   Imperative, like Flutter's showModalBottomSheet and showDialog: a call
   opens one and returns a promise that resolves with whatever it was closed
   with. The promise resolves the moment it is closed — before the exit
   animation, as Navigator.pop does — so the caller can carry on while the
   sheet is still sliding away.
   ───────────────────────────────────────────────────────────────────────── */

type Close = (value?: unknown) => void

/** Lets an open sheet refuse to be dismissed while it is busy — PopScope. */
export type SetDismissible = (dismissible: boolean) => void

interface Entry {
  id: number
  kind: 'sheet' | 'dialog' | 'menu'
  render: (close: Close, setDismissible: SetDismissible) => ReactNode
  resolve: (value: unknown) => void
  closing: boolean
  dismissible: boolean
  fill: boolean
  handle: boolean
  background: string
  width?: number
  anchor?: { top: number; right: number }
}

function setDismissible(id: number, dismissible: boolean) {
  entries = entries.map((e) => (e.id === id ? { ...e, dismissible } : e))
  notify()
}

let entries: Entry[] = []
let nextId = 1
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

const EXIT_MS = { sheet: 200, dialog: 75, menu: 120 } as const

function open<T>(
  kind: Entry['kind'],
  render: (close: (value?: T) => void, setDismissible: SetDismissible) => ReactNode,
  opts: Partial<Pick<Entry, 'dismissible' | 'fill' | 'handle' | 'background' | 'anchor' | 'width'>> = {},
): Promise<T | undefined> {
  return new Promise((resolve) => {
    entries = [
      ...entries,
      {
        id: nextId++,
        kind,
        width: opts.width,
        render: render as Entry['render'],
        resolve: resolve as (value: unknown) => void,
        closing: false,
        dismissible: opts.dismissible ?? true,
        fill: opts.fill ?? false,
        handle: opts.handle ?? true,
        background: opts.background ?? 'var(--color-surface)',
        anchor: opts.anchor,
      },
    ]
    notify()
  })
}

function close(id: number, value?: unknown) {
  const entry = entries.find((e) => e.id === id)
  if (!entry || entry.closing) return
  entry.resolve(value)
  entries = entries.map((e) => (e.id === id ? { ...e, closing: true } : e))
  notify()
  window.setTimeout(() => {
    entries = entries.filter((e) => e.id !== id)
    notify()
  }, EXIT_MS[entry.kind])
}

/**
 * A bottom sheet in the app's chrome: rounded top, drag handle, scrim, and a
 * body that never exceeds 92% of the screen — showBlorbSheet.
 *
 * `fill` gives the sheet its full height, for editors whose body is a
 * scrolling list above a pinned action bar.
 */
export function showSheet<T>(
  render: (close: (value?: T) => void, setDismissible: SetDismissible) => ReactNode,
  opts: { dismissible?: boolean; fill?: boolean; handle?: boolean; background?: string } = {},
) {
  return open<T>('sheet', render, opts)
}

export function showDialog<T>(
  render: (close: (value?: T) => void) => ReactNode,
  opts: { dismissible?: boolean; width?: number } = {},
) {
  return open<T>('dialog', render, opts)
}

/** A Material popup menu anchored to the element that opened it. */
export function showMenu<T extends string>(
  anchor: HTMLElement,
  items: Array<{ value: T; label: string; icon?: IconName }>,
): Promise<T | undefined> {
  const frame = anchor.closest('.app-frame')?.getBoundingClientRect() ?? document.body.getBoundingClientRect()
  const rect = anchor.getBoundingClientRect()
  return open<T>(
    'menu',
    (done) => (
      <div role="menu" className="menu-pop min-w-[112px] max-w-[280px] rounded-[4px] bg-sunken py-2 shadow-md">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="menuitem"
            onClick={() => done(item.value)}
            className="ink flex h-12 w-full items-center gap-2.5 px-3 text-left"
          >
            {item.icon && <Icon name={item.icon} size={19} color="var(--color-ink-muted)" />}
            <span className="t-label-lg">{item.label}</span>
          </button>
        ))}
      </div>
    ),
    { anchor: { top: rect.top - frame.top, right: frame.right - rect.right } },
  )
}

/** The house confirmation dialog — confirmBlorb. */
export async function confirmBlorb({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  icon = 'round/help_outline',
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  icon?: IconName
}): Promise<boolean> {
  const tone = destructive ? 'var(--color-danger)' : 'var(--color-brand)'
  const result = await showDialog<boolean>((done) => (
    <div className="flex flex-col items-center p-6 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)` }}
      >
        <Icon name={icon} size={26} color={tone} />
      </div>
      <h2 className="t-h2 mt-4">{title}</h2>
      <p className="t-body mt-2">{message}</p>
      <div className="mt-6 flex w-full gap-3">
        <BlorbButton label={cancelLabel} kind="outline" size="md" onClick={() => done(false)} />
        <BlorbButton
          label={confirmLabel}
          kind={destructive ? 'danger' : 'brand'}
          size="md"
          onClick={() => done(true)}
        />
      </div>
    </div>
  ))
  return result ?? false
}

/* ── Toast ─────────────────────────────────────────────────────────────── */

export type ToastTone = 'neutral' | 'success' | 'danger' | 'brand'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
  icon?: IconName
  closing: boolean
  lift: number
  background?: string
  plain: boolean
}

let current: ToastState | null = null
let toastTimer = 0
const toastSubs = new Set<() => void>()
const notifyToast = () => toastSubs.forEach((fn) => fn())

const TOAST: Record<ToastTone, [string, IconName]> = {
  success: ['var(--color-success)', 'round/check_circle'],
  danger: ['var(--color-danger)', 'round/error'],
  brand: ['var(--color-brand)', 'round/info'],
  neutral: ['var(--color-ink)', 'round/info'],
}

function dismissToast(id: number) {
  if (!current || current.id !== id || current.closing) return
  current = { ...current, closing: true }
  notifyToast()
  window.setTimeout(() => {
    if (current?.id === id) {
      current = null
      notifyToast()
    }
  }, 150)
}

/**
 * A floating toast that reads as part of the design system — showBlorbToast.
 * Replaces whatever is showing, floats above the page's bottom bar, and
 * dismisses on a tap.
 */
export function toast(
  message: string,
  {
    tone = 'neutral',
    icon,
    duration = 3000,
    background,
    plain = false,
  }: {
    tone?: ToastTone
    icon?: IconName
    duration?: number
    /** A colour of its own — the wallet's Material red and green. */
    background?: string
    /** A stock SnackBar: no icon, no haptic, the wallet's typeface. */
    plain?: boolean
  } = {},
) {
  const bar = document.querySelector<HTMLElement>('[data-top-layer] [data-bottom-bar]')
  if (!plain) haptic.medium()
  window.clearTimeout(toastTimer)
  const id = nextId++
  current = {
    id,
    message,
    tone,
    icon,
    closing: false,
    lift: bar ? bar.getBoundingClientRect().height : 0,
    background,
    plain,
  }
  notifyToast()
  toastTimer = window.setTimeout(() => dismissToast(id), duration)
}

/* ── Host ──────────────────────────────────────────────────────────────── */

/** Whether any overlay is open — the page stack goes inert beneath one. */
export function useOverlayOpen() {
  return useSyncExternalStore(subscribe, () => entries.some((e) => !e.closing))
}

export function OverlayHost() {
  const list = useSyncExternalStore(subscribe, () => entries)
  const toastState = useSyncExternalStore(
    (fn) => {
      toastSubs.add(fn)
      return () => toastSubs.delete(fn)
    },
    () => current,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const top = [...entries].reverse().find((x) => !x.closing)
      if (top?.dismissible) close(top.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {list.map((entry) =>
        entry.kind === 'sheet' ? (
          <SheetFrame key={entry.id} entry={entry} />
        ) : entry.kind === 'dialog' ? (
          <DialogFrame key={entry.id} entry={entry} />
        ) : (
          <MenuFrame key={entry.id} entry={entry} />
        ),
      )}
      {toastState && <ToastView toast={toastState} />}
    </>
  )
}

function useFocusOnOpen() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = ref.current
    const previous = document.activeElement as HTMLElement | null
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    return () => previous?.focus?.({ preventScroll: true })
  }, [])
  return ref
}

/** Nearest scrollable that can actually scroll, between a target and the sheet. */
function scrollableBetween(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target instanceof HTMLElement ? target : null
  while (el && el !== stop) {
    if (el.matches('input, textarea, select, [role="slider"]')) return true
    const overflow = getComputedStyle(el).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true
    el = el.parentElement
  }
  return false
}

function SheetFrame({ entry }: { entry: Entry }) {
  const panel = useFocusOnOpen()
  const drag = useRef<{ y: number; t: number; dy: number; active: boolean; pointer: number } | null>(null)

  const dismiss = () => entry.dismissible && close(entry.id)

  // Dragging down closes the sheet, as enableDrag does — from anywhere that
  // is not itself a scrolling list, which keeps its own gesture.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!entry.dismissible || e.button !== 0) return
    if (scrollableBetween(e.target, e.currentTarget)) return
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, active: false, pointer: e.pointerId }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = panel.current
    if (!d || !el || e.pointerId !== d.pointer) return
    d.dy = Math.max(0, e.clientY - d.y)
    if (!d.active && d.dy > 6) {
      d.active = true
      el.setPointerCapture(e.pointerId)
      el.dataset.dragging = ''
    }
    if (d.active) el.style.translate = `0 ${d.dy}px`
  }
  const onPointerUp = () => {
    const d = drag.current
    const el = panel.current
    drag.current = null
    if (!d || !el || !d.active) return
    delete el.dataset.dragging
    const velocity = d.dy / Math.max(1, performance.now() - d.t)
    if (d.dy > el.offsetHeight * 0.5 || velocity > 0.7) {
      el.style.transition = 'translate 200ms cubic-bezier(0.4, 0, 1, 1)'
      el.style.translate = '0 100%'
      close(entry.id)
    } else {
      el.style.transition = 'translate 200ms cubic-bezier(0.2, 0, 0, 1)'
      el.style.translate = ''
      window.setTimeout(() => {
        if (el) el.style.transition = ''
      }, 220)
    }
  }

  return (
    <div className="absolute inset-0 z-40">
      <div className="scrim" data-closing={entry.closing ? '' : undefined} onClick={dismiss} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-closing={entry.closing ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cx('sheet outline-none', entry.fill && 'h-[92%]')}
        style={{ background: entry.background } as CSSProperties}
      >
        {entry.handle && <SheetHandle />}
        <div className="flex min-h-0 flex-1 flex-col">
          {entry.render(
            (v) => close(entry.id, v),
            (d) => setDismissible(entry.id, d),
          )}
        </div>
      </div>
    </div>
  )
}

function DialogFrame({ entry }: { entry: Entry }) {
  const panel = useFocusOnOpen()
  return (
    <div className="absolute inset-0 z-50">
      <div className="scrim" data-closing={entry.closing ? '' : undefined} />
      <div
        className="dialog-in absolute inset-0 grid place-items-center px-8 py-6"
        data-closing={entry.closing ? '' : undefined}
        onClick={() => entry.dismissible && close(entry.id)}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="w-full min-w-[280px] max-w-[560px] rounded-[28px] bg-surface outline-none"
          style={entry.width ? { maxWidth: entry.width } : undefined}
        >
          {entry.render(
            (v) => close(entry.id, v),
            () => undefined,
          )}
        </div>
      </div>
    </div>
  )
}

function MenuFrame({ entry }: { entry: Entry }) {
  const panel = useFocusOnOpen()
  return (
    <div
      className="absolute inset-0 z-50"
      onClick={() => close(entry.id)}
      style={{ opacity: entry.closing ? 0 : 1, transition: 'opacity 120ms linear' }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute outline-none"
        style={{ top: entry.anchor?.top ?? 8, right: entry.anchor?.right ?? 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        {entry.render(
          (v) => close(entry.id, v),
          () => undefined,
        )}
      </div>
    </div>
  )
}

function ToastView({ toast: t }: { toast: ToastState }) {
  const [bg, defaultIcon] = TOAST[t.tone]
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[60] px-4"
      style={{ bottom: t.lift ? t.lift + 16 : 'calc(16px + env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        key={t.id}
        data-closing={t.closing ? '' : undefined}
        onClick={() => dismissToast(t.id)}
        className="toast pointer-events-auto flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left"
        style={{ background: t.background ?? bg }}
      >
        {!t.plain && <Icon name={t.icon ?? defaultIcon} size={20} color="#fff" />}
        <span
          className={t.plain ? 'flex-1 font-raleway text-[14px] text-white' : 't-label flex-1 text-white'}
          style={{ lineHeight: 1.35 }}
        >
          {t.message}
        </span>
      </button>
    </div>
  )
}
