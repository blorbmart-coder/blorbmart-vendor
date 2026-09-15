import { useNav } from '../../app/stack'
import { AppBar, Page, PageBody } from '../../components/AppBar'
import { FadeSlideIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { BUSINESS, hoursLabel, type StoreProfile } from '../../data/models'
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
      return [store.address, store.city].filter(Boolean).join(', ') || 'Add the address riders come to'
    case 'hours': {
      const days = store.openDays.length === 7 ? 'every day' : `${store.openDays.length} days a week`
      return `${hoursLabel(store)}, ${days}`
    }
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
              </Group>
            </FadeSlideIn>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
