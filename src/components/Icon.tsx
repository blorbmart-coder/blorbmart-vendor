import type { CSSProperties } from 'react'
import { ICONS, type IconName } from './icons.generated'

export type { IconName }

/**
 * A Material icon, drawn from inline path data.
 *
 * The markup comes from icons.generated.ts, which is written at build time
 * from Google's own SVG files — never from anything a user or the network
 * supplied — so setting it as HTML is safe.
 */
export function Icon({
  name,
  size = 24,
  color,
  className,
  style,
}: {
  name: IconName
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: 'none', color, ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}
