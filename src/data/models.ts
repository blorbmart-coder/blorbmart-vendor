import { GeoPoint, serverTimestamp, type DocumentData } from 'firebase/firestore'
import eventArt from '../assets/event.png'
import pharmacyArt from '../assets/pharmacy.png'
import restaurantArt from '../assets/restaurant.png'
import type { IconName } from '../components/Icon'
import {
  asBool,
  asDouble,
  asInt,
  asString,
  asStringList,
  isRecord,
} from '../lib/format'
import { buildSearchKeywords } from '../lib/searchIndex'

/* ─────────────────────────────────────────────────────────────────────────
   The three kinds of business that can sell on Blorbmart.

   The single most important field a vendor sets: it decides which hub they
   appear in on the buyer app, what their products are called, and which
   fields the product form asks for.
   ───────────────────────────────────────────────────────────────────────── */
export type BusinessType = 'restaurant' | 'pharmacy' | 'events'

export const BUSINESS_TYPES: readonly BusinessType[] = ['restaurant', 'pharmacy', 'events']

interface BusinessInfo {
  /** Written to `stores.vertical`. The buyer app reads exactly these. */
  id: string
  label: string
  pitch: string
  itemNoun: string
  itemNounPlural: string
  menuNoun: string
  asset: string
  icon: IconName
  color: string
  softColor: string
  sections: string[]
  tags: string[]
  tracksStockByDefault: boolean
}

export const BUSINESS: Record<BusinessType, BusinessInfo> = {
  restaurant: {
    id: 'restaurants',
    label: 'Restaurant',
    pitch: 'You cook. Buffets, bukas, grills, fast food, anything hot.',
    itemNoun: 'dish',
    itemNounPlural: 'dishes',
    menuNoun: 'Menu',
    asset: restaurantArt,
    icon: 'round/restaurant',
    color: 'var(--color-restaurants)',
    softColor: 'var(--color-restaurants-soft)',
    sections: [
      'Rice dishes',
      'Swallow and soup',
      'Grills and barbecue',
      'Proteins',
      'Pasta and noodles',
      'Breakfast',
      'Snacks and sides',
      'Salads',
      'Soft drinks',
      'Juices and smoothies',
      'Desserts',
    ],
    tags: [
      'Nigerian',
      'Rice',
      'Grills',
      'Fast food',
      'Continental',
      'Chinese',
      'Shawarma',
      'Pizza',
      'Seafood',
      'Vegetarian',
      'Breakfast',
      'Buka',
    ],
    tracksStockByDefault: false,
  },
  pharmacy: {
    id: 'pharmacy',
    label: 'Pharmacy',
    pitch: 'You dispense. Medicines, wellness, personal care.',
    itemNoun: 'product',
    itemNounPlural: 'products',
    menuNoun: 'Catalogue',
    asset: pharmacyArt,
    icon: 'round/medical_services',
    color: 'var(--color-pharmacy)',
    softColor: 'var(--color-pharmacy-soft)',
    sections: [
      'Pain relief',
      'Malaria and fever',
      'Cough and cold',
      'Antibiotics',
      'Vitamins and supplements',
      'First aid',
      'Baby care',
      'Personal care',
      'Sexual health',
      'Diabetes care',
      'Devices and tests',
    ],
    tags: ['Prescription', 'Over the counter', 'Wellness', 'Baby care', 'Personal care', 'Devices'],
    tracksStockByDefault: true,
  },
  events: {
    id: 'events',
    label: 'Event organizer',
    pitch: 'You run events. Sell tickets — paid or free — and check people in at the door.',
    itemNoun: 'event',
    itemNounPlural: 'events',
    menuNoun: 'Events',
    asset: eventArt,
    icon: 'round/confirmation_number',
    color: 'var(--color-events)',
    softColor: 'var(--color-events-soft)',
    sections: ['Music', 'Party', 'Conference', 'Sports', 'Faith', 'Comedy', 'Theatre', 'Workshop'],
    tags: ['Live music', 'Afrobeats', 'Comedy', 'Conference', 'Networking', 'Sports', 'Faith', 'Festival'],
    tracksStockByDefault: false,
  },
}

