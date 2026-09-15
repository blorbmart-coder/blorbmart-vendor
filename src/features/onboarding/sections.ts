import type { IconName } from '../../components/Icon'

export type SectionKey = 'basics' | 'location' | 'hours' | 'fulfilment' | 'branding'

export interface StoreSection {
  key: SectionKey
  /** The onboarding step that edits it. */
  step: number
  label: string
  icon: IconName
}

/**
 * The details a live store edits one at a time from Store details, each one a
 * step of onboarding opened on its own. Business type (step 0) is not here:
 * it is fixed once the store is live.
 */
export const STORE_SECTIONS: readonly StoreSection[] = [
  { key: 'basics', step: 1, label: 'Name and description', icon: 'outlined/edit' },
  { key: 'location', step: 2, label: 'Pickup address', icon: 'outlined/location_on' },
  { key: 'hours', step: 3, label: 'Opening hours', icon: 'round/schedule' },
  { key: 'fulfilment', step: 4, label: 'Orders and delivery', icon: 'outlined/timer' },
  { key: 'branding', step: 5, label: 'Logo and cover photo', icon: 'round/photo_camera' },
]

export const sectionByKey = (key: string | undefined): StoreSection | null =>
  STORE_SECTIONS.find((section) => section.key === key) ?? null
