import {
  useCallback,
  useId,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cx } from '../lib/cx'
import { digitsOnly } from '../lib/format'
import type { University } from '../services/universities'
import { Icon, type IconName } from './Icon'

type InputMode = HTMLAttributes<HTMLInputElement>['inputMode']

/**
 * Moves focus to the next field in the same page, or dismisses the keyboard
 * on the last one — textInputAction.next and .done.
 */
function focusNext(from: HTMLElement) {
  const scope = from.closest('[data-layer], [role="dialog"]') ?? document.body
  const fields = Array.from(
    scope.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
    ),
  )
  const next = fields[fields.indexOf(from) + 1]
  if (next) next.focus()
  else from.blur()
}

/**
 * The one text field in the vendor app — VendorField.
 *
 * Label above, a filled box that turns white and brand-outlined while
 * focused, an optional naira prefix for prices, and a helper line that stays
 * put rather than being replaced by an error.
 */
export function VendorField({
  value,
  onChange,
  label,
  hint,
  icon,
  prefix,
  suffix,
  helper,
  error,
  obscure = false,
  inputMode,
  autoComplete,
  action = 'next',
  onSubmit,
  disabled = false,
  maxLength,
  maxLines = 1,
  digits = false,
  autoFocus = false,
  capitalize = 'none',
}: {
  value: string
  onChange?: (value: string) => void
  label: string
  hint?: string
  icon?: IconName
  prefix?: string
  suffix?: ReactNode
  helper?: string | null
  error?: string | null
  obscure?: boolean
  inputMode?: InputMode
  autoComplete?: string
  action?: 'next' | 'done' | 'newline'
  onSubmit?: () => void
  disabled?: boolean
  maxLength?: number
  maxLines?: number
  digits?: boolean
  autoFocus?: boolean
  capitalize?: 'none' | 'words' | 'sentences'
}) {
  const id = useId()
  const [hidden, setHidden] = useState(obscure)
  const multiline = !obscure && maxLines > 1

  const handle = (raw: string) => {
    let next = digits ? digitsOnly(raw) : raw
    if (maxLength) next = next.slice(0, maxLength)
    onChange?.(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || (multiline && action === 'newline') || e.nativeEvent.isComposing) return
    if (multiline && !e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (onSubmit) onSubmit()
    else if (action === 'done') e.currentTarget.blur()
    else focusNext(e.currentTarget)
  }

  const quiet = inputMode === 'email' || inputMode === 'numeric' || inputMode === 'tel' || obscure
  const shared = {
    id,
    value,
    disabled,
    autoFocus,
    maxLength,
    placeholder: hint,
    autoComplete: autoComplete ?? 'off',
    autoCapitalize: capitalize === 'none' ? 'off' : capitalize,
    spellCheck: quiet ? false : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || helper ? `${id}-sub` : undefined,
    enterKeyHint: (multiline && action === 'newline' ? 'enter' : action) as 'next' | 'done' | 'enter',
    onKeyDown,
    className: cx(
      'min-w-0 flex-1 bg-transparent py-4 text-[16px] font-semibold leading-6 text-ink outline-none',
      'placeholder:text-[14px] placeholder:font-medium placeholder:text-ink-faint',
      icon || prefix ? 'pl-0' : 'pl-4',
      obscure || suffix ? 'pr-0' : 'pr-4',
      multiline && 'resize-none',
    ),
  }

  return (
    <div className="group">
      <label htmlFor={id} className="t-label-sm block text-ink-muted group-focus-within:text-brand">
        {label}
      </label>
      <div
        data-error={error ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        className={cx(
          'mt-2 flex rounded-[14px] bg-sunken transition-[background-color,box-shadow] duration-150',
          multiline ? 'items-start' : 'items-center',
          'shadow-[inset_0_0_0_1.2px_var(--color-line-strong)]',
          'focus-within:bg-surface focus-within:shadow-[inset_0_0_0_1.6px_var(--color-brand)]',
          'data-[error=true]:shadow-[inset_0_0_0_1.2px_var(--color-danger)]',
          'data-[error=true]:focus-within:shadow-[inset_0_0_0_1.6px_var(--color-danger)]',
          'data-[disabled=true]:shadow-[inset_0_0_0_1.2px_var(--color-line)]',
        )}
      >
        {icon && (
          <span className={cx('grid w-12 shrink-0 place-items-center', multiline && 'h-14')}>
            <Icon name={icon} size={20} className="text-ink-faint group-focus-within:text-brand" />
          </span>
        )}
        {prefix && (
          <span className={cx('t-body-lg whitespace-pre font-bold text-ink-muted', icon ? '' : 'pl-4')}>{prefix}</span>
        )}
        {multiline ? (
          <textarea {...shared} rows={maxLines} onChange={(e) => handle(e.target.value)} />
        ) : (
          <input
            {...shared}
            type={obscure && hidden ? 'password' : 'text'}
            inputMode={inputMode}
            onChange={(e) => handle(e.target.value)}
          />
        )}
        {obscure ? (
          <button
            type="button"
            aria-label={hidden ? 'Show password' : 'Hide password'}
            onClick={() => setHidden((h) => !h)}
            className="ink grid h-12 w-12 shrink-0 place-items-center rounded-full"
          >
            <Icon
              name={hidden ? 'round/visibility_off' : 'round/visibility'}
              size={20}
              color="var(--color-ink-faint)"
            />
          </button>
        ) : (
          suffix
        )}
      </div>
      {error && (
        <p id={`${id}-sub`} role="alert" className="t-caption-sm px-4 pt-1.5 text-danger">
          {error}
        </p>
      )}
      {helper && (
        <p id={error ? undefined : `${id}-sub`} className="t-caption-sm mt-1.5">
          {helper}
        </p>
      )}
    </div>
  )
}

/** Validators shared across the vendor app — VendorValidate. */
export const Validate = {
  email(value: string): string | null {
    const v = value.trim()
    if (!v) return 'Enter your email address'
    if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) return 'That email address does not look right'
    return null
  },
  password(value: string): string | null {
    if (!value) return 'Enter a password'
    if (value.length < 8) return 'Use at least 8 characters'
    if (!/\d/.test(value)) return 'Include at least one number'
    return null
  },
  required(value: string, field: string): string | null {
    return value.trim() ? null : `Enter your ${field}`
  },
  phone(value: string): string | null {
    const digitsOnlyValue = value.replace(/\D/g, '')
    if (!digitsOnlyValue) return 'Enter your phone number'
    const local = digitsOnlyValue.startsWith('234') ? `0${digitsOnlyValue.slice(3)}` : digitsOnlyValue
    if (local.length !== 11 || !local.startsWith('0')) return 'Enter a valid 11-digit phone number'
    return null
  },
}

/**
 * A Flutter Form in miniature: errors appear when validate() runs and stay
 * until it runs again, rather than flickering on every keystroke.
 */
export function useValidation<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string | null>>>({})
  const validate = useCallback((results: Record<K, string | null>) => {
    setErrors(results)
    return Object.values(results).every((r) => !r)
  }, [])
  return { errors, validate }
}

