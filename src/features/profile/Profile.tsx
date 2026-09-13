import { useState, type CSSProperties, type ReactNode } from 'react'
import { signOut } from '../../app/session'
import { useNav } from '../../app/stack'
import logo from '../../assets/logo-mark.png'
import { AppBar, Page, PageBody } from '../../components/AppBar'
import { BlorbImage } from '../../components/BlorbImage'
import { Icon, type IconName } from '../../components/Icon'
import { FadeSlideIn } from '../../components/motion'
import { confirmBlorb, toast } from '../../components/overlay'
import { Card, Divider, Pill } from '../../components/ui'
import { BUSINESS, hoursLabel, isOpenNow, type StoreProfile } from '../../data/models'
import { useStore } from '../../data/storeRepo'
import { compactCount } from '../../lib/format'
import { showCampusSheet } from './CampusSheet'
import { pickStoreMedia } from './StoreMedia'

const WHATSAPP = `https://wa.me/2349022594853?text=${encodeURIComponent('Hello Blorbmart, I am a vendor and I need help')}`

/** A link out, opened with no way back into this page. */
function openExternal(url: string) {
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) toast('Could not open that link.', { tone: 'danger' })
}

/** Store settings and everything a vendor manages about themselves. */
export default function ProfileScreen() {
  const nav = useNav()
  const store = useStore()
  const [leaving, setLeaving] = useState(false)

  const leave = async () => {
    const confirmed = await confirmBlorb({
      title: 'Sign out?',
      message: 'Your store stays live and keeps taking orders while you are signed out.',
      confirmLabel: 'Sign out',
      destructive: true,
      icon: 'round/logout',
    })
    if (!confirmed || leaving) return
    setLeaving(true)
    await signOut()
    nav.reset('/login')
  }

  return (
    <Page>
      <AppBar title="My store" back={false} />
      <PageBody>
        <div className="px-5 pb-[120px] pt-2">
          {store && (
            <>
              <FadeSlideIn>
                <StoreHeader store={store} />
              </FadeSlideIn>
              <FadeSlideIn delay={60} className="mt-5 flex gap-3">
                <MiniStat
                  label="Rating"
                  value={store.rating > 0 ? store.rating.toFixed(1) : 'New'}
                  icon="round/star"
                  color="var(--color-amber)"
                />
                <MiniStat label="Orders" value={compactCount(store.totalOrders)} icon="round/receipt_long" color="var(--color-brand)" />
                <MiniStat label="Prep time" value={`${store.prepMinutes}m`} icon="outlined/timer" color="var(--color-events)" />
              </FadeSlideIn>
              <div className="h-6" />
            </>
          )}

          <Group title="Store">
            <Tile
              icon="outlined/edit"
              label="Edit store details"
              subtitle="Name, hours, address, photos"
              onClick={() => void nav.push('/onboarding')}
            />
            {/* High in the group: it decides whether anyone sees this shop at
                all, and every store made before campuses needs to fix it. */}
            {store && (
              <Tile
                icon="outlined/school"
                label="Campus"
                subtitle={store.universityName || 'Not set — you show on every campus'}
                onClick={() => void showCampusSheet()}
              />
            )}
            {/* Fixed once live: it decides the vertical, the tabs and the
                commission. Also enforced in the Firestore rules. */}
            {store && (
              <Tile
                icon={BUSINESS[store.type].icon}
                label="Business type"
                subtitle={BUSINESS[store.type].label}
                locked
                onClick={() => toast('Your business type is set. Message Blorbmart if it needs to change.')}
              />
            )}
            {store && (
              <Tile
                icon="round/schedule"
                label="Opening hours"
                subtitle={hoursLabel(store)}
                onClick={() => void nav.push('/onboarding')}
              />
            )}
          </Group>

          <div className="h-4" />
          <Group title="Money">
            <Tile
              icon="outlined/account_balance_wallet"
              label="Earnings and payouts"
              subtitle="Balance, withdrawals, bank account"
              onClick={() => void nav.push('/wallet')}
            />
          </Group>

          <div className="h-4" />
          <Group title="Support">
            <Tile
              icon="round/chat_bubble_outline"
              label="Talk to Blorbmart"
              subtitle="We answer on WhatsApp"
              onClick={() => openExternal(WHATSAPP)}
            />
            <Tile icon="round/help_outline" label="Vendor guide" onClick={() => openExternal('https://blorbmart.com/vendors')} />
          </Group>

          <div className="h-4" />
          <Group title="Account">
            <Tile icon="round/logout" label="Sign out" danger onClick={() => void leave()} />
          </Group>

          <div className="mt-8 flex flex-col items-center">
            <img src={logo} alt="" width={26} height={26} style={{ opacity: 0.35 }} />
            <p className="t-caption-sm mt-2">Blorbmart for vendors · v1.1.0</p>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

function StoreHeader({ store }: { store: StoreProfile }) {
  const info = BUSINESS[store.type]
  const open = isOpenNow(store)
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
      {/* The whole cover is the target, with a visible affordance — a photo
          that happens to be tappable reads as decoration. */}
      <button
        type="button"
        aria-label={store.bannerUrl ? 'Change cover photo' : 'Add cover photo'}
        onClick={() => void pickStoreMedia('banner')}
        className="ink relative block h-[120px] w-full"
        style={{ '--ink': 'rgb(255 255 255 / 0.12)' } as CSSProperties}
      >
        {store.bannerUrl ? (
          <BlorbImage url={store.bannerUrl} decodeWidth={800} />
        ) : (
          <span
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom right, ${info.color}, color-mix(in srgb, ${info.color} 75%, black))`,
            }}
          />
        )}
        <span
          className="absolute right-2 top-2 flex items-center gap-1.5 rounded-[10px] px-2.5 py-[5px]"
          style={{ background: 'rgb(0 0 0 / 0.45)' }}
        >
          <Icon name="round/photo_camera" size={13} color="#fff" />
          <span className="t-caption-sm font-bold text-white">{store.bannerUrl ? 'Change' : 'Add cover'}</span>
        </span>
      </button>
      <div className="flex items-center p-4">
        <button
          type="button"
          aria-label="Change logo"
          onClick={() => void pickStoreMedia('logo')}
          className="relative h-14 w-[62px] shrink-0"
        >
          <span
            className="grid h-14 w-14 place-items-center overflow-hidden rounded-[14px]"
            style={{ background: info.softColor }}
          >
            {store.logoUrl ? (
              <BlorbImage url={store.logoUrl} decodeWidth={200} />
            ) : (
              <Icon name={info.icon} color={info.color} />
            )}
          </span>
          <span
            className="absolute bottom-0 right-0 grid h-[22px] w-[22px] place-items-center rounded-full bg-brand"
            style={{ border: '2px solid var(--color-surface)' }}
          >
            <Icon name="round/photo_camera" size={11} color="#fff" />
          </span>
        </button>
        <div className="ml-3.5 min-w-0 flex-1">
          <p className="t-h2 truncate">{store.name || 'Your store'}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Pill label={info.label} dense />
            <Pill label={open ? 'Open' : 'Closed'} tone={open ? 'success' : 'neutral'} dense />
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, icon, color }: { label: string; value: string; icon: IconName; color: string }) {
  return (
    <Card padding="16px 8px" className="flex min-w-0 flex-1 flex-col items-center">
      <Icon name={icon} size={19} color={color} />
      <p className="t-h3 mt-2 max-w-full truncate">{value}</p>
      <p className="t-caption-sm mt-0.5">{label}</p>
    </Card>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const tiles = (Array.isArray(children) ? children : [children]).filter(Boolean) as ReactNode[]
  return (
    <section>
      <h2 className="t-overline pb-2 pl-1">{title.toUpperCase()}</h2>
      <Card padding={0} clip>
        {tiles.map((tile, i) => (
          <div key={i}>
            {tile}
            {i !== tiles.length - 1 && <Divider indent={60} />}
          </div>
        ))}
      </Card>
    </section>
  )
}

function Tile({
  icon,
  label,
  subtitle,
  onClick,
  danger = false,
  locked = false,
}: {
  icon: IconName
  label: string
  subtitle?: string
  onClick: () => void
  danger?: boolean
  /** Deliberately fixed: a padlock instead of a chevron, so nobody expects an editor. */
  locked?: boolean
}) {
  const color = danger ? 'var(--color-danger)' : 'var(--color-ink-strong)'
  return (
    <button type="button" onClick={onClick} className="ink flex w-full items-center p-4 text-left">
      <Icon name={icon} size={21} color={color} />
      <span className="ml-4 min-w-0 flex-1">
        <span className="t-h4 block" style={{ color }}>
          {label}
        </span>
        {subtitle && <span className="t-caption-sm mt-0.5 block truncate">{subtitle}</span>}
      </span>
      {locked ? (
        <Icon name="outlined/lock" size={18} color="var(--color-ink-faint)" />
      ) : (
        !danger && <Icon name="round/chevron_right" color="var(--color-ink-faint)" />
      )}
    </button>
  )
}
