import { useEffect, useState } from 'react'
import { signOut } from '../../app/session'
import { useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { BlorbButton } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { Card } from '../../components/ui'
import { useVendorStatus } from '../../data/statusRepo'

/**
 * The wall a vendor sits behind until an admin approves them.
 *
 * It listens rather than polls, so an approval that lands while this screen
 * is open moves the vendor through without them doing anything.
 */
export default function PendingScreen() {
  const nav = useNav()
  const { status, reason } = useVendorStatus()
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (status === 'active') nav.reset('/')
  }, [status, nav])

  const [icon, tone, heading, blurb]: [IconName, string, string, string] =
    status === 'suspended'
      ? [
          'round/pause_circle_outline',
          'var(--color-amber)',
          'Your store is paused',
          'Buyers cannot see your store or order from it at the moment.',
        ]
      : status === 'rejected'
        ? [
            'outlined/info',
            'var(--color-appetite)',
            'Your application was not approved',
            'If you think this is a mistake, get in touch and we will take another look.',
          ]
        : [
            'round/hourglass_top',
            'var(--color-brand)',
            'Almost there',
            'Your store is being reviewed. We will let you know the moment you can start taking orders — usually within a few hours.',
          ]

  const leave = async () => {
    setLeaving(true)
    await signOut()
    nav.reset('/login')
  }

  return (
    <Page>
      <div className="scroll-y pt-safe pb-safe flex flex-1 flex-col">
        <div className="m-auto flex w-full flex-col items-center px-6 py-8 text-center">
          <div
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, ${tone} 10%, transparent)` }}
          >
            <Icon name={icon} size={30} color={tone} />
          </div>
          <h1 className="t-display-sm mt-6">{heading}</h1>
          <p className="t-body mt-3">{blurb}</p>
          {reason && (
            <Card className="mt-5 w-full text-left">
              <p className="t-overline">REASON</p>
              <p className="t-body-sm mt-1.5">{reason}</p>
            </Card>
          )}
          {/* No refresh button: the status is a live subscription and updates
              itself. A button that seems to do nothing reads as broken. */}
          <p className="t-caption-sm mt-6">This screen updates on its own once your account changes.</p>
          <div className="mt-6 w-full">
            <BlorbButton label="Sign out" kind="outline" busy={leaving} onClick={() => void leave()} />
          </div>
        </div>
      </div>
    </Page>
  )
}
