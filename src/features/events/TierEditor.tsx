import { useState } from 'react'
import { BlorbButton } from '../../components/Button'
import { useValidation, VendorField } from '../../components/Field'
import { showSheet, toast } from '../../components/overlay'
import { Switch } from '../../components/Switch'
import { tierIsFree, type EventTier } from '../../data/eventModels'
import { haptic } from '../../lib/haptics'

/** Opens the ticket-tier editor. Resolves with the tier, or undefined. */
export function showTierEditor(tier?: EventTier) {
  return showSheet<EventTier>((close) => <TierEditor tier={tier} onSave={close} />, {
    background: 'var(--color-canvas)',
  })
}

function newTierId() {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  return `tier_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * One ticket tier. "Free" is a switch rather than "type 0 into price": an
 * organizer should never publish a ₦0 VIP ticket because a field was blank.
 */
function TierEditor({ tier, onSave }: { tier?: EventTier; onSave: (tier?: EventTier) => void }) {
  const [name, setName] = useState(tier?.name ?? '')
  const [description, setDescription] = useState(tier?.description ?? '')
  const [price, setPrice] = useState(tier && tier.price > 0 ? tier.price.toFixed(0) : '')
  const [quantity, setQuantity] = useState(tier && tier.quantity > 0 ? String(tier.quantity) : '')
  const [maxPerOrder, setMaxPerOrder] = useState(tier && tier.maxPerOrder > 0 ? String(tier.maxPerOrder) : '')
  const [free, setFree] = useState(tier ? tierIsFree(tier) : false)
  const sold = tier?.sold ?? 0
  const form = useValidation<'name' | 'price'>()

  const save = () => {
    const valid = form.validate({
      name: name.trim().length < 2 ? 'Name this ticket' : null,
      price: !free && !(Number.parseFloat(price) > 0) ? 'Set a price, or switch on Free ticket' : null,
    })
    if (!valid) return

    const cap = Number.parseInt(quantity, 10) || 0
    if (cap > 0 && cap < sold) {
      toast(`You have already sold ${sold}. The limit cannot go below that.`, { tone: 'danger' })
      return
    }
    haptic.selection()
    onSave({
      // A new tier gets an id here so the editor can address it before it
      // has ever reached the backend.
      id: tier?.id ?? newTierId(),
      name: name.trim(),
      description: description.trim(),
      price: free ? 0 : Number.parseFloat(price) || 0,
      quantity: cap,
      sold,
      maxPerOrder: Number.parseInt(maxPerOrder, 10) || 0,
      salesEndAt: tier?.salesEndAt ?? null,
    })
  }

  return (
    <div className="scroll-y pb-safe min-h-0 flex-1">
      <form className="px-5 pb-5 pt-1" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2 className="t-h2 mt-4">{tier ? 'Edit ticket type' : 'New ticket type'}</h2>
        <div className="mt-5">
          <VendorField
            value={name}
            onChange={setName}
            label="Name"
            hint="Regular, VIP, Early bird, Free entry"
            autoFocus={!tier}
            capitalize="words"
            error={form.errors.name}
          />
        </div>
        <div className="mt-3">
          <VendorField
            value={description}
            onChange={setDescription}
            label="What it includes"
            hint="Optional — table for four, includes a drink"
            capitalize="sentences"
          />
        </div>
        <div className="mt-5 flex items-center rounded-[14px] border border-line bg-surface px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="t-h4">Free ticket</p>
            <p className="t-caption-sm mt-0.5">People claim it without paying.</p>
          </div>
          <Switch checked={free} onChange={setFree} label="Free ticket" thumbOn="var(--color-success)" />
        </div>
        {!free && (
          <div className="mt-3">
            <VendorField
              value={price}
              onChange={setPrice}
              label="Price"
              prefix="₦"
              inputMode="numeric"
              digits
              error={form.errors.price}
            />
          </div>
        )}
        <p className="t-label mt-5">Limits</p>
        <div className="mt-2">
          <VendorField
            value={quantity}
            onChange={setQuantity}
            label="How many exist"
            hint="Leave empty for no limit"
            helper={sold > 0 ? `${sold} already sold` : null}
            inputMode="numeric"
            digits
          />
        </div>
        <div className="mt-3">
          <VendorField
            value={maxPerOrder}
            onChange={setMaxPerOrder}
            label="Max per person"
            hint="Leave empty for no limit"
            inputMode="numeric"
            digits
            action="done"
          />
        </div>
        <div className="mt-6">
          <BlorbButton label="Save ticket type" onClick={save} />
        </div>
      </form>
    </div>
  )
}
