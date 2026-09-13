import { useState, type CSSProperties, type ReactNode } from 'react'
import { TextButton } from '../../components/Button'
import { BlorbImage } from '../../components/BlorbImage'
import { DottedSlot } from '../../components/DottedSlot'
import { VendorField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { FadeSlideIn, staggerFor, SwapIn } from '../../components/motion'
import { showSheet, toast } from '../../components/overlay'
import { Slider } from '../../components/Slider'
import { Spinner } from '../../components/Spinner'
import { Switch } from '../../components/Switch'
import { Pill } from '../../components/ui'
import { BUSINESS, BUSINESS_TYPES, hoursLabel, type BusinessType, type StoreProfile } from '../../data/models'
import { etaWindow } from '../../lib/format'
import { haptic } from '../../lib/haptics'

/** Every step shares identical padding and scroll behaviour. */
function StepBody({ children }: { children: ReactNode }) {
  return <div className="px-5 pb-8 pt-2">{children}</div>
}

/* ── Step 1 — business type ────────────────────────────────────────────── */

/**
 * The most consequential choice in the flow, so three large cards rather
 * than a dropdown. Once the store is live it stops being a question: the
 * answer is still shown, but only the chosen card, and it no longer moves.
 */
export function StepBusinessType({
  selected,
  onSelect,
  locked,
}: {
  selected: BusinessType
  onSelect: (type: BusinessType) => void
  locked: boolean
}) {
  return (
    <StepBody>
      {BUSINESS_TYPES.map((type, i) =>
        locked && type !== selected ? null : (
          <FadeSlideIn key={type} delay={staggerFor(i)} className="mb-3">
            <TypeCard type={type} selected={type === selected} onClick={locked ? undefined : () => onSelect(type)} />
          </FadeSlideIn>
        ),
      )}
      <div
        className="mt-4 flex items-center gap-3 rounded-[14px] p-4"
        style={{ background: locked ? 'var(--color-sunken)' : 'var(--color-brand-softer)' }}
      >
        <Icon
          name={locked ? 'outlined/lock' : 'outlined/info'}
          size={19}
          color={locked ? 'var(--color-ink-muted)' : 'var(--color-brand)'}
        />
        <p
          className="t-caption-sm flex-1"
          style={{ color: locked ? 'var(--color-ink-muted)' : 'var(--color-brand-ink)' }}
        >
          {locked
            ? 'Your business type is set and cannot be changed. Message Blorbmart if this is wrong.'
            : 'Choose carefully. This decides which part of the app your store lives in, and it cannot be changed once your store is live.'}
        </p>
      </div>
    </StepBody>
  )
}

function TypeCard({ type, selected, onClick }: { type: BusinessType; selected: boolean; onClick?: () => void }) {
  const info = BUSINESS[type]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!onClick}
      onClick={onClick}
      className="press flex w-full items-center rounded-[18px] p-4 text-left transition-[background-color,box-shadow] duration-200 ease-emph"
      style={
        {
          '--ps': 0.975,
          background: selected ? info.softColor : 'var(--color-surface)',
          boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? info.color : 'var(--color-line)'}${
            selected ? ', var(--shadow-sm)' : ''
          }`,
        } as CSSProperties
      }
    >
      <span
        className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-[14px] p-3"
        style={{ background: selected ? '#fff' : `color-mix(in srgb, ${info.color} 10%, transparent)` }}
      >
        <img src={info.asset} alt="" className="h-full w-full object-contain" />
      </span>
      <span className="ml-4 min-w-0 flex-1">
        <span className="t-h3 block">{info.label}</span>
        <span className="t-body-sm mt-1 block">{info.pitch}</span>
      </span>
      <span
        className="ml-3 grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-200"
        style={{
          background: selected ? info.color : 'transparent',
          border: `1.8px solid ${selected ? info.color : 'var(--color-line-strong)'}`,
        }}
      >
        {selected && <Icon name="round/check" size={15} color="#fff" />}
      </span>
    </button>
  )
}

/* ── Step 2 — basics ───────────────────────────────────────────────────── */

export function StepBasics({ store, onChange }: { store: StoreProfile; onChange: (s: StoreProfile) => void }) {
  const type = store.type

  const toggleTag = (tag: string) => {
    haptic.selection()
    if (store.tags.includes(tag)) {
      onChange({ ...store, tags: store.tags.filter((t) => t !== tag) })
    } else if (store.tags.length < 5) {
      onChange({ ...store, tags: [...store.tags, tag] })
    } else {
      toast('Five tags is the limit. Remove one first.')
    }
  }

  return (
    <StepBody>
      <VendorField
        value={store.name}
        onChange={(name) => onChange({ ...store, name })}
        label="Business name"
        hint={type === 'restaurant' ? 'Mama Nkechi Kitchen' : type === 'pharmacy' ? 'Grace Pharmacy' : 'Sweet Events by Ada'}
        icon="outlined/storefront"
        capitalize="words"
        helper="Exactly as customers should see it."
      />
      <div className="h-5" />
      <VendorField
        value={store.tagline}
        onChange={(tagline) => onChange({ ...store, tagline })}
        label="One line about you"
        hint={type === 'restaurant' ? 'Home-style Nigerian food, cooked fresh daily' : 'What makes you worth choosing'}
        icon="round/short_text"
        maxLines={2}
        maxLength={90}
        capitalize="sentences"
        helper="Optional, but it sits right under your name."
      />
      <div className="h-5" />
      <VendorField
        value={store.phone}
        onChange={(phone) => onChange({ ...store, phone })}
        label="Phone number for orders"
        hint="08012345678"
        icon="outlined/phone"
        inputMode="tel"
        autoComplete="tel"
        maxLength={11}
        digits
        helper="Riders and support call this number."
      />
      <h3 className="t-h3 mt-7">{type === 'restaurant' ? 'What kind of food?' : 'What do you specialise in?'}</h3>
      <p className="t-body-sm mt-1">Pick up to five. These are what customers filter by.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {BUSINESS[type].tags.map((tag) => {
          const selected = store.tags.includes(tag)
          const color = BUSINESS[type].color
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleTag(tag)}
              className="press flex items-center rounded-full px-3 py-2.5 transition-colors duration-200"
              style={
                {
                  '--ps': 0.93,
                  background: selected ? color : 'var(--color-surface)',
                  border: `1px solid ${selected ? color : 'var(--color-line)'}`,
                } as CSSProperties
              }
            >
              {selected && <Icon name="round/check" size={14} color="#fff" style={{ marginRight: 6 }} />}
              <span className="t-label" style={{ color: selected ? '#fff' : 'var(--color-ink-body)' }}>
                {tag}
              </span>
            </button>
          )
        })}
      </div>
    </StepBody>
  )
}

/* ── Step 3 — location ─────────────────────────────────────────────────── */

export function StepLocation({
  store,
  onChange,
  onUseGps,
}: {
  store: StoreProfile
  onChange: (s: StoreProfile) => void
  onUseGps: () => Promise<void>
}) {
  const [locating, setLocating] = useState(false)
  const pinned = store.latitude != null
  const tone = pinned ? 'var(--color-success)' : 'var(--color-brand)'

  const gps = async () => {
    setLocating(true)
    await onUseGps()
    setLocating(false)
  }

  return (
    <StepBody>
      <button
        type="button"
        disabled={locating}
        onClick={() => void gps()}
        className="press flex w-full items-center rounded-[14px] p-4 text-left"
        style={
          {
            '--ps': 0.985,
            background: pinned ? 'var(--color-success-soft)' : 'var(--color-brand-softer)',
            border: `1px solid color-mix(in srgb, ${tone} 20%, transparent)`,
          } as CSSProperties
        }
      >
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center">
          {locating ? (
            <Spinner size={26} stroke={2.2} />
          ) : (
            <Icon name={pinned ? 'round/check_circle' : 'round/my_location'} size={23} color={tone} />
          )}
        </span>
        <span className="ml-3.5 min-w-0 flex-1">
          <span className="t-h4 block" style={{ color: pinned ? 'var(--color-success)' : 'var(--color-brand-ink)' }}>
            {pinned ? 'Location pinned' : 'Use my current location'}
          </span>
          <span className="t-caption-sm mt-0.5 block">
            {pinned
              ? 'Riders will be routed to this exact spot.'
              : 'Stand at your shop and tap. It fills the fields below.'}
          </span>
        </span>
      </button>
      <div className="h-6" />
      <VendorField
        value={store.address}
        onChange={(address) => onChange({ ...store, address })}
        label="Street address"
        hint="14 Olorunkemi Street, Zone 4"
        icon="outlined/storefront"
        capitalize="words"
        autoComplete="street-address"
        helper="Include a landmark. It is what riders actually use."
      />
      <div className="mt-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <VendorField
            value={store.city}
            onChange={(city) => onChange({ ...store, city })}
            label="City"
            hint="Osogbo"
            capitalize="words"
            autoComplete="address-level2"
          />
        </div>
        <div className="min-w-0 flex-1">
          <VendorField
            value={store.state}
            onChange={(state) => onChange({ ...store, state })}
            label="State"
            hint="Osun"
            capitalize="words"
            autoComplete="address-level1"
          />
        </div>
      </div>
    </StepBody>
  )
}

/* ── Step 4 — hours ────────────────────────────────────────────────────── */

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function StepHours({ store, onChange }: { store: StoreProfile; onChange: (s: StoreProfile) => void }) {
  const toggleDay = (day: number) => {
    haptic.selection()
    let days = [...store.openDays]
    if (days.includes(day)) {
      // At least one day stays on, or the store could never open and the
      // vendor would not know why.
      if (days.length > 1) days = days.filter((d) => d !== day)
    } else {
      days.push(day)
    }
    onChange({ ...store, openDays: days.sort((a, b) => a - b) })
  }

  return (
    <StepBody>
      <h3 className="t-h3">Opening hours</h3>
      <p className="t-body-sm mt-1">
        Outside these hours your store shows as closed, so orders stop arriving automatically.
      </p>
      <div className="mt-4 flex gap-3">
        <HourPicker label="Opens" hour={store.openingHour} onChange={(h) => onChange({ ...store, openingHour: h })} />
        <HourPicker label="Closes" hour={store.closingHour} onChange={(h) => onChange({ ...store, closingHour: h })} />
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-sunken p-3">
        <Icon name="round/schedule" size={17} color="var(--color-ink-muted)" />
        <p className="t-caption-sm flex-1">Customers see: {hoursLabel(store)}</p>
      </div>
      <h3 className="t-h3 mt-7">Days you open</h3>
      <div className="mt-3 flex gap-1.5">
        {DAY_LABELS.map((label, i) => {
          const active = store.openDays.includes(i + 1)
          return (
            <button
              key={DAY_NAMES[i]}
              type="button"
              title={DAY_NAMES[i]}
              aria-label={DAY_NAMES[i]}
              aria-pressed={active}
              onClick={() => toggleDay(i + 1)}
              className="press t-label grid h-[46px] min-w-0 flex-1 place-items-center rounded-[10px] transition-colors duration-200"
              style={
                {
                  '--ps': 0.9,
                  background: active ? 'var(--color-brand)' : 'var(--color-sunken)',
                  color: active ? '#fff' : 'var(--color-ink-faint)',
                } as CSSProperties
              }
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="mt-7">
        <SwitchRow
          title="Accept pre-orders"
          subtitle="Customers can order while you are closed, for later collection."
          value={store.acceptsPreorder}
          onChange={(v) => onChange({ ...store, acceptsPreorder: v })}
        />
      </div>
    </StepBody>
  )
}

const hourText = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h >= 12 && h < 24 ? 'PM' : 'AM'}`

function HourPicker({ label, hour, onChange }: { label: string; hour: number; onChange: (h: number) => void }) {
  const open = async () => {
    const picked = await showSheet<number>(
      (close) => (
        <div className="pb-safe flex h-[320px] flex-col">
          <h3 className="t-h3 text-center">{label} at</h3>
          <div className="scroll-y mt-2 min-h-0 flex-1">
            {Array.from({ length: 24 }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => close(i)}
                className="ink flex h-14 w-full items-center px-4 text-left"
              >
                <span className="t-body flex-1 text-ink">{hourText(i)}</span>
                {i === hour && <Icon name="round/check" color="var(--color-brand)" />}
              </button>
            ))}
          </div>
        </div>
      ),
      { handle: true },
    )
    if (picked !== undefined) onChange(picked)
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="t-label-sm text-ink-muted">{label}</p>
      <button
        type="button"
        onClick={() => void open()}
        className="press mt-2 flex h-[54px] w-full items-center rounded-[14px] bg-sunken px-4 text-left"
        style={{ '--ps': 0.97, border: '1px solid var(--color-line-strong)' } as CSSProperties}
      >
        <span className="t-h4 flex-1">{hourText(hour)}</span>
        <Icon name="round/keyboard_arrow_down" color="var(--color-ink-faint)" />
      </button>
    </div>
  )
}

function SwitchRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center rounded-[14px] border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="t-h4">{title}</p>
        <p className="t-caption-sm mt-1">{subtitle}</p>
      </div>
      <div className="ml-3">
        <Switch checked={value} onChange={onChange} label={title} />
      </div>
    </div>
  )
}

/* ── Step 5 — fulfilment ───────────────────────────────────────────────── */

export function StepFulfilment({ store, onChange }: { store: StoreProfile; onChange: (s: StoreProfile) => void }) {
  const [minOrder, setMinOrder] = useState(store.minOrder > 0 ? String(Math.trunc(store.minOrder)) : '')
  const minutes = Math.min(120, Math.max(5, store.prepMinutes))

  return (
    <StepBody>
      <h3 className="t-h3">How long does an order take?</h3>
      <p className="t-body-sm mt-1">
        Customers see this as an arrival window. Be honest — a promise you miss costs more than a slower one you keep.
      </p>
      <div className="mt-4 flex items-center rounded-[14px] bg-sunken px-4 py-3">
        <Icon name="outlined/timer" size={20} color="var(--color-brand)" />
        <span className="t-h4 ml-3 flex-1">Customers see "{etaWindow(store.prepMinutes)}"</span>
        <SwapIn swapKey={store.prepMinutes}>
          <span className="t-price text-brand">{store.prepMinutes} min</span>
        </SwapIn>
      </div>
      <Slider
        value={minutes}
        min={5}
        max={120}
        divisions={23}
        label="Preparation time in minutes"
        onChange={(v) => {
          haptic.selection()
          onChange({ ...store, prepMinutes: v })
        }}
      />
      <div className="h-7" />
      <VendorField
        value={minOrder}
        onChange={(v) => {
          setMinOrder(v)
          onChange({ ...store, minOrder: Number.parseInt(v, 10) || 0 })
        }}
        label="Minimum order"
        hint="0"
        prefix="₦ "
        icon="outlined/shopping_basket"
        inputMode="numeric"
        digits
        helper="Leave at zero if you take any order size."
      />
      <div className="mt-6 flex items-start gap-3 rounded-[14px] bg-brand-softer p-4">
        <Icon name="round/delivery_dining" size={21} color="var(--color-brand)" />
        <div className="min-w-0 flex-1">
          <p className="t-h4 text-brand-ink">Delivery is on us</p>
          <p className="t-caption-sm mt-1 text-brand-ink">
            Blorbmart riders handle delivery and the fee is worked out from the customer's distance. You never set it.
          </p>
        </div>
      </div>
    </StepBody>
  )
}

