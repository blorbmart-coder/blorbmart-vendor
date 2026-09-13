import { Lock, Warning2 } from 'iconsax-react'
import { useState } from 'react'
import { useLayer, useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { Collapse } from '../../components/Collapse'
import { showSheet } from '../../components/overlay'
import { Spinner } from '../../components/Spinner'
import { isSuccess, walletApi } from './api'
import { BRAND, GREY, MRED, NumPad, PinBoxes, rw, SuccessSheet, WalletAppBar } from './ui'

type Step = 'current' | 'new' | 'confirm'

/**
 * The wallet PIN: set up (new → confirm) or change (current → new →
 * confirm). The PIN only ever lives in this component's state, is sent once,
 * and is cleared on every failure.
 */
export default function PinPage() {
  const nav = useNav()
  const change = new URLSearchParams(useLayer().location.search).get('change') === '1'
  const steps: Step[] = change ? ['current', 'new', 'confirm'] : ['new', 'confirm']

  const [step, setStep] = useState<Step>(steps[0])
  const [pin, setPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const title = change
    ? { current: 'Enter Current PIN', new: 'Enter New PIN', confirm: 'Confirm New PIN' }[step]
    : step === 'new'
      ? 'Create Wallet PIN'
      : 'Confirm Your PIN'
  const subtitle = change
    ? {
        current: 'Enter your existing 4-digit wallet PIN',
        new: 'Choose a new 4-digit PIN',
        confirm: 'Enter the new PIN again to confirm',
      }[step]
    : step === 'new'
      ? 'Choose a 4-digit PIN to secure your withdrawals'
      : 'Enter the same PIN again to confirm'

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
      setError(change ? 'New PINs do not match. Try again.' : 'PINs do not match. Try again.')
      setPin('')
      setFirstPin('')
      setStep('new')
      return
    }
    setSubmitting(true)
    const res = change ? await walletApi.changePin(currentPin, firstPin) : await walletApi.setupPin(firstPin)
    setSubmitting(false)
    setPin('')
    setFirstPin('')
    setCurrentPin('')
    if (isSuccess(res)) {
      succeed(
        change ? 'PIN Updated' : 'Wallet PIN Created',
        change
          ? 'Your wallet PIN has been changed successfully.'
          : 'Your PIN has been set successfully. Use it to authorise withdrawals.',
      )
      return
    }
    if (change) {
      // A wrong current PIN sends the vendor back to the start.
      setError(res.statusCode === 401 ? 'Incorrect current PIN. Please try again.' : (res.error ?? 'Failed to change PIN.'))
      setStep('current')
    } else {
      setError(res.error ?? 'Failed to set PIN. Please try again.')
    }
  }

  const press = (key: string) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    setError(null)
    if (next.length < 4) return

    if (step === 'current') {
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
            <Lock size={32} color={BRAND} />
          </div>
          <h2 className="mt-5 text-center" style={rw(22, 800, '#000')}>
            {title}
          </h2>
          <p className="mt-2 text-center" style={rw(13, 400, GREY[500], { lineHeight: 1.5 })}>
            {subtitle}
          </p>
          <div className="mt-8">
            <PinBoxes length={pin.length} width={56} height={60} gap={8} dot={12} radius={14} />
          </div>
          <Collapse open={Boolean(error)}>
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-[10px] px-3.5 py-2.5"
              style={{ background: MRED[50], border: `1px solid ${MRED[200]}` }}
            >
              <Warning2 size={14} color={MRED.base} />
              <span style={rw(12, 400, MRED.base)}>{error}</span>
            </div>
          </Collapse>
          {!error && <div className="h-4" />}
          <div className="mt-4 w-full">
            {submitting ? (
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