export function businessTypeFromId(raw: string | null | undefined): BusinessType {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'pharmacy':
    case 'pharmacies':
    case 'health':
      return 'pharmacy'
    case 'events':
    case 'event':
    case 'event_planning':
      return 'events'
    default:
      return 'restaurant'
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   The vendor's store, as this app reads and writes it. One shape for both
   the `stores` document the buyer app reads and the onboarding draft.
   ───────────────────────────────────────────────────────────────────────── */
export interface StoreProfile {
  id: string
  vendorId: string
  name: string
  type: BusinessType
  tagline: string
  logoUrl: string
  bannerUrl: string
  tags: string[]
  phone: string
  email: string
  address: string
  city: string
  state: string
  /**
   * The campus this store trades on. Buyers are filtered against it and every
   * product inherits a copy, so it decides whether this shop is visible at
   * all. Empty on stores created before campuses existed, which the buyer
   * apps read as "show to everyone".
   */
  universityId: string
  universityName: string
  latitude: number | null
  longitude: number | null
  openingHour: number
  closingHour: number
  /** ISO weekday numbers, 1 = Monday. */
  openDays: number[]
  prepMinutes: number
  minOrder: number
  deliveryFee: number
  acceptsPreorder: boolean
  /** Live on the buyer app. Only true once onboarding finishes. */
  isActive: boolean
  /** The vendor's own open/closed switch, independent of trading hours. */
  isOpen: boolean
  rating: number
  ratingCount: number
  totalOrders: number
  /** Persisted so a vendor who leaves halfway resumes on the same step. */
  onboardingStep: number
  onboardingComplete: boolean
}

export const blankStore: StoreProfile = {
  id: '',
  vendorId: '',
  name: '',
  type: 'restaurant',
  tagline: '',
  logoUrl: '',
  bannerUrl: '',
  tags: [],
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  universityId: '',
  universityName: '',
  latitude: null,
  longitude: null,
  openingHour: 8,
  closingHour: 22,
  openDays: [1, 2, 3, 4, 5, 6, 7],
  prepMinutes: 25,
  minOrder: 0,
  deliveryFee: 0,
  acceptsPreorder: false,
  isActive: false,
  isOpen: true,
  rating: 0,
  ratingCount: 0,
  totalOrders: 0,
  onboardingStep: 0,
  onboardingComplete: false,
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function storeFromDoc(id: string, m: DocumentData): StoreProfile {
  const geo = m.location
  let latitude: number | null = null
  let longitude: number | null = null
  if (geo instanceof GeoPoint) {
    latitude = geo.latitude
    longitude = geo.longitude
  } else if (isRecord(geo)) {
    const lat = asDouble(geo.lat, Number.NaN)
    const lng = asDouble(geo.lng, Number.NaN)
    if (!Number.isNaN(lat)) latitude = lat
    if (!Number.isNaN(lng)) longitude = lng
  }

  return {
    id,
    vendorId: asString(m.vendorId ?? m.userId),
    name: asString(m.storeName ?? m.businessName),
    type: businessTypeFromId(asString(m.vertical)),
    tagline: asString(m.tagline ?? m.description),
    logoUrl: asString(m.logoUrl ?? m.logoImageUrl),
    bannerUrl: asString(m.bannerUrl ?? m.bannerImageUrl),
    tags: asStringList(m.cuisines ?? m.tags),
    phone: asString(m.phone ?? m.businessPhone),
    email: asString(m.email ?? m.businessEmail),
    address: asString(m.address),
    city: asString(m.city),
    state: asString(m.state),
    universityId: asString(m.universityId),
    universityName: asString(m.universityName),
    latitude,
    longitude,
    openingHour: clamp(asInt(m.openingHour, 8), 0, 23),
    closingHour: clamp(asInt(m.closingHour, 22), 1, 24),
    openDays: Array.isArray(m.openDays) ? m.openDays.map((e: unknown) => asInt(e)) : [1, 2, 3, 4, 5, 6, 7],
    prepMinutes: asInt(m.prepTimeMins, 25),
    minOrder: asDouble(m.minOrder),
    deliveryFee: asDouble(m.deliveryFee),
    acceptsPreorder: asBool(m.acceptsPreorder),
    isActive: asBool(m.isActive),
    isOpen: asBool(m.isOpen, true),
    rating: asDouble(m.rating),
    ratingCount: asInt(m.ratingCount),
    totalOrders: asInt(m.totalOrders),
    onboardingStep: asInt(m.onboardingStep),
    onboardingComplete: asBool(m.onboardingComplete),
  }
}

/**
 * The document the buyer app reads. Field names here are a contract —
 * changing one silently breaks the storefront.
 */
export function storeToFirestore(s: StoreProfile): DocumentData {
  return {
    storeId: s.id,
    vendorId: s.vendorId,
    storeName: s.name,
    businessName: s.name,
    vertical: BUSINESS[s.type].id,
    tagline: s.tagline,
    description: s.tagline,
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    cuisines: s.tags,
    tags: s.tags,
    phone: s.phone,
    email: s.email,
    address: s.address,
    city: s.city,
    state: s.state,
    universityId: s.universityId,
    universityName: s.universityName,
    ...(s.latitude != null && s.longitude != null ? { location: new GeoPoint(s.latitude, s.longitude) } : {}),
    openingHour: s.openingHour,
    closingHour: s.closingHour,
    openDays: s.openDays,
    prepTimeMins: s.prepMinutes,
    minOrder: s.minOrder,
    deliveryFee: s.deliveryFee,
    acceptsPreorder: s.acceptsPreorder,
    isActive: s.isActive,
    isOpen: s.isOpen,
    onboardingStep: s.onboardingStep,
    onboardingComplete: s.onboardingComplete,
    updatedAt: serverTimestamp(),
  }
}

/** What still has to be true before this store can go live. */
export function missingForLaunch(s: StoreProfile): string[] {
  const missing: string[] = []
  if (!s.name.trim()) missing.push('Business name')
  if (!s.address.trim() || !s.city.trim()) missing.push('Pickup address')
  if (!s.phone.trim()) missing.push('Phone number')
  if (!s.logoUrl) missing.push('Logo')
  return missing
}

export function isOpenNow(s: StoreProfile, now = new Date()): boolean {
  if (!s.isActive || !s.isOpen) return false
  const weekday = now.getDay() === 0 ? 7 : now.getDay()
  if (!s.openDays.includes(weekday)) return false
  const hour = now.getHours()
  if (s.closingHour > s.openingHour) return hour >= s.openingHour && hour < s.closingHour
  return hour >= s.openingHour || hour < s.closingHour
}

export function hoursLabel(s: StoreProfile): string {
  const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? 'pm' : 'am'}`
  return `${fmt(s.openingHour)} – ${fmt(s.closingHour === 24 ? 0 : s.closingHour)}`
}

/* ─────────────────────────────────────────────────────────────────────────
   Products.

   productToFirestore owns the contract with the buyer app — including the
   `searchKeywords` prefix index, which is the reason a dish typed here is
   findable there.
   ───────────────────────────────────────────────────────────────────────── */

/** One choice a customer can make on an item: "Beef", "Extra plantain". */
export interface AddonOption {
  name: string
  price: number
  isDefault: boolean
  available: boolean
}

/** A group of choices: "Choose your protein", "Add a drink". */
export interface AddonGroup {
  id: string
  name: string
  options: AddonOption[]
  /** Above zero makes the group required. */
  min: number
  /** One makes it behave like a radio group. */
  max: number
}

export const addonOption = (name: string, price = 0, isDefault = false): AddonOption => ({
  name,
  price,
  isDefault,
  available: true,
})

export const groupRequired = (g: AddonGroup) => g.min > 0

export function groupSummary(g: AddonGroup): string {
  if (g.options.length === 0) return 'No options yet'
  const rule = groupRequired(g)
    ? g.min === g.max
      ? `Pick ${g.min}`
      : `Pick at least ${g.min}`
    : g.max > 1
      ? `Up to ${g.max}`
      : 'Optional'
  return `${g.options.length} option${g.options.length === 1 ? '' : 's'} · ${rule}`
}

function optionFromMap(m: Record<string, unknown>): AddonOption {
  return {
    name: asString(m.name),
    price: asDouble(m.price),
    isDefault: asBool(m.isDefault),
    available: asBool(m.available, true),
  }
}

function groupFromMap(m: Record<string, unknown>): AddonGroup {
  return {
    id: asString(m.id, asString(m.name)),
    name: asString(m.name, 'Options'),
    options: Array.isArray(m.options) ? m.options.filter(isRecord).map(optionFromMap) : [],
    min: asInt(m.min),
    max: asInt(m.max, 1),
  }
}

export interface ProductDraft {
  id: string
  name: string
  description: string
  price: number
  discountPrice: number
  section: string
  images: string[]
  addonGroups: AddonGroup[]
  prepMinutes: number
  packagingFee: number
  stockQuantity: number
  tracksStock: boolean
  isAvailable: boolean
  dietaryTags: string[]
  requiresPrescription: boolean
  brand: string
  totalSold: number
  rating: number
  totalReviews: number
}

export const blankProduct: ProductDraft = {
  id: '',
  name: '',
  description: '',
  price: 0,
  discountPrice: 0,
  section: '',
  images: [],
  addonGroups: [],
  prepMinutes: 15,
  packagingFee: 0,
  stockQuantity: 0,
  tracksStock: false,
  isAvailable: true,
  dietaryTags: [],
  requiresPrescription: false,
  brand: '',
  totalSold: 0,
  rating: 0,
  totalReviews: 0,
}

export const hasDiscount = (p: ProductDraft) => p.discountPrice > 0 && p.discountPrice < p.price
export const effectivePrice = (p: ProductDraft) => (hasDiscount(p) ? p.discountPrice : p.price)
export const discountPercent = (p: ProductDraft) =>
  hasDiscount(p) ? Math.round(((p.price - p.discountPrice) / p.price) * 100) : 0
export const coverImage = (p: ProductDraft) => p.images[0] ?? ''

export function productFromDoc(id: string, m: DocumentData): ProductDraft {
  return {
    id,
    name: asString(m.name),
    description: asString(m.description),
    price: asDouble(m.price),
    discountPrice: asDouble(m.discountPrice),
    section: asString(m.section ?? m.subCategoryName),
    images: asStringList(m.images),
    addonGroups: Array.isArray(m.addonGroups) ? m.addonGroups.filter(isRecord).map(groupFromMap) : [],
    prepMinutes: asInt(m.prepTimeMins, 15),
    packagingFee: asDouble(m.packagingFee),
    stockQuantity: asInt(m.stockQuantity),
    tracksStock: asBool(m.tracksStock),
    isAvailable: asBool(m.isAvailable, true) && asString(m.status, 'active') === 'active',
    dietaryTags: asStringList(m.dietaryTags),
    requiresPrescription: asBool(m.requiresPrescription),
    brand: asString(m.brand),
    totalSold: asInt(m.totalSold),
    rating: asDouble(m.rating),
    totalReviews: asInt(m.totalReviews),
  }
}

/**
 * Builds the document the buyer app reads. The store supplies the
 * denormalised fields — name, vertical, vendor, campus — so a search result
 * page of forty dishes never costs forty extra store lookups.
 */
export function productToFirestore(p: ProductDraft, store: StoreProfile): DocumentData {
  const info = BUSINESS[store.type]
  const keywords = buildSearchKeywords(
    [p.name, p.brand, p.section],
    [p.description, store.name, info.label, ...store.tags, ...p.dietaryTags],
  )
  const discounted = hasDiscount(p)

  return {
    // Identity
    storeId: store.id,
    storeName: store.name,
    businessName: store.name,
    vendorId: store.vendorId,
    vertical: info.id,

    // Campus — copied from the store so rails that never load the store can
    // still be narrowed to a campus.
    universityId: store.universityId,
    universityName: store.universityName,

    // What it is
    name: p.name.trim(),
    description: p.description.trim(),
    brand: p.brand.trim(),
    section: p.section.trim(),
    subCategoryName: p.section.trim(),
    categoryName: info.label,
    categoryId: info.id,

    // Money
    price: p.price,
    discountPrice: discounted ? p.discountPrice : 0,
    packagingFee: p.packagingFee,

    // Fulfilment
    prepTimeMins: p.prepMinutes,
    stockQuantity: p.stockQuantity,
    tracksStock: p.tracksStock,
    isAvailable: p.isAvailable,
    status: p.isAvailable ? 'active' : 'inactive',

    // Presentation
    images: p.images,
    dietaryTags: p.dietaryTags,
    requiresPrescription: p.requiresPrescription,
    addonGroups: p.addonGroups.map((g) => ({
      id: g.id,
      name: g.name,
      min: g.min,
      max: g.max,
      options: g.options.map((o) => ({
        name: o.name,
        price: o.price,
        isDefault: o.isDefault,
        available: o.available,
      })),
    })),
    hasVariants: p.addonGroups.length > 0,

    // Search — generated, never hand-edited.
    searchKeywords: keywords,

    updatedAt: serverTimestamp(),
  }
}

/** Written only on insert, so an edit never resets sales history or rating. */
export const creationFields = (): DocumentData => ({
  rating: 0,
  totalReviews: 0,
  totalSold: 0,
  isPopular: false,
  createdAt: serverTimestamp(),
})

/** Everything wrong with a draft, as sentences a vendor can act on. */
export function validateProduct(p: ProductDraft): string[] {
  const errors: string[] = []
  if (p.name.trim().length < 2) errors.push('Give it a name customers will recognise.')
  if (p.price <= 0) errors.push('Set a price above zero.')
  if (p.discountPrice > 0 && p.discountPrice >= p.price) {
    errors.push('The discount price must be lower than the normal price.')
  }
  if (p.images.length === 0) errors.push('Add at least one photo. Items with photos sell far more.')
  for (const g of p.addonGroups) {
    if (g.options.length === 0) errors.push(`"${g.name}" has no options yet.`)
    if (g.min > g.options.length) errors.push(`"${g.name}" asks for more choices than it offers.`)
    if (g.max < g.min) errors.push(`"${g.name}" has a maximum below its minimum.`)
  }
  return errors
}
