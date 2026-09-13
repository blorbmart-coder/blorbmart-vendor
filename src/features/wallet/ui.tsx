import '@fontsource/raleway/latin-400.css'
import '@fontsource/raleway/latin-600.css'
import '@fontsource/raleway/latin-700.css'
import '@fontsource/raleway/latin-800.css'
import '@fontsource/raleway/latin-ext-400.css'
import '@fontsource/raleway/latin-ext-700.css'
import '@fontsource/raleway/latin-ext-800.css'
import { ArrowLeft, TickCircle, Warning2 } from 'iconsax-react'
import type { CSSProperties, ReactNode } from 'react'
import { useLayer, useNav } from '../../app/stack'
import { AppBar } from '../../components/AppBar'
import { cx } from '../../lib/cx'

/* ─────────────────────────────────────────────────────────────────────────
   The wallet screens predate the design system and keep their own look —
   Raleway, the #5156F1 brand, Iconsax icons and Material greys — so they are
   reproduced in that look rather than restyled. Raleway is loaded here, so
   only a vendor who opens the wallet ever downloads it.
   ───────────────────────────────────────────────────────────────────────── */

export const BRAND = '#5156F1'
export const GREEN = '#00B894'
export const RED = '#E74C3C'
export const ORANGE_TX = '#F39C12'

/** Flutter's Colors.grey / red / orange swatches. */
export const GREY = { 50: '#FAFAFA', 100: '#F5F5F5', 200: '#EEEEEE', 300: '#E0E0E0', 400: '#BDBDBD', 500: '#9E9E9E', 600: '#757575' }
export const MRED = { base: '#F44336', 50: '#FFEBEE', 200: '#EF9A9A', 400: '#EF5350' }
export const MORANGE = { base: '#FF9800', 50: '#FFF3E0', 200: '#FFCC80', 700: '#F57C00', 800: '#EF6C00' }

/** Raleway at a size, weight and colour. */
export function rw(size: number, weight = 400, color: string = 'inherit', extra: CSSProperties = {}): CSSProperties {
  return { fontFamily: 'var(--font-raleway)', fontSize: size, fontWeight: weight, color, ...extra }
}

export function WalletAppBar({ title, titleNode, actions }: { title?: string; titleNode?: ReactNode; actions?: ReactNode }) {
  const nav = useNav()
  const layer = useLayer()
  return (
    <AppBar
      background="#fff"
      leading={
        layer.canPop ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => nav.pop()}
            className="ink m-1 grid h-10 w-10 place-items-center rounded-full"
          >
            <ArrowLeft size={24} color="#000" />
          </button>
        ) : undefined
      }
      titleNode={titleNode ?? <h1 style={rw(20, 800, '#000')}>{title}</h1>}
      actions={actions}
    />
  )
}

/** The grey pill handle on the wallet's sheets. */
export const WalletHandle = () => (
  <div className="mx-auto my-3 h-1 w-9 rounded-[2px]" style={{ background: GREY[300] }} />
)

/** A full-width, 52px, 14-radius Material ElevatedButton. */
export function WalletButton({
  children,
  onClick,
  disabled = false,
  outline,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  outline?: string
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx('ink grid h-[52px] w-full place-items-center rounded-[14px]', className)}
      style={
        outline
          ? { border: `1px solid ${outline}`, color: outline, background: 'transparent' }
          : {
              background: disabled ? GREY[200] : BRAND,
              color: disabled ? 'rgb(0 0 0 / 0.38)' : '#fff',
              boxShadow: disabled ? undefined : '0 1px 3px rgb(0 0 0 / 0.2)',
              ['--ink' as string]: 'rgb(255 255 255 / 0.16)',
            }
      }
    >
      {children}
    </button>
  )
}