/* ── Step 6 — branding ─────────────────────────────────────────────────── */

export function StepBranding({
  store,
  uploading,
  onPickLogo,
  onPickBanner,
}: {
  store: StoreProfile
  uploading: 'logo' | 'banner' | null
  onPickLogo: () => void
  onPickBanner: () => void
}) {
  return (
    <StepBody>
      <ImageSlot
        title="Cover photo"
        subtitle="The wide image at the top of your store page."
        url={store.bannerUrl}
        height={150}
        uploading={uploading === 'banner'}
        onPick={onPickBanner}
      />
      <div className="h-5" />
      <ImageSlot
        title="Logo"
        subtitle="Shown next to your name everywhere in the app."
        url={store.logoUrl}
        height={110}
        square
        uploading={uploading === 'logo'}
        onPick={onPickLogo}
      />
      <h3 className="t-h3 mt-6">This is roughly how you will look</h3>
      <div className="mt-3">
        <StorePreview store={store} />
      </div>
    </StepBody>
  )
}

function ImageSlot({
  title,
  subtitle,
  url,
  height,
  uploading,
  onPick,
  square = false,
}: {
  title: string
  subtitle: string
  url: string
  height: number
  uploading: boolean
  onPick: () => void
  square?: boolean
}) {
  return (
    <div>
      <div className="flex min-h-[44px] items-center">
        <p className="t-h4 flex-1">{title}</p>
        {url && <TextButton onClick={onPick}>Change</TextButton>}
      </div>
      <p className="t-caption-sm mt-0.5">{subtitle}</p>
      <button
        type="button"
        aria-label={url ? `Change ${title.toLowerCase()}` : `Upload ${title.toLowerCase()}`}
        disabled={uploading}
        onClick={onPick}
        className="press relative mt-2.5 block"
        style={{ '--ps': 0.98, height, width: square ? height : '100%' } as CSSProperties}
      >
        {url ? (
          <>
            <BlorbImage url={url} radius={14} decodeWidth={square ? 300 : 900} />
            {uploading && (
              <span className="absolute inset-0 grid place-items-center rounded-[14px]" style={{ background: 'rgb(255 255 255 / 0.7)' }}>
                <Spinner />
              </span>
            )}
          </>
        ) : (
          <DottedSlot uploading={uploading} label="Tap to upload" icon="outlined/add_photo_alternate" />
        )}
      </button>
    </div>
  )
}

