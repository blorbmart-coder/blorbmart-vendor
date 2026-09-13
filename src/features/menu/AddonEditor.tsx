import { useState, type CSSProperties } from 'react'
import { BlorbButton, IconBtn, TextButton } from '../../components/Button'
import { VendorField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { SwapIn } from '../../components/motion'
import { showSheet, toast } from '../../components/overlay'
import {
  addonOption,
  groupRequired,
  groupSummary,
  type AddonGroup,
  type AddonOption,
  type BusinessType,
} from '../../data/models'
import { digitsOnly } from '../../lib/format'
import { haptic } from '../../lib/haptics'

/** Opens the add-on editor. Resolves with the edited groups, or undefined. */
export function showAddonEditor(groups: AddonGroup[], type: BusinessType) {
  return showSheet<AddonGroup[]>((close) => <AddonEditor initial={groups} type={type} onDone={close} />, {
    fill: true,
  })
}

/** Templates that cover most of what vendors actually build. */
const TEMPLATES: Record<BusinessType, AddonGroup[]> = {
  restaurant: [
    {
      id: 'protein',
      name: 'Choose your protein',
      min: 1,
      max: 1,
      options: [addonOption('Chicken', 1500), addonOption('Beef', 1200), addonOption('Fish', 1800), addonOption('Turkey', 2500)],
    },
    {
      id: 'size',
      name: 'Portion size',
      min: 1,
      max: 1,
      options: [addonOption('Regular', 0, true), addonOption('Large', 1000)],
    },
    {
      id: 'sides',
      name: 'Add a side',
      min: 0,
      max: 3,
      options: [
        addonOption('Plantain', 700),
        addonOption('Moi moi', 800),
        addonOption('Coleslaw', 500),
        addonOption('Extra sauce', 300),
      ],
    },
    {
      id: 'drinks',
      name: 'Add a drink',
      min: 0,
      max: 2,
      options: [addonOption('Coke 50cl', 500), addonOption('Water 75cl', 300), addonOption('Chapman', 1200)],
    },
  ],
  pharmacy: [
    {
      id: 'pack',
      name: 'Pack size',
      min: 1,
      max: 1,
      options: [addonOption('Single card', 0, true), addonOption('Full pack', 2000)],
    },
  ],
  events: [
    {
      id: 'guests',
      name: 'Number of guests',
      min: 1,
      max: 1,
      options: [addonOption('20 guests', 0, true), addonOption('50 guests', 45000), addonOption('100 guests', 110000)],
    },
    {
      id: 'extras',
      name: 'Add extras',
      min: 0,
      max: 4,
      options: [
        addonOption('Serving staff', 15000),
        addonOption('Chafing dishes', 8000),
        addonOption('Delivery and setup', 12000),
      ],
    },
  ],
}

/**
 * Add-ons lift average order value more than any promotion, and are the
 * easiest thing to make confusing. So: ready-made groups for the common case,
 * and min/max hidden behind three plain-English modes.
 */
function AddonEditor({
  initial,
  type,
  onDone,
}: {
  initial: AddonGroup[]
  type: BusinessType
  onDone: (groups?: AddonGroup[]) => void
}) {
  const [groups, setGroups] = useState<AddonGroup[]>(initial)
  const unused = TEMPLATES[type].filter((t) => !groups.some((g) => g.id === t.id))

  const editGroup = async (existing?: AddonGroup) => {
    const result = await showSheet<AddonGroup>((close) => <GroupEditor group={existing} onSave={close} />, {
      fill: true,
    })
    if (!result) return
    setGroups((prev) => {
      const index = prev.findIndex((g) => g.id === result.id)
      return index >= 0 ? prev.map((g, i) => (i === index ? result : g)) : [...prev, result]
    })
  }

  const addTemplate = (template: AddonGroup) => {
    if (groups.some((g) => g.id === template.id)) {
      toast('You already have that group.')
      return
    }
    haptic.selection()
    setGroups((prev) => [...prev, template])
  }

  return (
    <>
      <div className="scroll-y min-h-0 flex-1">
        <div className="px-5 pb-6 pt-2">
          <h2 className="t-h1">Choices and extras</h2>
          <p className="t-body-sm mt-1">Let customers customise. Anything with a price adds to what they pay.</p>
          <div className="h-6" />

          {groups.length > 0 && (
            <>
              <p className="t-overline">YOUR GROUPS</p>
              <div className="mt-2 space-y-2">
                {groups.map((g, i) => (
                  <GroupRow
                    key={g.id}
                    group={g}
                    onEdit={() => void editGroup(g)}
                    onRemove={() => setGroups((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
              <div className="h-5" />
            </>
          )}

          {unused.length > 0 && (
            <>
              <p className="t-overline">QUICK ADD</p>
              <p className="t-caption-sm mt-1">Tap one, then edit the options and prices to match yours.</p>
              <div className="mb-3 mt-3 space-y-2">
                {unused.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => addTemplate(template)}
                    className="press flex w-full items-center gap-3 rounded-[14px] bg-brand-softer p-3 text-left"
                    style={{ '--ps': 0.985, border: '1px solid rgb(31 119 241 / 0.16)' } as CSSProperties}
                  >
                    <Icon name="round/add_circle_outline" size={20} color="var(--color-brand)" />
                    <span className="min-w-0 flex-1">
                      <span className="t-h4 block text-brand-ink">{template.name}</span>
                      <span className="t-caption-sm mt-0.5 block truncate">
                        {template.options
                          .slice(0, 3)
                          .map((o) => o.name)
                          .join(', ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <BlorbButton label="Create my own group" kind="outline" icon="round/add" size="md" onClick={() => void editGroup()} />
        </div>
      </div>
      <SheetBar>
        <BlorbButton label="Done" glow onClick={() => onDone(groups)} />
      </SheetBar>
    </>
  )
}

/** The pinned action bar at the foot of an editor sheet. */
function SheetBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative z-10 shrink-0 bg-surface px-5 pt-4 shadow-lift"
      style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

function GroupRow({ group, onEdit, onRemove }: { group: AddonGroup; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center rounded-[14px] border border-line bg-surface p-3">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className="t-h4 truncate">{group.name}</span>
          {groupRequired(group) && (
            <span className="shrink-0 rounded-[10px] bg-brand-soft px-[7px] py-[3px]">
              <span className="t-caption-sm text-brand-ink">Required</span>
            </span>
          )}
        </span>
        <span className="t-caption-sm mt-1 block">{groupSummary(group)}</span>
      </button>
      <IconBtn icon="outlined/edit" size={19} color="var(--color-brand)" tooltip="Edit" onClick={onEdit} />
      <IconBtn icon="round/delete_outline" size={19} color="var(--color-danger)" tooltip="Remove" onClick={onRemove} />
    </div>
  )
}

/** The three shapes a group can take, in words a vendor understands. */
type Mode = 'pickOne' | 'pickOneRequired' | 'pickMany'

interface OptionRowState {
  key: number
  option: AddonOption
  priceText: string
}

let rowKey = 0

function GroupEditor({ group, onSave }: { group?: AddonGroup; onSave: (group?: AddonGroup) => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [rows, setRows] = useState<OptionRowState[]>(() =>
    (group?.options ?? []).map((option) => ({
      key: rowKey++,
      option,
      priceText: option.price > 0 ? String(Math.trunc(option.price)) : '',
    })),
  )
  const [mode, setMode] = useState<Mode>(() =>
    !group ? 'pickOneRequired' : group.max > 1 ? 'pickMany' : groupRequired(group) ? 'pickOneRequired' : 'pickOne',
  )
  const [maxChoices, setMaxChoices] = useState(group?.max ?? 3)

  const addOption = () =>
    setRows((prev) => [...prev, { key: rowKey++, option: addonOption(''), priceText: '' }])

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Give this group a name.', { tone: 'danger' })
      return
    }
    const valid = rows
      .map((r) => ({ ...r.option, price: Number.parseInt(r.priceText, 10) || 0 }))
      .filter((o) => o.name.trim())
    if (valid.length === 0) {
      toast('Add at least one option.', { tone: 'danger' })
      return
    }
    const [min, max] =
      mode === 'pickOne' ? [0, 1] : mode === 'pickOneRequired' ? [1, 1] : [0, Math.min(Math.max(maxChoices, 1), valid.length)]
    onSave({ id: group?.id ?? `g${Date.now().toString(36)}`, name: trimmed, options: valid, min, max })
  }

  return (
    <>
      <div className="scroll-y min-h-0 flex-1">
        <div className="px-5 pb-6 pt-2">
          <h2 className="t-h1">{group ? 'Edit group' : 'New group'}</h2>
          <div className="mt-5">
            <VendorField
              value={name}
              onChange={setName}
              label="What are you asking?"
              hint="Choose your protein"
              icon="round/help_outline"
              capitalize="sentences"
              autoFocus={!group}
            />
          </div>
          <h3 className="t-h3 mt-6">How many can they pick?</h3>
          <div className="mt-3 space-y-2">
            <ModeTile
              selected={mode === 'pickOneRequired'}
              title="Exactly one, and they must choose"
              subtitle="Protein, size, spice level"
              onClick={() => setMode('pickOneRequired')}
            />
            <ModeTile
              selected={mode === 'pickOne'}
              title="One at most, optional"
              subtitle="A single upgrade they can skip"
              onClick={() => setMode('pickOne')}
            />
            <ModeTile
              selected={mode === 'pickMany'}
              title="Several, all optional"
              subtitle="Sides, drinks, extras"
              onClick={() => setMode('pickMany')}
            />
          </div>
          {mode === 'pickMany' && (
            <div className="mt-4 flex items-center">
              <span className="t-h4 flex-1">Most they can add</span>
              <Stepper value={maxChoices} min={1} max={10} onChange={setMaxChoices} />
            </div>
          )}
          <div className="mt-7 flex items-center">
            <h3 className="t-h3 flex-1">Options</h3>
            <TextButton icon="round/add" onClick={addOption}>
              Add
            </TextButton>
          </div>
          <p className="t-caption-sm mt-1">Leave the price blank when an option costs nothing extra.</p>
          <div className="mt-3">
            {rows.length === 0 ? (
              <button
                type="button"
                onClick={addOption}
                className="press t-label w-full rounded-[14px] bg-sunken p-5 text-brand"
                style={{ '--ps': 0.985 } as CSSProperties}
              >
                Tap to add your first option
              </button>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <OptionRow
                    key={row.key}
                    row={row}
                    onChange={(next) => setRows((prev) => prev.map((r) => (r.key === row.key ? next : r)))}
                    onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <SheetBar>
        <BlorbButton label="Save group" glow onClick={save} />
      </SheetBar>
    </>
  )
}

function ModeTile({
  selected,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className="press flex w-full items-center rounded-[14px] p-4 text-left transition-[background-color,box-shadow] duration-200"
      style={
        {
          '--ps': 0.985,
          background: selected ? 'var(--color-brand-softer)' : 'var(--color-surface)',
          boxShadow: `inset 0 0 0 ${selected ? 1.7 : 1}px ${selected ? 'var(--color-brand)' : 'var(--color-line)'}`,
        } as CSSProperties
      }
    >
      <span
        className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full transition-colors duration-200"
        style={{
          background: selected ? 'var(--color-brand)' : 'transparent',
          border: `1.6px solid ${selected ? 'var(--color-brand)' : 'var(--color-line-strong)'}`,
        }}
      >
        {selected && <Icon name="round/check" size={13} color="#fff" />}
      </span>
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="t-h4 block">{title}</span>
        <span className="t-caption-sm mt-0.5 block">{subtitle}</span>
      </span>
    </button>
  )
}

function OptionRow({
  row,
  onChange,
  onRemove,
}: {
  row: OptionRowState
  onChange: (row: OptionRowState) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center rounded-[14px] border border-line bg-surface px-3 py-2">
      <input
        value={row.option.name}
        onChange={(e) => onChange({ ...row, option: { ...row.option, name: e.target.value } })}
        placeholder="Option name"
        aria-label="Option name"
        autoCapitalize="sentences"
        className="t-body min-w-0 flex-[3] bg-transparent font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-faint"
      />
      <span className="mx-2 h-[26px] w-px shrink-0 bg-line" />
      <label className="flex min-w-0 flex-[2] items-center">
        <span className="t-price-sm text-ink-muted">+₦</span>
        <input
          value={row.priceText}
          onChange={(e) => onChange({ ...row, priceText: digitsOnly(e.target.value) })}
          inputMode="numeric"
          placeholder="0"
          aria-label="Extra price"
          className="t-price-sm min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-ink-faint"
        />
      </label>
      <IconBtn icon="round/close" size={17} color="var(--color-ink-faint)" tooltip="Remove option" compact onClick={onRemove} />
    </div>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const step = (icon: 'round/remove' | 'round/add', enabled: boolean, next: number, label: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={() => {
        haptic.selection()
        onChange(next)
      }}
      className="press grid h-8 w-8 place-items-center rounded-[8px]"
      style={{ '--ps': 0.85, background: enabled ? 'var(--color-surface)' : 'transparent' } as CSSProperties}
    >
      <Icon name={icon} size={16} color={enabled ? 'var(--color-ink)' : 'var(--color-ink-disabled)'} />
    </button>
  )
  return (
    <div className="flex items-center rounded-[10px] bg-sunken p-[3px]">
      {step('round/remove', value > min, value - 1, 'Fewer')}
      <span className="grid w-[34px] place-items-center">
        <SwapIn swapKey={value}>
          <span className="t-h4">{value}</span>
        </SwapIn>
      </span>
      {step('round/add', value < max, value + 1, 'More')}
    </div>
  )
}