/** The success sheet at the end of a PIN change or a withdrawal. */
export function SuccessSheet({ title, message, onDone }: { title: string; message: string; onDone: () => void }) {
  return (
    <div className="pb-safe flex flex-col items-center px-5 pb-10">
      <WalletHandle />
      <div className="mt-2 grid h-[72px] w-[72px] place-items-center rounded-full" style={{ background: 'rgb(0 184 148 / 0.1)' }}>
        <TickCircle size={36} color={GREEN} />
      </div>
      <h2 className="mt-4" style={rw(22, 800, '#000')}>
        {title}
      </h2>
      <p className="mt-2.5 text-center" style={rw(13, 400, GREY[600], { lineHeight: 1.6 })}>
        {message}
      </p>
      <div className="mt-6 w-full">
        <WalletButton onClick={onDone}>
          <span style={rw(16, 700)}>Done</span>
        </WalletButton>
      </div>
    </div>
  )
}

/** The four PIN boxes: a dot for each digit typed, the next one lit. */
export function PinBoxes({ length, width, height, gap, dot, radius }: {
  length: number
  width: number
  height: number
  gap: number
  dot: number
  radius: number
}) {
  return (
    <div className="flex justify-center" aria-label={`${length} of 4 digits entered`}>
      {[0, 1, 2, 3].map((i) => {
        const filled = i < length
        const active = i === length
        return (
          <div
            key={i}
            className="grid place-items-center transition-[background-color,border-color] duration-150"
            style={{
              width,
              height,
              margin: `0 ${gap}px`,
              borderRadius: radius,
              background: filled ? 'rgb(81 86 241 / 0.08)' : GREY[50],
              border: `${filled ? 1.5 : 1}px solid ${filled ? BRAND : active ? 'rgb(81 86 241 / 0.5)' : GREY[300]}`,
            }}
          >
            {filled ? (
              <span className="rounded-full" style={{ width: dot, height: dot, background: BRAND }} />
            ) : (
              <span style={rw(dot * 2, 400, GREY[400])}>·</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The 3×4 number pad, with ⌫ in the corner. */
export function NumPad({ onKey, disabled = false }: { onKey: (key: string) => void; disabled?: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {keys.map((key, i) =>
        key === '' ? (
          <span key={i} />
        ) : (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-label={key === '⌫' ? 'Delete' : key}
            onClick={() => onKey(key)}
            className="ink grid aspect-[2/1] place-items-center rounded-[12px]"
            style={{ background: GREY[50], border: `1px solid ${GREY[200]}` }}
          >
            <span style={rw(key === '⌫' ? 18 : 22, 700, key === '⌫' ? MRED[400] : '#000')}>{key}</span>
          </button>
        ),
      )}
    </div>
  )
}

export function ErrorView({ message, onRetry, iconButton = false }: { message: string; onRetry: () => void; iconButton?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <Warning2 size={56} color={MRED.base} />
      <p className="mt-4" style={rw(14, 400, GREY[600])}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="ink mt-6 flex h-10 items-center gap-2 rounded-full px-6"
        style={{ background: BRAND, color: '#fff', boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)' }}
      >
        {iconButton && <span aria-hidden="true">⟳</span>}
        <span style={rw(14, 600)}>Retry</span>
      </button>
    </div>
  )
}

/** A horizontally scrolling row of filter chips. */
export function FilterChips<T extends string | null>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
      {options.map(([key, label]) => {
        const selected = value === key
        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className="shrink-0 rounded-[20px] px-4 py-2 transition-colors duration-150"
            style={{
              background: selected ? BRAND : 'transparent',
              border: `1px solid ${selected ? BRAND : GREY[300]}`,
              ...rw(12, 600, selected ? '#fff' : GREY[600]),
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function DetailRow({ label, value, flex = [2, 3] }: { label: string; value: string; flex?: [number, number] }) {
  return (
    <div className="flex items-center py-2.5">
      <span style={{ flex: flex[0], ...rw(13, 400, GREY[500]) }}>{label}</span>
      <span className="text-right" style={{ flex: flex[1], ...rw(13, 600, '#000') }}>
        {value}
      </span>
    </div>
  )
}
