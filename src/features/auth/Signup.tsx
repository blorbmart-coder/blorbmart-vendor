import { useEffect, useState } from 'react'
import { useNav } from '../../app/stack'
import { AppBar, Page } from '../../components/AppBar'
import { BlorbButton, IconBtn, TextButton } from '../../components/Button'
import { CampusField, useValidation, Validate, VendorField } from '../../components/Field'
import { Icon, type IconName } from '../../components/Icon'
import { FadeSlideIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { storeRepo } from '../../data/storeRepo'
import { haptic } from '../../lib/haptics'
import { errorText } from '../../lib/http'
import { cachedCampus, campuses, type University } from '../../services/universities'
import { authCode, registerVendor, sendOtp } from '../../services/vendorAuth'
import { ErrorNote } from './ErrorNote'

function readable(code: string | null, fallback: string): string {
  switch (code) {
    case 'email-already-in-use':
      return 'That email already has an account. Sign in instead.'
    case 'invalid-email':
      return 'That email address does not look right.'
    case 'weak-password':
      return 'Choose a stronger password.'
    case 'network-request-failed':
      return 'No connection. Check your internet and try again.'
    case null:
      return fallback
    default:
      return 'Could not create your account. Please try again.'
  }
}

type FieldKey = 'firstName' | 'lastName' | 'business' | 'campus' | 'email' | 'phone' | 'password'

/**
 * Vendor registration. Deliberately short: a person, a business name and a
 * way to reach them. Everything about the store itself is asked in
 * onboarding, where it saves step by step.
 */
export default function SignupScreen() {
  const nav = useNav()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [campusId, setCampusId] = useState<string | null>(null)
  const [options, setOptions] = useState<University[]>([])
  const [campusesLoading, setCampusesLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useValidation<FieldKey>()

  useEffect(() => {
    let live = true
    campuses()
      .then((list) => live && setOptions(list))
      .catch(() => undefined)
      .finally(() => live && setCampusesLoading(false))
    return () => {
      live = false
    }
  }, [])

  const sendCode = async () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const valid = form.validate({
      firstName: Validate.required(firstName, 'first name'),
      lastName: Validate.required(lastName, 'last name'),
      business: Validate.required(business, 'business name'),
      campus: campusId ? null : 'Choose the campus you sell on',
      email: Validate.email(email),
      phone: Validate.phone(phone),
      password: Validate.password(password),
    })
    if (!valid) return

    setBusy(true)
    setError(null)
    try {
      await sendOtp(email.trim().toLowerCase())
      setOtpSent(true)
      toast(`Code sent to ${email.trim()}`, { tone: 'success' })
    } catch (e) {
      setError(errorText(e, 'Failed to send code.'))
    } finally {
      setBusy(false)
    }
  }

  const register = async () => {
    if (otp.trim().length < 4) {
      setError('Enter the code from your email.')
      return
    }
    setBusy(true)
    setError(null)
    const campus = cachedCampus(campusId)
    try {
      await registerVendor({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        businessName: business.trim(),
        businessEmail: email.trim().toLowerCase(),
        businessPhone: phone.trim(),
        universityId: campus?.id ?? '',
        universityName: campus?.name ?? '',
        otpCode: otp.trim(),
      })
      // Registration wrote the store; adopt it, then walk straight into
      // onboarding rather than onto an empty dashboard.
      await storeRepo.start()
      await storeRepo.ensureStore(business.trim())
      haptic.heavy()
      nav.reset('/onboarding')
    } catch (e) {
      setBusy(false)
      setError(readable(authCode(e), errorText(e, 'Could not create your account. Please try again.')))
    }
  }

  return (
    <Page background="var(--color-surface)">
      <AppBar leading={<IconBtn icon="round/arrow_back" tooltip="Back" onClick={() => nav.pop()} />} />
      <div className="scroll-y flex-1">
        <div className="px-5 pb-8 pt-2">
          <FadeSlideIn>
            <h1 className="t-display-sm">Sell on Blorbmart</h1>
          </FadeSlideIn>
          <FadeSlideIn delay={60} className="mt-2">
            <p className="t-body-lg">
              Restaurants, pharmacies and event vendors. Set up in a few minutes, no listing fee.
            </p>
          </FadeSlideIn>
          <FadeSlideIn delay={100} className="mt-6">
            <SellingPoints />
          </FadeSlideIn>

          <form className="mt-8 space-y-5" noValidate onSubmit={(e) => e.preventDefault()}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <VendorField
                  value={firstName}
                  onChange={setFirstName}
                  label="First name"
                  hint="Ada"
                  disabled={otpSent}
                  capitalize="words"
                  autoComplete="given-name"
                  error={form.errors.firstName}
                />
              </div>
              <div className="min-w-0 flex-1">
                <VendorField
                  value={lastName}
                  onChange={setLastName}
                  label="Last name"
                  hint="Okoro"
                  disabled={otpSent}
                  capitalize="words"
                  autoComplete="family-name"
                  error={form.errors.lastName}
                />
              </div>
            </div>
            <VendorField
              value={business}
              onChange={setBusiness}
              label="Business name"
              hint="Mama Nkechi Kitchen"
              icon="outlined/storefront"
              disabled={otpSent}
              capitalize="words"
              autoComplete="organization"
              error={form.errors.business}
            />
            <CampusField
              options={options}
              value={campusId}
              loading={campusesLoading}
              disabled={otpSent}
              onChange={setCampusId}
              error={form.errors.campus}
            />
            <VendorField
              value={email}
              onChange={setEmail}
              label="Email address"
              hint="you@example.com"
              icon="round/mail_outline"
              disabled={otpSent}
              inputMode="email"
              autoComplete="email"
              helper="We send order alerts and payouts here."
              error={form.errors.email}
            />
            <VendorField
              value={phone}
              onChange={setPhone}
              label="Phone number"
              hint="08012345678"
              icon="outlined/phone"
              disabled={otpSent}
              inputMode="tel"
              autoComplete="tel"
              maxLength={11}
              digits
              error={form.errors.phone}
            />
            <VendorField
              value={password}
              onChange={setPassword}
              label="Password"
              hint="At least 8 characters"
              icon="outlined/lock"
              obscure
              disabled={otpSent}
              autoComplete="new-password"
              error={form.errors.password}
            />
          </form>

          {otpSent && (
            <FadeSlideIn className="mt-6">
              <div
                className="rounded-[14px] bg-brand-softer p-4"
                style={{ border: '1px solid rgb(31 119 241 / 0.18)' }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon name="round/mark_email_read" size={19} color="var(--color-brand)" />
                  <p className="t-h4 min-w-0 flex-1 truncate text-brand-ink">Check {email.trim()}</p>
                </div>
                <div className="mt-4">
                  <VendorField
                    value={otp}
                    onChange={setOtp}
                    label="Verification code"
                    hint="000000"
                    icon="round/password"
                    inputMode="numeric"
                    maxLength={6}
                    digits
                    autoFocus
                    action="done"
                    autoComplete="one-time-code"
                    onSubmit={() => void register()}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <TextButton onClick={busy ? null : () => void sendCode()}>Send a new code</TextButton>
                  <TextButton
                    color="var(--color-ink-muted)"
                    onClick={
                      busy
                        ? null
                        : () => {
                            setOtpSent(false)
                            setOtp('')
                          }
                    }
                  >
                    Edit details
                  </TextButton>
                </div>
              </div>
            </FadeSlideIn>
          )}

          <ErrorNote message={error} />
          <div className="mt-6">
            <BlorbButton
              label={otpSent ? 'Create my store' : 'Continue'}
              busy={busy}
              glow
              onClick={busy ? null : otpSent ? () => void register() : () => void sendCode()}
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center">
            <span className="t-body">Already selling with us?</span>
            <TextButton onClick={busy ? null : () => nav.replace('/login')}>Sign in</TextButton>
          </div>
        </div>
      </div>
    </Page>
  )
}

const POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'round/delivery_dining',
    title: 'We handle delivery',
    body: 'Our riders collect and deliver. You just cook and pack.',
  },
  {
    icon: 'round/payments',
    title: 'Money into your wallet',
    body: 'Earnings settle after delivery and withdraw to your bank.',
  },
  {
    icon: 'round/shield',
    title: 'Every delivery is verified',
    body: 'Customers confirm with a 4-digit PIN, so disputes are rare.',
  },
]

/** Three reasons to bother, above the form — which is what gets read. */
function SellingPoints() {
  return (
    <div className="space-y-3">
      {POINTS.map((p) => (
        <div key={p.title} className="flex items-start gap-3.5">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-brand-soft">
            <Icon name={p.icon} size={18} color="var(--color-brand)" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-h4">{p.title}</p>
            <p className="t-caption-sm mt-0.5">{p.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
