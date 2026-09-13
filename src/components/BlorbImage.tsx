import { useState, type CSSProperties } from 'react'
import { Icon, type IconName } from './Icon'

const DPR = typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 1)

/**
 * Asks Cloudinary for the image at the size it will be drawn.
 *
 * The web's version of Flutter's memCacheWidth, and a bigger win: that only
 * saved memory after the full photo had downloaded, where this saves the
 * download. A 62px menu thumbnail fetches ~190px of WebP or AVIF instead of
 * the 1400px JPEG the vendor uploaded. Widths are bucketed so every row in a
 * list asks for the same URL and the browser cache actually hits.
 *
 * URLs that already carry a transformation, or live anywhere else, are left
 * exactly as they are.
 */
export function sizedUrl(url: string, logicalWidth: number): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  if (!m) return url
  const rest = m[2]
  const firstSegment = rest.split('/')[0]
  if (/^[a-z]{1,3}_/.test(firstSegment) && !/^v\d+$/.test(firstSegment)) return url
  const px = Math.min(1400, Math.max(80, Math.ceil((logicalWidth * DPR) / 80) * 80))
  return `${m[1]}c_limit,w_${px},q_auto,f_auto/${rest}`
}

/**
 * Network image with a calm three-state life: a tinted placeholder, a
 * cross-faded reveal, and a branded fallback that never shows a broken icon.
 */
export function BlorbImage({
  url,
  width,
  height,
  radius,
  fallbackIcon = 'round/restaurant',
  fallbackLabel,
  decodeWidth,
  className,
  style,
  fit = 'cover',
}: {
  url?: string | null
  width?: number
  height?: number
  radius?: number | string
  fallbackIcon?: IconName
  fallbackLabel?: string
  decodeWidth?: number
  className?: string
  style?: CSSProperties
  fit?: 'cover' | 'contain'
}) {
  const src = url?.trim() ?? ''
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const box: CSSProperties = {
    width: width ?? '100%',
    height: height ?? '100%',
    borderRadius: radius,
    overflow: 'hidden',
    background: 'var(--color-sunken)',
    flex: 'none',
    ...style,
  }

  if (!src || failed === src) {
    const letter = (fallbackLabel ?? '').trim()
    return (
      <div className={className} style={{ ...box, display: 'grid', placeItems: 'center' }}>
        {letter ? (
          <span className="t-h1" style={{ color: 'var(--color-ink-faint)' }}>
            {Array.from(letter)[0].toUpperCase()}
          </span>
        ) : (
          <Icon name={fallbackIcon} size={24} color="var(--color-ink-faint)" />
        )}
      </div>
    )
  }

  const isLoaded = loaded === src
  return (
    <div className={className} style={box}>
      <img
        key={src}
        src={sizedUrl(src, width ?? decodeWidth ?? 480)}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        // An image already in the browser cache is complete before React
        // attaches onLoad. Marking it loaded here is what stops a cached
        // thumbnail flashing grey and fading in on every revisit.
        ref={(el) => {
          if (el && el.complete && el.naturalWidth > 0 && loaded !== src) setLoaded(src)
        }}
        onLoad={() => setLoaded(src)}
        onError={() => setFailed(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}
      />
    </div>
  )
}
