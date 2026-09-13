import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useLayer, useNav } from '../../app/stack'
import { AppBar, BottomBar, Page, PageBody } from '../../components/AppBar'
import { BlorbImage } from '../../components/BlorbImage'
import { BlorbButton, IconBtn } from '../../components/Button'
import { DottedSlot } from '../../components/DottedSlot'
import { VendorField } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { FadeSlideIn } from '../../components/motion'
import { confirmBlorb, toast } from '../../components/overlay'
import { CenterSpinner } from '../../components/Spinner'
import { Switch } from '../../components/Switch'
import { Card, Divider, Empty, Pill } from '../../components/ui'
import { menuRepo } from '../../data/menuRepo'
import {
  blankProduct,
  BUSINESS,
  coverImage,
  discountPercent,
  effectivePrice,
  groupRequired,
  groupSummary,
  hasDiscount,
  validateProduct,
  type AddonGroup,
  type ProductDraft,
  type StoreProfile,
} from '../../data/models'
import { useStore } from '../../data/storeRepo'
import { pickImages, prepareImage, uploadImage, UploadError } from '../../lib/cloudinary'
import { writeFailure } from '../../lib/db'
import { money, parseAmount, titleCase } from '../../lib/format'
import { haptic } from '../../lib/haptics'
import { showCampusSheet } from '../profile/CampusSheet'
import { showAddonEditor } from './AddonEditor'

/**
 * Adding or editing one product — the contract between the two apps.
 * Whatever is typed here becomes a `products` document, search index and
 * all, so a vendor should not be able to produce an item the buyer app
 * renders badly or cannot find.
 */
export default function ProductEditorScreen() {
  const { productId } = useParams()
  const layer = useLayer<{ product?: ProductDraft }>()
  const store = useStore()
  const passed = layer.data?.product
  const [existing, setExisting] = useState<ProductDraft | null | undefined>(passed ?? (productId ? undefined : null))

  // Opened from a link rather than the menu: read the product itself.
  useEffect(() => {
    if (existing !== undefined || !productId) return
    menuRepo
      .get(productId)
      .then((p) => setExisting(p))
      .catch(() => setExisting(null))
  }, [existing, productId])

  if (existing === undefined || !store) {
    return (
      <Page>
        <AppBar title="" />
        <CenterSpinner />
      </Page>
    )
  }
  if (productId && !existing) {
    return (
      <Page>
        <AppBar title="" />
        <Empty title="Not found" message="That item is no longer on your menu." icon="round/search_off" />
      </Page>
    )
  }
  return <Editor existing={existing} store={store} />
}