/**
 * The campus picker — VendorCampusField. A fixed list rather than free text,
 * because it decides which students can find this shop at all.
 */
export function CampusField({
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
  error,
  label = 'Campus you operate on',
}: {
  options: University[]
  value: string | null
  onChange: (value: string) => void
  loading?: boolean
  disabled?: boolean
  error?: string | null
  label?: string
}) {
  const id = useId()
  return (
    <div className="group">
      <label htmlFor={id} className="t-label-sm block text-ink-muted">
        {label}
      </label>
      <div
        data-error={error ? 'true' : undefined}
        className={cx(
          'relative mt-2 flex items-center rounded-[14px] bg-surface',
          'shadow-[inset_0_0_0_1.2px_var(--color-line-strong)]',
          'focus-within:shadow-[inset_0_0_0_1.6px_var(--color-brand)]',
          'data-[error=true]:shadow-[inset_0_0_0_1.2px_var(--color-danger)]',
        )}
      >
        <span className="grid w-12 shrink-0 place-items-center">
          <Icon name="outlined/school" size={20} color="var(--color-ink-faint)" />
        </span>
        <select
          id={id}
          required
          value={value ?? ''}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={cx(
            'min-w-0 flex-1 appearance-none truncate bg-transparent py-4 pr-12 text-[16px] leading-6 outline-none disabled:cursor-default',
            // Keyed off the value, not :invalid — a disabled select (while the
            // list loads) is never :invalid, and the hint would read as a value.
            value ? 'font-semibold text-ink' : 'font-medium text-ink-faint',
          )}
        >
          <option value="" disabled hidden>
            {loading ? 'Loading campuses…' : 'Select your campus'}
          </option>
          {options.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.label}
            </option>
          ))}
        </select>
        <Icon
          name="round/arrow_drop_down"
          size={24}
          className="pointer-events-none absolute right-3"
          color={disabled || loading ? '#bdbdbd' : '#616161'}
        />
      </div>
      {error && <p className="t-caption-sm px-4 pt-1.5 text-danger">{error}</p>}
      <p className="t-caption-sm mt-1.5">Students on this campus are the ones who will see your shop.</p>
    </div>
  )
}
