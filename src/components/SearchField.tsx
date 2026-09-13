import { useId } from 'react'
import { IconBtn } from './Button'
import { Icon } from './Icon'

/**
 * A plain themed TextField with a search icon — the menu's and the door
 * list's search box.
 */
export function SearchField({
  value,
  onChange,
  hint,
  border = 'var(--color-line-strong)',
  clearable = false,
}: {
  value: string
  onChange: (value: string) => void
  hint: string
  border?: string
  clearable?: boolean
}) {
  const id = useId()
  return (
    <div
      className="flex items-center rounded-[14px] bg-surface focus-within:shadow-[inset_0_0_0_1.6px_var(--color-brand)]"
      style={{ boxShadow: `inset 0 0 0 1.2px ${border}` }}
    >
      <label htmlFor={id} className="grid w-12 shrink-0 place-items-center">
        <Icon name="round/search" size={20} color="var(--color-ink-faint)" />
        <span className="sr-only">{hint}</span>
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        enterKeyHint="search"
        autoComplete="off"
        className="t-body min-w-0 flex-1 bg-transparent py-4 pr-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
      />
      {clearable && value && <IconBtn icon="round/close" size={18} tooltip="Clear" onClick={() => onChange('')} />}
    </div>
  )
}