function Editor({ existing, store }: { existing: ProductDraft | null; store: StoreProfile }) {
  const nav = useNav()
  const info = BUSINESS[store.type]
  const isEdit = existing != null
  const base = existing ?? { ...blankProduct, tracksStock: info.tracksStockByDefault, prepMinutes: store.prepMinutes }

  const [name, setName] = useState(base.name)
  const [description, setDescription] = useState(base.description)
  const [price, setPrice] = useState(base.price > 0 ? String(Math.trunc(base.price)) : '')
  const [discount, setDiscount] = useState(base.discountPrice > 0 ? String(Math.trunc(base.discountPrice)) : '')
  const [section, setSection] = useState(base.section)
  const [brand, setBrand] = useState(base.brand)
  const [stock, setStock] = useState(base.stockQuantity > 0 ? String(base.stockQuantity) : '')
  const [images, setImages] = useState(base.images)
  const [addonGroups, setAddonGroups] = useState(base.addonGroups)
  const [isAvailable, setAvailable] = useState(base.isAvailable)
  const [tracksStock, setTracksStock] = useState(base.tracksStock)
  const [requiresPrescription, setRequiresPrescription] = useState(base.requiresPrescription)
  const [knownSections, setKnownSections] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let live = true
    menuRepo.sectionsInUse(store.id).then((s) => live && setKnownSections(s))
    return () => {
      live = false
    }
  }, [store.id])

  const draft: ProductDraft = useMemo(
    () => ({
      ...base,
      name,
      description,
      price: parseAmount(price),
      discountPrice: parseAmount(discount),
      section,
      brand,
      stockQuantity: Number.parseInt(stock, 10) || 0,
      images,
      addonGroups,
      isAvailable,
      tracksStock,
      requiresPrescription,
    }),
    // `base` is fixed for the life of the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, description, price, discount, section, brand, stock, images, addonGroups, isAvailable, tracksStock, requiresPrescription],
  )
  const errors = validateProduct(draft)
  const sections = [...new Set([...knownSections, ...info.sections])]

  /**
   * Up to five photos, uploaded as they arrive. One bad photo must not cost
   * a vendor the four that uploaded fine, so each is isolated.
   */
  const addPhotos = () => {
    if (images.length >= 5) {
      toast('Five photos is the limit.')
      return
    }
    const room = 5 - images.length
    void pickImages({ multiple: true }).then(async (files) => {
      if (files.length === 0) return
      const batch = files.slice(0, room)
      setUploading(true)
      const results = await Promise.allSettled(batch.map(async (f) => uploadImage(await prepareImage(f, 1400, 0.82))))
      const urls = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      setImages((prev) => [...prev, ...urls].slice(0, 5))
      setUploading(false)
      if (failed.length) {
        const last = failed[failed.length - 1].reason
        const reason = last instanceof UploadError ? last.message : 'That upload failed. Please try again.'
        toast(`${failed.length} photo(s) failed. ${reason}`, { tone: 'danger' })
      }
    })
  }

  const save = async () => {
    if (errors.length) {
      setShowErrors(true)
      haptic.vibrate()
      toast(errors[0], { tone: 'danger' })
      return
    }
    // Every product carries its store's campus, and buyers only see their own
    // campus's items. The rules refuse one without it, so ask for it first.
    if (!store.universityId) {
      toast('Choose your campus first. It decides which students see this.', { tone: 'danger' })
      void showCampusSheet()
      return
    }
    setSaving(true)
    try {
      await menuRepo.save(draft, store)
      haptic.medium()
      toast(isEdit ? `${draft.name} updated` : `${draft.name} is now on your ${info.menuNoun.toLowerCase()}`, {
        tone: 'success',
      })
      nav.pop(true)
    } catch (error) {
      console.warn('product save failed', error)
      setSaving(false)
      toast(writeFailure(error, 'Could not save that. Check your connection.'), { tone: 'danger' })
    }
  }

  const confirmDelete = async () => {
    const confirmed = await confirmBlorb({
      title: `Delete ${draft.name}?`,
      message: 'It disappears from your storefront immediately. Past orders keep their record. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      icon: 'round/delete_outline',
    })
    if (!confirmed) return
    try {
      await menuRepo.remove(draft.id)
      toast('Deleted')
      nav.pop(true)
    } catch (error) {
      toast(writeFailure(error, 'Could not delete that.'), { tone: 'danger' })
    }
  }

  const editAddons = async () => {
    const groups = await showAddonEditor(addonGroups, store.type)
    if (groups) setAddonGroups(groups)
  }

  return (
    <Page>
      <AppBar
        title={isEdit ? `Edit ${info.itemNoun}` : `New ${info.itemNoun}`}
        actions={
          <>
            {isEdit && (
              <IconBtn icon="round/delete_outline" tooltip="Delete" color="var(--color-danger)" onClick={() => void confirmDelete()} />
            )}
            <span className="w-2" />
          </>
        }
      />
      <PageBody>
        <div className="px-5 pb-10 pt-4">
          <SectionLabel title="Photos" required hint="The first one is what customers see in lists." />
          <PhotoStrip
            images={images}
            uploading={uploading}
            onAdd={addPhotos}
            onRemove={(i) => setImages((prev) => prev.filter((_, j) => j !== i))}
            onMakeCover={(i) => setImages((prev) => [prev[i], ...prev.filter((_, j) => j !== i)])}
          />

          <div className="h-7" />
          <SectionLabel title="The basics" required />
          <VendorField
            value={name}
            onChange={setName}
            label={`${titleCase(info.itemNoun)} name`}
            hint={
              store.type === 'restaurant'
                ? 'Jollof rice and chicken'
                : store.type === 'pharmacy'
                  ? 'Paracetamol 500mg'
                  : 'Small chops platter for 20'
            }
            icon="outlined/label"
            capitalize="sentences"
            helper="Write it the way a customer would search for it."
          />
          <div className="h-5" />
          <VendorField
            value={description}
            onChange={setDescription}
            label="Description"
            hint="What is in it, how big it is, anything they should know"
            maxLines={3}
            maxLength={300}
            capitalize="sentences"
          />
          {store.type === 'pharmacy' && (
            <>
              <div className="h-5" />
              <VendorField
                value={brand}
                onChange={setBrand}
                label="Brand or manufacturer"
                hint="Emzor"
                icon="outlined/business"
                capitalize="words"
                helper="Customers often search by brand."
              />
            </>
          )}

          <div className="h-7" />
          <SectionLabel title="Where it belongs" hint={`Groups it on your ${info.menuNoun.toLowerCase()}.`} />
          <VendorField
            value={section}
            onChange={setSection}
            label="Section"
            hint={sections[0] ?? 'Rice dishes'}
            icon="outlined/folder"
            capitalize="sentences"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {sections.slice(0, 12).map((s) => {
              const active = section === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    haptic.selection()
                    setSection(s)
                  }}
                  className="press t-label-sm rounded-full px-3 py-2"
                  style={
                    {
                      '--ps': 0.93,
                      background: active ? 'var(--color-brand)' : 'var(--color-surface)',
                      border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-line)'}`,
                      color: active ? '#fff' : 'var(--color-ink-body)',
                    } as CSSProperties
                  }
                >
                  {s}
                </button>
              )
            })}
          </div>

          <div className="h-7" />
          <SectionLabel title="Price" required />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <VendorField value={price} onChange={setPrice} label="Normal price" hint="0" prefix="₦ " inputMode="numeric" digits />
            </div>
            <div className="min-w-0 flex-1">
              <VendorField
                value={discount}
                onChange={setDiscount}
                label="Sale price"
                hint="Optional"
                prefix="₦ "
                inputMode="numeric"
                digits
              />
            </div>
          </div>
          {hasDiscount(draft) && (
            <div className="mt-3 flex items-center gap-2.5 rounded-[10px] bg-appetite-soft p-3">
              <Icon name="round/local_offer" size={16} color="var(--color-appetite-deep)" />
              <p className="t-caption-sm flex-1 text-appetite-deep">
                Customers see {discountPercent(draft)}% off. Discounted items appear in "Save today" on the home screen.
              </p>
            </div>
          )}

          <div className="h-7" />
          <SectionLabel title="Choices and extras" hint="Protein, size, sides. Each one can add to the price." />
          <AddonSummary groups={addonGroups} onEdit={() => void editAddons()} />

          <div className="h-7" />
          <SectionLabel title="Availability" />
          <ToggleRow
            title="Available to order"
            subtitle={isAvailable ? 'Customers can order this now.' : 'Hidden from your storefront.'}
            value={isAvailable}
            onChange={setAvailable}
          />
          <div className="h-3" />
          <ToggleRow
            title="Track stock"
            subtitle={
              store.type === 'pharmacy'
                ? 'Recommended. Sells out automatically at zero.'
                : 'Only if you have a fixed number to sell.'
            }
            value={tracksStock}
            onChange={setTracksStock}
          />
          {tracksStock && (
            <div className="mt-4">
              <VendorField
                value={stock}
                onChange={setStock}
                label="How many do you have?"
                hint="0"
                icon="outlined/inventory_2"
                inputMode="numeric"
                digits
              />
            </div>
          )}
          {store.type === 'pharmacy' && (
            <>
              <div className="h-3" />
              <ToggleRow
                title="Needs a prescription"
                subtitle="Customers are told to have theirs ready."
                value={requiresPrescription}
                onChange={setRequiresPrescription}
              />
            </>
          )}

          <div className="h-7" />
          <SectionLabel title="How customers will see it" />
          <CustomerPreview draft={draft} noun={info.itemNoun} />

          {showErrors && errors.length > 0 && (
            <FadeSlideIn duration={200} className="mt-5">
              <div className="rounded-[14px] bg-danger-soft p-4">
                <div className="flex items-center gap-2">
                  <Icon name="round/error_outline" size={18} color="var(--color-danger)" />
                  <p className="t-h4 text-danger">Before you publish</p>
                </div>
                <ul className="mt-2">
                  {errors.map((error) => (
                    <li key={error} className="t-body-sm mt-1 flex text-danger">
                      <span className="whitespace-pre">·  </span>
                      <span className="flex-1">{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeSlideIn>
          )}
        </div>
      </PageBody>
      <BottomBar>
        <BlorbButton
          label={isEdit ? 'Save changes' : 'Publish to my menu'}
          busy={saving}
          glow={errors.length === 0}
          onClick={saving ? null : () => void save()}
        />
      </BottomBar>
    </Page>
  )
}

function SectionLabel({ title, required = false, hint }: { title: string; required?: boolean; hint?: string }) {
  return (
    <div className="pb-3">
      <div className="flex items-center gap-1.5">
        <h2 className="t-h3">{title}</h2>
        {required && <Pill label="Required" tone="appetite" dense />}
      </div>
      {hint && <p className="t-caption-sm mt-1">{hint}</p>}
    </div>
  )
}

function PhotoStrip({
  images,
  uploading,
  onAdd,
  onRemove,
  onMakeCover,
}: {
  images: string[]
  uploading: boolean
  onAdd: () => void
  onRemove: (i: number) => void
  onMakeCover: (i: number) => void
}) {
  return (
    <div className="no-scrollbar -mx-5 flex h-[108px] gap-3 overflow-x-auto px-5">
      {images.map((url, i) => (
        <div key={url} className="relative h-[108px] w-[108px] shrink-0">
          <button
            type="button"
            aria-label={i === 0 ? 'Cover photo' : 'Make this the cover photo'}
            disabled={i === 0}
            onClick={() => onMakeCover(i)}
            className="h-full w-full"
          >
            <BlorbImage url={url} radius={14} decodeWidth={260} />
          </button>
          {i === 0 && (
            <span className="absolute bottom-1.5 left-1.5">
              <Pill label="Cover" tone="brand" solid dense />
            </span>
          )}
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => onRemove(i)}
            className="press absolute right-1 top-1 grid h-[26px] w-[26px] place-items-center rounded-full shadow-xs"
            style={{ '--ps': 0.85, background: 'rgb(255 255 255 / 0.92)' } as CSSProperties}
          >
            <Icon name="round/close" size={15} color="var(--color-danger)" />
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="Add photo"
        disabled={uploading}
        onClick={onAdd}
        className="press h-[108px] w-[108px] shrink-0"
        style={{ '--ps': 0.94 } as CSSProperties}
      >
        <DottedSlot uploading={uploading} label="Add photo" icon="outlined/add_a_photo" compact />
      </button>
    </div>
  )
}

function AddonSummary({ groups, onEdit }: { groups: AddonGroup[]; onEdit: () => void }) {
  if (groups.length === 0) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="press flex w-full items-center rounded-[14px] border border-line bg-surface p-4 text-left"
        style={{ '--ps': 0.985 } as CSSProperties}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft">
          <Icon name="round/tune" size={19} color="var(--color-brand)" />
        </span>
        <span className="ml-3.5 min-w-0 flex-1">
          <span className="t-h4 block">Add choices</span>
          <span className="t-caption-sm mt-0.5 block">Optional. Lets customers pick a protein or add a drink.</span>
        </span>
        <Icon name="round/chevron_right" color="var(--color-ink-faint)" />
      </button>
    )
  }
  return (
    <Card onClick={onEdit} padding="0 16px" label="Edit choices">
      {groups.map((g, i) => (
        <div key={g.id}>
          <div className="flex items-center py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="t-h4 truncate">{g.name}</span>
                {groupRequired(g) && <Pill label="Required" tone="brand" dense />}
              </div>
              <p className="t-caption-sm mt-0.5">{groupSummary(g)}</p>
            </div>
            <Icon name="round/chevron_right" color="var(--color-ink-faint)" />
          </div>
          {i !== groups.length - 1 && <Divider />}
        </div>
      ))}
    </Card>
  )
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle: ReactNode
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center rounded-[14px] border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="t-h4">{title}</p>
        <p className="t-caption-sm mt-0.5">{subtitle}</p>
      </div>
      <div className="ml-3">
        <Switch checked={value} onChange={onChange} label={title} />
      </div>
    </div>
  )
}

/** The exact row the buyer app renders — what stops "RICE!!!" with no photo. */
function CustomerPreview({ draft, noun }: { draft: ProductDraft; noun: string }) {
  return (
    <div className="flex items-start rounded-[18px] border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="t-h4 line-clamp-2" style={{ color: draft.name ? 'var(--color-ink)' : 'var(--color-ink-faint)' }}>
          {draft.name || `Your ${noun} name`}
        </p>
        {draft.description && <p className="t-body-sm mt-1.5 line-clamp-2">{draft.description}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="t-price">{money(effectivePrice(draft))}</span>
          {hasDiscount(draft) && <span className="t-price-struck">{money(draft.price)}</span>}
        </div>
      </div>
      <div className="ml-4">
        {coverImage(draft) ? (
          <BlorbImage url={coverImage(draft)} width={92} height={92} radius={14} />
        ) : (
          <div className="grid h-[92px] w-[92px] place-items-center rounded-[14px] bg-sunken">
            <Icon name="outlined/image" color="var(--color-ink-faint)" />
          </div>
        )}
      </div>
    </div>
  )
}
