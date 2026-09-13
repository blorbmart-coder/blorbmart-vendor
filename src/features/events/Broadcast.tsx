import { useState } from 'react'
import { BlorbButton } from '../../components/Button'
import { useValidation, VendorField } from '../../components/Field'
import { Icon, type IconName } from '../../components/Icon'
import { showSheet, type SetDismissible } from '../../components/overlay'
import { Switch } from '../../components/Switch'
import type { BroadcastResult, VendorEvent } from '../../data/eventModels'
import { haptic } from '../../lib/haptics'
import { TimeoutError } from '../../lib/http'
import { broadcast, EventsError } from '../../services/events'

/** Opens "message everyone" for one event. Resolves with what went out. */
export function showBroadcastSheet(event: VendorEvent) {
  return showSheet<BroadcastResult>(
    (close, setDismissible) => <BroadcastSheet event={event} onSent={close} setDismissible={setDismissible} />,
    { background: 'var(--color-canvas)' },
  )
}

/**
 * Message everyone with a ticket. Both channels on by default: an organizer
 * moving a venue at the last minute needs it to reach people wherever they
 * are looking, without typing it twice. The backend refuses a second send
 * within minutes, so a nervous double tap never lands twice.
 */
function BroadcastSheet({
  event,
  onSent,
  setDismissible,
}: {
  event: VendorEvent
  onSent: (result?: BroadcastResult) => void
  setDismissible: SetDismissible
}) {
  const [headline, setHeadline] = useState('')
  const [message, setMessage] = useState('')
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useValidation<'message'>()

  const fail = (text: string) => {
    setSending(false)
    setDismissible(true)
    setError(text)
  }

  const send = async () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (!form.validate({ message: message.trim().length < 2 ? 'Write the message you want to send' : null })) return
    if (!push && !email) {
      setError('Switch on push, email, or both.')
      return
    }
    // A send in flight keeps the sheet up, so the organizer sees whether it went.
    setSending(true)
    setDismissible(false)
    setError(null)
    try {
      const result = await broadcast(event.id, { title: headline, message, push, email })
      haptic.heavy()
      onSent(result)
    } catch (e) {
      if (e instanceof EventsError) fail(e.message)
      // The backend sends before it answers, so a slow reply is not a failed
      // one. "Try again" here is how a list gets the message twice.
      else if (e instanceof TimeoutError)
        fail('This is taking a while and may still be going out. Give it a few minutes before you send again.')
      else fail('Could not send. Check your connection and try again.')
    }
  }

  return (
    <div className="scroll-y pb-safe min-h-0 flex-1">
      <form className="px-5 pb-5 pt-1" noValidate onSubmit={(e) => e.preventDefault()}>
        <h2 className="t-h2 mt-4">Message everyone</h2>
        <p className="t-body mt-1">Goes to every person holding a ticket to {event.title}, once each.</p>
        <div className="mt-5">
          <VendorField
            value={headline}
            onChange={setHeadline}
            label="Headline"
            hint="Optional — Venue changed, Doors open at 7"
            maxLength={80}
            capitalize="sentences"
          />
        </div>
        <div className="mt-3">
          <VendorField
            value={message}
            onChange={setMessage}
            label="Message"
            hint="What do they need to know?"
            maxLines={6}
            maxLength={1000}
            action="newline"
            capitalize="sentences"
            error={form.errors.message}
          />
        </div>
        <div className="mt-5 space-y-2">
          <Channel
            icon="round/notifications_active"
            title="Push notification"
            subtitle="On their phone, and kept in their Blorbmart notifications."
            value={push}
            onChange={sending ? null : setPush}
          />
          <Channel
            icon="round/mail"
            title="Email"
            subtitle="To the address they got their ticket with."
            value={email}
            onChange={sending ? null : setEmail}
          />
        </div>
        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-[14px] p-3" style={{ background: 'rgb(229 72 77 / 0.08)' }}>
            <Icon name="round/error_outline" size={18} color="var(--color-danger)" />
            <p className="t-caption-sm flex-1 text-danger">{error}</p>
          </div>
        )}
        <div className="mt-6">
          <BlorbButton label="Send now" icon="round/send" glow busy={sending} onClick={sending ? null : () => void send()} />
        </div>
      </form>
    </div>
  )
}

function Channel({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: IconName
  title: string
  subtitle: string
  value: boolean
  onChange: ((v: boolean) => void) | null
}) {
  return (
    <div
      className="flex items-center rounded-[14px] bg-surface px-4 py-2"
      style={{ border: `1px solid ${value ? 'var(--color-brand)' : 'var(--color-line)'}` }}
    >
      <Icon name={icon} size={20} color={value ? 'var(--color-brand)' : 'var(--color-ink-faint)'} />
      <div className="ml-3 min-w-0 flex-1">
        <p className="t-h4">{title}</p>
        <p className="t-caption-sm mt-0.5">{subtitle}</p>
      </div>
      <Switch checked={value} onChange={onChange} label={title} />
    </div>
  )
}