/** The vendor's own storefront card as the buyer app draws it — the payoff. */
function StorePreview({ store }: { store: StoreProfile }) {
  const cover = store.bannerUrl || store.logoUrl
  return (
    <div className="rounded-[18px] border border-line bg-canvas p-3">
      <div className="h-[130px] overflow-hidden rounded-[14px]">
        {cover ? (
          <BlorbImage url={cover} decodeWidth={700} fallbackLabel={store.name} />
        ) : (
          <div className="grid h-full place-items-center bg-sunken">
            <Icon name="outlined/image" color="var(--color-ink-faint)" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p className="t-h3 min-w-0 flex-1 truncate" style={{ color: store.name ? 'var(--color-ink)' : 'var(--color-ink-faint)' }}>
          {store.name || 'Your business name'}
        </p>
        <Pill label="New" icon="round/auto_awesome" tone="brand" dense />
      </div>
      <p className="t-body-sm mt-1 truncate">
        {store.tags.length ? store.tags.slice(0, 2).join(', ') : store.tagline || BUSINESS[store.type].label}
      </p>
      <div className="mt-2.5 flex items-center">
        <Icon name="round/schedule" size={15} color="var(--color-ink-strong)" />
        <span className="t-caption ml-1.5 font-bold text-ink-strong">{etaWindow(store.prepMinutes)}</span>
        <Icon name="round/pedal_bike" size={15} color="var(--color-success)" style={{ marginLeft: 16 }} />
        <span className="t-caption ml-1.5 text-success">Rider assigned</span>
      </div>
    </div>
  )
}
