import { useNav } from '../../app/stack'
import { AppBar, Page, PageBody } from '../../components/AppBar'
import { FadeSlideIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { BUSINESS, weekSummary, type StoreProfile } from '../../data/models'
import { useStore } from '../../data/storeRepo'
import { money } from '../../lib/format'
import { STORE_SECTIONS, type SectionKey } from '../onboarding/sections'
import { Group, Tile } from './SettingsList'

/** What each section holds now, so a vendor can see what to change before opening it. */
function summary(store: StoreProfile, key: SectionKey): string {
  switch (key) {
    case 'basics':
      return store.name || 'Add your business name'
    case 'location':
      // No pin means a flat delivery fee on every order, so say so first.
      if (store.latitude == null || store.longitude == null) return 'Not on the map yet · tap to pin your shop'
      return [store.address, store.city].filter(Boolean).join(', ') || 'Pinned · add the address riders come to'
    case 'hours':
      return weekSummary(store.weeklyHours)
    case 'fulfilment':
      return store.minOrder > 0
        ? `${store.prepMinutes} min prep · ${money(store.minOrder)} minimum`
        : `${store.prepMinutes} min prep`
    case 'branding':
      if (store.logoUrl && store.bannerUrl) return 'Logo and cover set'
      return store.logoUrl ? 'Logo set, no cover yet' : 'No logo yet'
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Store details, one section at a time.

   "Edit store details" used to reopen the six-step setup flow, which resumes
   where a vendor left off — and a live store had left off at the end, so it
   opened on "Step 6 of 6" with five back-taps between the vendor and their
   address. Each section here opens on its own and saves straight back.
   ───────────────────────────────────────────────────────────────────────── */
export default function StoreDetailsScreen() {
  const nav = useNav()
  const store = useStore()

  return (
    <Page>
      <AppBar title="Store details" />
      <PageBody>
        <div className="px-5 pb-[120px] pt-2">
          {store && (
            <FadeSlideIn>
              <Group title="Your store">
                <Tile
                  icon={BUSINESS[store.type].icon}
                  label="Business type"
                  subtitle={BUSINESS[store.type].label}
                  locked
                  onClick={() => toast('Your business type is set. Message Blorbmart if it needs to change.')}
                />
                {STORE_SECTIONS.map((section) => (
                  <Tile
                    key={section.key}
                    icon={section.icon}
                    label={section.label}
                    subtitle={summary(store, section.key)}
                    onClick={() => void nav.push(`/store/details/${section.key}`)}
                  />
                ))}
                {store.type !== 'events' && (
                  <Tile
                    icon="round/event"
                    label="Pre-orders"
                    subtitle={store.acceptsPreorder ? 'On · customers can order ahead' : 'Off · let customers order ahead'}
                    onClick={() => void nav.push('/store/preorders')}
                  />
                )}
              </Group>
            </FadeSlideIn>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
