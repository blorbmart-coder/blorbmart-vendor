import { useState } from 'react'
import { useNav } from '../../app/stack'
import logo from '../../assets/logo-mark.png'
import { Page } from '../../components/AppBar'
import { BlorbButton, TextButton } from '../../components/Button'
import { useValidation, Validate, VendorField } from '../../components/Field'
import { FadeSlideIn } from '../../components/motion'
import { toast } from '../../components/overlay'
import { authCode, login, sendPasswordReset } from '../../services/vendorAuth'
import { ErrorNote } from './ErrorNote'

/**
 * Deliberately does not tell a wrong password from a missing account — that
 * difference tells anyone which vendor emails are real.
 */
function readable(code: string | null): string {
  switch (code) {
    case 'invalid-email':
      return 'That email address does not look right.'
    case 'user-disabled':
      return 'This account has been disabled. Contact Blorbmart support.'
    case 'too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'network-request-failed':
      return 'No connection. Check your internet and try again.'
    case null:
      return 'Could not sign you in. Please try again.'
    default:
      return 'That email or password is not right.'
  }
}

/** Vendor sign-in. Lands wherever the splash would have. */
export default function LoginScreen() {
  const nav = useNav()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useValidation<'email' | 'password'>()

  const submit = async () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (!form.validate({ email: Validate.email(email), password: password ? null : 'Enter your password' })) return

    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      const { decideRoute } = await import('../../app/session')
      nav.reset(await decideRoute())
    } catch (e) {
      setError(readable(authCode(e)))
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    const address = email.trim()
    if (Validate.email(address)) {
      setError('Enter your email address first.')
      return
    }
    try {
      await sendPasswordReset(address)
    } catch {
      // Always reports success — see the note on sign-in errors.
    }
    toast('If that email has an account, a reset link is on its way.', { tone: 'success' })
  }

  return (
    <Page background="var(--color-surface)">
      <div className="scroll-y pt-safe flex-1">
        <div className="px-5 pb-8 pt-6">
          <FadeSlideIn className="flex items-center gap-2.5">
            <img src={logo} alt="" width={38} height={38} />
            <div>
              <p className="t-h3">Blorbmart</p>
              <p className="t-caption-sm">for vendors</p>
            </div>
          </FadeSlideIn>
          <FadeSlideIn delay={60} className="mt-10">
            <h1 className="t-display-sm">Welcome back</h1>
          </FadeSlideIn>
          <FadeSlideIn delay={100} className="mt-2">
            <p className="t-body-lg">Sign in to your store and start taking orders.</p>
          </FadeSlideIn>

          <form
            className="mt-8"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <FadeSlideIn delay={140}>
              <VendorField
                value={email}
                onChange={setEmail}
                label="Email address"
                hint="you@example.com"
                icon="round/mail_outline"
                inputMode="email"
                autoComplete="email"
                error={form.errors.email}
              />
            </FadeSlideIn>
            <FadeSlideIn delay={180} className="mt-5">
              <VendorField
                value={password}
                onChange={setPassword}
                label="Password"
                hint="Your password"
                icon="outlined/lock"
                obscure
                action="done"
                autoComplete="current-password"
                onSubmit={() => void submit()}
                error={form.errors.password}
              />
            </FadeSlideIn>
          </form>

          <div className="mt-3 flex justify-end">
            <TextButton onClick={busy ? null : () => void resetPassword()}>Forgot password?</TextButton>
          </div>
          <ErrorNote message={error} />
          <div className="mt-5">
            <BlorbButton label="Sign in" busy={busy} glow onClick={busy ? null : () => void submit()} />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center">
            <span className="t-body">New to Blorbmart?</span>
            <TextButton onClick={busy ? null : () => nav.replace('/signup')}>Register your business</TextButton>
          </div>
        </div>
      </div>
    </Page>
  )
}
