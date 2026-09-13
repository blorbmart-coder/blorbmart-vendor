import type { CSSProperties } from 'react'

/**
 * Material 3 Switch with the Blorbmart theme: white thumb, brand track when
 * on, lineStrong track when off, no outline.
 *
 * It stops the click from reaching whatever it sits in, the way Flutter's
 * gesture arena does — flipping a dish off in the menu must not also open
 * the dish's editor.
 */
export function Switch({
  checked,
  onChange,
  label,
  trackOn,
  trackOff,
  thumbOn,
  thumbOff,
}: {
  checked: boolean
  onChange?: ((value: boolean) => void) | null
  label: string
  trackOn?: string
  trackOff?: string
  thumbOn?: string
  thumbOff?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={!onChange}
      onClick={(e) => {
        e.stopPropagation()
        onChange?.(!checked)
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="m3-switch"
      style={
        {
          '--track-on': trackOn,
          '--track-off': trackOff,
          '--thumb-on': thumbOn,
          '--thumb-off': thumbOff,
        } as CSSProperties
      }
    >
      <span className="track">
        <span className="thumb" />
      </span>
    </button>
  )
}
