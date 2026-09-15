import { Lock, ShieldTick, Warning2 } from 'iconsax-react'
import { useEffect, useRef, useState } from 'react'
import { useLayer, useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { Collapse } from '../../components/Collapse'
import { showSheet } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { isSuccess, walletApi, type ApiResult } from './api'
import { BRAND, GREY, MRED, NumPad, PinBoxes, rw, SuccessSheet, WalletAppBar } from './ui'

type Mode = 'setup' | 'change' | 'reset'
type Step = 'code' | 'current' | 'new' | 'confirm'
/** The way out of the error on screen, when there is one to offer. */
type Remedy = 'change' | 'reset' | 'resend' | null

const STEPS: Record<Mode, Step[]> = {
  setup: ['new', 'confirm'],
  change: ['current', 'new', 'confirm'],
  reset: ['code', 'new', 'confirm'],
}

const TITLES: Record<Mode, Partial<Record<Step, string>>> = {
  setup: { new: 'Create Wallet PIN', confirm: 'Confirm Your PIN' },
  change: { current: 'Enter Current PIN', new: 'Enter New PIN', confirm: 'Confirm New PIN' },
  reset: { code: 'Enter Reset Code', new: 'Choose a New PIN', confirm: 'Confirm New PIN' },
}

const DONE: Record<Mode, [string, string]> = {
  setup: ['Wallet PIN Created', 'Your PIN has been set successfully. Use it to authorise withdrawals.'],
  change: ['PIN Updated', 'Your wallet PIN has been changed successfully.'],
  reset: ['PIN Reset', 'Your new PIN is set, and any lock on your wallet has been lifted.'],
}

const alreadySet = (res: ApiResult) =>
  res.code === 'PIN_ALREADY_SET' || res.statusCode === 409 || /already/i.test(res.error ?? '')
const locked = (res: ApiResult) => res.code === 'PIN_LOCKED' || res.statusCode === 423

/**
 * The wallet PIN: set up (new → confirm), change (current → new → confirm),
 * or reset by email (code → new → confirm). The PIN only ever lives in this
 * component's state, is sent once, and is cleared on every failure.
 *
 * QA-BM-WEB-003 (issue 2) found vendors unable to set a PIN. The server saved
 * it; the screen was the problem. A failed save left it on an empty "Confirm"
 * step that rejected every entry as a mismatch; a wallet that already had a
 * PIN — carried over from the old app, or set and forgotten — got "PIN
 * already set" and nowhere to go; and a forgotten or locked PIN had no way
 * back at all, though the backend has always offered an emailed reset. Each
 * of those now ends on a step the vendor can act on.
 *
 * `?change=1` opens the change flow and `?reset=1` the emailed reset.
 */
export default function PinPage() {
  const nav = useNav()
  const search = new URLSearchParams(useLayer().location.search)
  const initialMode: Mode = search.get('reset') === '1' ? 'reset' : search.get('change') === '1' ? 'change' : 'setup'

  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>(STEPS[initialMode][0])
  const [pin, setPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [code, setCode] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remedy, setRemedy] = useState<Remedy>(null)
  const [emailMasked, setEmailMasked] = useState<string | null>(null)

  const steps = STEPS[mode]
  const length = step === 'code' ? 6 : 4

  const clearEntries = () => {
    setPin('')
    setCurrentPin('')
    setCode('')
    setFirstPin('')
  }

  const fail = (message: string, next: Step, fix: Remedy = null) => {
    setError(message)
    setRemedy(fix)
    setPin('')
    setStep(next)
  }

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    setRemedy(null)
    const res = await walletApi.requestPinReset()
    setBusy(false)
    if (isSuccess(res)) {
      const masked = res.data?.emailMasked
      setEmailMasked(typeof masked === 'string' ? masked : 'your email')
      return
    }
    setError(res.error ?? 'Could not send a reset code. Please try again.')
    setRemedy('resend')
  }

  const resend = () => {
    setPin('')
    setCode('')
    setStep('code')
    void sendCode()
  }

  // Switched in place rather than by navigating: the stack keeps this page
  // mounted across a replace, so its state would survive a new URL anyway.
  const switchTo = (next: Mode) => {
    clearEntries()
    setError(null)
    setRemedy(null)
    setMode(next)
    setStep(STEPS[next][0])
    if (next === 'reset') void sendCode()
  }

  // Opened straight into the reset (the withdraw screen's "locked" notice).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || initialMode !== 'reset') return
    started.current = true
    void sendCode()
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const succeed = (heading: string, message: string) =>
    void showSheet(
      (close) => (
        <SuccessSheet
          title={heading}
          message={message}
          onDone={() => {
            close()
            nav.pop()
          }}
        />
      ),
      { dismissible: false, handle: false },
    )

  const submit = async (confirmation: string) => {
    if (confirmation !== firstPin) {
      setFirstPin('')
      fail(mode === 'setup' ? 'PINs do not match. Try again.' : 'New PINs do not match. Try again.', 'new')
      return
    }

    setBusy(true)
    const res =
      mode === 'change'
        ? await walletApi.changePin(currentPin, firstPin)
        : mode === 'reset'
          ? await walletApi.resetPin(code, firstPin)
          : await walletApi.setupPin(firstPin)
    setBusy(false)
    clearEntries()

    if (isSuccess(res)) {
      // Back to the first step before the sheet opens, so the page never
      // sits on an empty "Confirm" behind it.
      setError(null)
      setRemedy(null)
      setStep(steps[0])
      succeed(...DONE[mode])
      return
    }

    if (mode === 'setup') {
      if (alreadySet(res)) fail(res.error ?? 'This wallet already has a PIN.', 'new', 'change')
      else fail(res.error ?? 'Failed to set PIN. Please try again.', 'new')
    } else if (mode === 'change') {
      if (locked(res)) fail(res.error ?? 'Your PIN is locked. Reset it by email.', 'current', 'reset')
      else if (res.statusCode === 401) fail(res.error ?? 'Incorrect current PIN. Please try again.', 'current', 'reset')
      else fail(res.error ?? 'Failed to change PIN.', 'current')
    } else {
      // A wrong or expired code: enter it again, or ask for a fresh one.
      fail(res.error ?? 'Failed to reset PIN.', 'code', 'resend')
    }
  }

  const press = (key: string) => {
    if (busy) return
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length >= length) return
    const next = pin + key
    setPin(next)
    setError(null)
    setRemedy(null)
    if (next.length < length) return

    if (step === 'code') {
      setCode(next)
      setPin('')
      setStep('new')
    } else if (step === 'current') {
      setCurrentPin(next)
      setPin('')
      setStep('new')
    } else if (step === 'new') {
      setFirstPin(next)
      setPin('')
      setStep('confirm')
    } else {
      void submit(next)
    }
  }

  const title = TITLES[mode][step] ?? 'Wallet PIN'
  const subtitle =
    step === 'code'
      ? emailMasked
        ? `We sent a 6-digit code to ${emailMasked}. It expires in 10 minutes.`
        : busy
          ? 'Sending a 6-digit code to your email…'
          : 'We could not send the code yet.'
      : step === 'current'
        ? 'Enter your existing 4-digit wallet PIN'
        : step === 'new'
          ? mode === 'setup'
            ? 'Choose a 4-digit PIN to secure your withdrawals'
            : 'Choose a new 4-digit PIN'
          : mode === 'setup'
            ? 'Enter the same PIN again to confirm'
            : 'Enter the new PIN again to confirm'

  const remedies: Record<Exclude<Remedy, null>, Array<[string, () => void]>> = {
    change: [
      ['Change PIN', () => switchTo('change')],
      ['Forgot PIN?', () => switchTo('reset')],
    ],
    reset: [['Reset PIN by email', () => switchTo('reset')]],
    resend: [['Send a new code', resend]],
  }

  const hint =
    mode === 'change' && step === 'current' ? (
      <TextLink onClick={() => switchTo('reset')}>Forgot your PIN?</TextLink>
    ) : mode === 'reset' && step === 'code' && emailMasked && !busy ? (
      <TextLink onClick={resend}>Resend code</TextLink>
    ) : null

  const index = steps.indexOf(step)

  return (
    <Page background="#fff">
      <WalletAppBar title="Wallet PIN" />
      <div className="scroll-y flex-1">
        <div className="flex flex-col items-center px-6">
          <div className="mt-3 flex justify-center" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s}
                className="mx-1 h-2 rounded-[4px] transition-[width,background-color] duration-[250ms]"
                style={{ width: i === index ? 24 : 8, background: i <= index ? BRAND : GREY[300] }}
              />
            ))}
          </div>
          <div className="mt-8 grid h-[72px] w-[72px] place-items-center rounded-full" style={{ background: 'rgb(81 86 241 / 0.08)' }}>
            {mode === 'reset' ? <ShieldTick size={32} color={BRAND} /> : <Lock size={32} color={BRAND} />}
          </div>
          <h2 className="mt-5 text-center" style={rw(22, 800, '#000')}>
            {title}
          </h2>
          <p className="mt-2 text-center" style={rw(13, 400, GREY[500], { lineHeight: 1.5 })}>
            {subtitle}
          </p>
          <div className="mt-8">
            {length === 6 ? (
              <PinBoxes count={6} length={pin.length} width={44} height={56} gap={4} dot={10} radius={12} />
            ) : (
              <PinBoxes length={pin.length} width={56} height={60} gap={8} dot={12} radius={14} />
            )}
          </div>
          <Collapse open={Boolean(error)}>
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-[10px] px-3.5 py-2.5"
              style={{ background: MRED[50], border: `1px solid ${MRED[200]}` }}
            >
              <Warning2 size={14} color={MRED.base} className="shrink-0" />
              <span style={rw(12, 400, MRED.base, { lineHeight: 1.45 })}>{error}</span>
            </div>
            {remedy && (
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {remedies[remedy].map(([text, action]) => (
                  <TextLink key={text} onClick={action}>
                    {text}
                  </TextLink>
                ))}
              </div>
            )}
          </Collapse>
          <div className="mt-2 flex min-h-8 items-center justify-center">{!error && hint}</div>
          <div className="mt-2 w-full">
            {busy ? (
              <div className="flex justify-center py-6">
                <Spinner color={BRAND} />
              </div>
            ) : (
              <NumPad onKey={press} />
            )}
          </div>
        </div>
      </div>
    </Page>
  )
}

function TextLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ink rounded-full px-3 py-1.5" style={rw(13, 700, BRAND)}>
      {children}
    </button>
  )
}
