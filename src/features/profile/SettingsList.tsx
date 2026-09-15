import { Children, type ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icon'
import { Card, Divider } from '../../components/ui'

/** A titled card of settings rows, divided. Used by My store and Store details. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  // Flattened, so rows mapped from a list divide like rows written by hand.
  const tiles = Children.toArray(children)
  return (
    <section>
      <h2 className="t-overline pb-2 pl-1">{title.toUpperCase()}</h2>
      <Card padding={0} clip>
        {tiles.map((tile, i) => (
          <div key={i}>
            {tile}
            {i !== tiles.length - 1 && <Divider indent={60} />}
          </div>
        ))}
      </Card>
    </section>
  )
}

export function Tile({
  icon,
  label,
  subtitle,
  onClick,
  danger = false,
  locked = false,
}: {
  icon: IconName
  label: string
  subtitle?: string
  onClick: () => void
  danger?: boolean
  /** Deliberately fixed: a padlock instead of a chevron, so nobody expects an editor. */
  locked?: boolean
}) {
  const color = danger ? 'var(--color-danger)' : 'var(--color-ink-strong)'
  return (
    <button type="button" onClick={onClick} className="ink flex w-full items-center p-4 text-left">
      <Icon name={icon} size={21} color={color} />
      <span className="ml-4 min-w-0 flex-1">
        <span className="t-h4 block" style={{ color }}>
          {label}
        </span>
        {subtitle && <span className="t-caption-sm mt-0.5 block truncate">{subtitle}</span>}
      </span>
      {locked ? (
        <Icon name="outlined/lock" size={18} color="var(--color-ink-faint)" />
      ) : (
        !danger && <Icon name="round/chevron_right" color="var(--color-ink-faint)" />
      )}
    </button>
  )
}
