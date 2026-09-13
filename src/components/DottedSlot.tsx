import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'

/**
 * An empty upload target. A dashed outline — 7 on, 5 off, like the Flutter
 * painter — says "put something here" more clearly than a grey box, which
 * reads as broken.
 */
export function DottedSlot({
  uploading = false,
  label,
  icon,
  compact = false,
}: {
  uploading?: boolean
  label: string
  icon: IconName
  compact?: boolean
}) {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <rect
          x="0.75"
          y="0.75"
          rx="14"
          ry="14"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1.5"
          strokeDasharray="7 5"
          style={{ width: 'calc(100% - 1.5px)', height: 'calc(100% - 1.5px)' }}
        />
      </svg>
      {uploading ? (
        <Spinner stroke={compact ? 2.4 : 4} />
      ) : (
        <div className="flex flex-col items-center">
          <div
            className="grid place-items-center rounded-full bg-brand-soft"
            style={{ width: compact ? 34 : 38, height: compact ? 34 : 38 }}
          >
            <Icon name={icon} size={compact ? 17 : 19} color="var(--color-brand)" />
          </div>
          <span className={compact ? 't-caption-sm mt-1.5 text-brand' : 't-label-sm mt-2 text-brand'}>{label}</span>
        </div>
      )}
    </div>
  )
}
