import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../../app/stack'
import { AppBar, Fab, Page, PageBody } from '../../components/AppBar'
import { BlorbImage } from '../../components/BlorbImage'
import { IconBtn } from '../../components/Button'
import { FadeSlideIn, staggerFor } from '../../components/motion'
import { confirmBlorb, showMenu, toast } from '../../components/overlay'
import { SearchField } from '../../components/SearchField'
import { Switch } from '../../components/Switch'
import { Card, Empty, Pill, Skeleton } from '../../components/ui'
import { menuRepo } from '../../data/menuRepo'
import {
  BUSINESS,
  coverImage,
  effectivePrice,
  hasDiscount,
  type ProductDraft,
  type StoreProfile,
} from '../../data/models'
import { useStore } from '../../data/storeRepo'
import { compactCount, money, titleCase } from '../../lib/format'
import { haptic } from '../../lib/haptics'

/* ─────────────────────────────────────────────────────────────────────────
   The vendor's catalogue, grouped by section exactly as the buyer app
   groups it. The availability switch on every row is the interaction that
   matters most: a kitchen out of chicken hides that dish in one tap.
   ───────────────────────────────────────────────────────────────────────── */
export default function MenuScreen() {
  const store = useStore()
  if (!store) {
    return (
      <Page>
        <AppBar title="Menu" back={false} />
        <Empty title="No store yet" message="Finish setting up your store to add items." icon="outlined/storefront" />
      </Page>
    )
  }
  return <MenuForStore store={store} />
}

function MenuForStore({ store }: { store: StoreProfile }) {
  const nav = useNav()
  const info = BUSINESS[store.type]
  const [items, setItems] = useState<ProductDraft[] | null>(null)
  const [query, setQuery] = useState('')
  const reindexing = useRef(false)
  const moreRef = useRef<HTMLDivElement>(null)

  // The error path keeps the skeleton, as the Flutter stream does; a
  // snapshot that recovers replaces it.
  useEffect(() => menuRepo.watch(store.id, setItems, () => undefined), [store.id])

  const reindex = async () => {
    const confirmed = await confirmBlorb({
      title: 'Rebuild search index?',
      message:
        'Re-saves every item so customers find them under your current store name and business type. Nothing is deleted.',
      confirmLabel: 'Rebuild',
      icon: 'round/search',
    })
    if (!confirmed || reindexing.current) return
    reindexing.current = true
    try {
      const count = await menuRepo.reindexAll(store)
      toast(`${count} item${count === 1 ? '' : 's'} reindexed`, { tone: 'success' })
    } catch {
      toast('Could not rebuild the index.', { tone: 'danger' })
    } finally {
      reindexing.current = false
    }
  }

  const openMenu = async () => {
    const anchor = moreRef.current
    if (!anchor) return
    const choice = await showMenu(anchor, [{ value: 'reindex', label: 'Rebuild search index', icon: 'round/search' }])
    if (choice === 'reindex') void reindex()
  }

  const visible = useMemo(() => {
    if (!items) return []
    const q = query.toLowerCase()
    return q
      ? items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.section.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        )
      : items
  }, [items, query])

  const sections = useMemo(() => {
    const map = new Map<string, ProductDraft[]>()
    for (const product of visible) {
      const key = product.section.trim() ? titleCase(product.section) : 'Not in a section'
      const list = map.get(key)
      if (list) list.push(product)
      else map.set(key, [product])
    }
    return [...map.entries()]
  }, [visible])

  const all = items ?? []
  const hidden = all.filter((p) => !p.isAvailable).length

  return (
    <Page>
      <AppBar
        title={info.menuNoun}
        back={false}
        actions={
          <>
            <div ref={moreRef}>
              <IconBtn icon="round/more_vert" tooltip="More" onClick={() => void openMenu()} />
            </div>
            <span className="w-1" />
          </>
        }
      />
      <PageBody>
        {items === null ? (
          <div className="p-5">
            <Skeleton height={52} radius={14} />
            <Skeleton width={120} height={18} className="mt-6" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={88} radius={18} />
              ))}
            </div>
          </div>
        ) : all.length === 0 ? (
          <Empty
            title={`Your ${info.menuNoun.toLowerCase()} is empty`}
            message="Customers cannot order anything until you add something. Start with your five best sellers."
            icon={info.icon}
            tone={info.color}
            actionLabel={`Add your first ${info.itemNoun}`}
            onAction={() => void nav.push('/catalogue/new')}
          />
        ) : (
          <div className="pb-[110px]">
            <div className="px-5 pb-3 pt-4">
              <SearchField value={query} onChange={setQuery} hint={`Search your ${info.itemNounPlural}`} />
            </div>
            <div className="flex items-center gap-2 px-5">
              <span className="t-overline">
                {all.length} {all.length === 1 ? info.itemNoun : info.itemNounPlural}
              </span>
              {hidden > 0 && <span className="t-overline text-warning">· {hidden} hidden</span>}
            </div>
            {visible.length === 0 ? (
              <Empty title="Nothing matched" message={`No item matches "${query}".`} icon="round/search_off" compact />
            ) : (
              sections.map(([name, products]) => (
                <section key={name}>
                  <div className="flex items-center gap-2 px-5 pb-2 pt-5">
                    <h2 className="t-h3">{name}</h2>
                    <span className="t-caption">{products.length}</span>
                  </div>
                  <div className="space-y-2 px-5">
                    {products.map((product, i) => (
                      <FadeSlideIn key={product.id} delay={staggerFor(i, 4)}>
                        <ProductRow product={product} />
                      </FadeSlideIn>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
        {items !== null && (
          <Fab icon="round/add" label={`Add ${info.itemNoun}`} onClick={() => void nav.push('/catalogue/new')} />
        )}
      </PageBody>
    </Page>
  )
}

function ProductRow({ product }: { product: ProductDraft }) {
  const nav = useNav()
  const soldOut = product.tracksStock && product.stockQuantity <= 0
  const groups = product.addonGroups.length

  return (
    <Card
      padding={12}
      label={product.name}
      onClick={() => void nav.push(`/catalogue/${encodeURIComponent(product.id)}`, { product })}
    >
      <div className="flex items-center" style={{ opacity: product.isAvailable ? 1 : 0.55 }}>
        <BlorbImage url={coverImage(product)} width={62} height={62} radius={10} fallbackLabel={product.name} />
        <div className="ml-3 min-w-0 flex-1">
          <p className="t-h4 truncate">{product.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="t-price-sm">{money(effectivePrice(product))}</span>
            {hasDiscount(product) && <span className="t-price-struck">{money(product.price)}</span>}
            {product.totalSold > 0 && <span className="t-caption-sm ml-0.5">· {compactCount(product.totalSold)} sold</span>}
          </div>
          {(soldOut || groups > 0) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {soldOut && <Pill label="Out of stock" tone="danger" dense />}
              {groups > 0 && <Pill label={`${groups} choice group${groups === 1 ? '' : 's'}`} dense />}
            </div>
          )}
        </div>
        <div className="ml-2">
          <Switch
            checked={product.isAvailable}
            label={`${product.name} available`}
            onChange={(v) => {
              haptic.selection()
              menuRepo.setAvailable(product.id, v).catch(() => toast('Could not update that.', { tone: 'danger' }))
            }}
          />
        </div>
      </div>
    </Card>
  )
}
