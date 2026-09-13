import { useEffect, useRef, useState } from 'react'
import { useNav } from '../../app/stack'
import { Page } from '../../components/AppBar'
import { BlorbButton, BlorbIconButton, TextButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { SwapIn } from '../../components/motion'
import { confirmBlorb, toast } from '../../components/overlay'
import { CenterSpinner } from '../../components/Spinner'
import { BUSINESS, type StoreProfile } from '../../data/models'
import { storeRepo } from '../../data/storeRepo'
import { pickImages, prepareImage, uploadImage, UploadError } from '../../lib/cloudinary'
import { dropPin, LocationError } from '../../lib/geo'
import { haptic } from '../../lib/haptics'
import { StepBasics, StepBranding, StepBusinessType, StepFulfilment, StepHours, StepLocation } from './Steps'

const TOTAL = 6

const TITLES = [
  'What do you sell?',
  'Tell us about your business',
  'Where do riders collect?',
  'When are you open?',
  'Orders and delivery',
  'How you look',
]

const SUBTITLES = [
  'This decides where customers find you.',
  'This is what shows on your storefront.',
  'Riders navigate by what you write here.',
  'Customers only see you during these hours.',
  'Set expectations you can actually meet.',
  'A good photo is the difference between a scroll and an order.',
]

/* ─────────────────────────────────────────────────────────────────────────
   Vendor onboarding. Six steps, built so a vendor never loses work and
   never feels interrogated: every step saves as it moves on, nothing is
   asked twice, and only what a storefront cannot work without is required.
   ───────────────────────────────────────────────────────────────────────── */
export default function OnboardingScreen() {
  const [draft, setDraft] = useState<StoreProfile | null>(null)
  const [step, setStep] = useState(0)
  const [alreadyLive, setAlreadyLive] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      // A vendor from an old-style signup may have no store document at all.
      const store = storeRepo.store ?? (await storeRepo.ensureStore(''))
      if (!live) return
      setDraft(store)
      setStep(Math.min(Math.max(store.onboardingStep, 0), TOTAL - 1))
      setAlreadyLive(store.onboardingComplete)
    })().catch(() => toast('Could not load your store. Check your connection.', { tone: 'danger' }))
    return () => {
      live = false
    }
  }, [])

  if (!draft) {
    return (
      <Page background="var(--color-surface)">
        <CenterSpinner />
      </Page>
    )
  }
  return (
    <Flow
      draft={draft}
      setDraft={setDraft}
      step={step}
      setStep={setStep}
      alreadyLive={alreadyLive}
    />
  )
}

function Flow({
  draft,
  setDraft,
  step,
  setStep,
  alreadyLive,
}: {
  draft: StoreProfile
  setDraft: (s: StoreProfile) => void
  step: number
  setStep: (s: number) => void
  alreadyLive: boolean
}) {
  const nav = useNav()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null)
  const [duration, setDuration] = useState(0)
  const latest = useRef(draft)
  latest.current = draft

  const update = (mutate: (s: StoreProfile) => StoreProfile) => setDraft(mutate(latest.current))

  const canAdvance =
    step === 1 ? draft.name.trim().length >= 2 : step === 2 ? Boolean(draft.address.trim() && draft.city.trim()) : true

  const blockedReason =
    step === 1 && draft.name.trim().length < 2
      ? 'Enter your business name.'
      : step === 2 && !draft.address.trim()
        ? 'Add the address riders should come to.'
        : step === 2 && !draft.city.trim()
          ? 'Add your city.'
          : null

  const goTo = (next: number, ms: number) => {
    haptic.selection()
    setDuration(ms)
    setStep(next)
  }

  const confirmLeave = async () => {
    const leave = await confirmBlorb({
      title: 'Finish this later?',
      message:
        'Everything you have filled in is already saved. You can pick up from this exact step whenever you come back.',
      confirmLabel: 'Finish later',
      cancelLabel: 'Keep going',
      icon: 'round/bookmark_border',
    })
    if (leave) nav.reset('/')
  }

  const back = () => (step === 0 ? void confirmLeave() : goTo(step - 1, 280))

  /**
   * Puts the store live and lands on the dashboard, which says so in a toast.
   * A store that was already live is being edited: it goes back, and is not
   * switched open again over a vendor who had closed for the day.
   */
  const finish = async () => {
    if (alreadyLive) {
      haptic.selection()
      toast('Store details saved.', { tone: 'success' })
      nav.pop()
      return
    }
    setSaving(true)
    try {
      await storeRepo.completeOnboarding(latest.current)
      haptic.heavy()
      nav.reset('/', {
        data: {
          welcome: `${latest.current.name} is live. Add your first ${BUSINESS[latest.current.type].itemNoun} to start selling.`,
        },
      })
    } catch {
      setSaving(false)
      toast('Could not finish setup. Try again.', { tone: 'danger' })
    }
  }

  const next = async () => {
    if (!canAdvance) {
      if (blockedReason) toast(blockedReason)
      return
    }
    setSaving(true)
    try {
      // A live store keeps its finished marker; only one still being set up
      // records which step to resume on.
      await storeRepo.saveStep(alreadyLive ? latest.current.onboardingStep : step + 1, latest.current)
    } catch {
      toast('Could not save that. Check your connection.', { tone: 'danger' })
      setSaving(false)
      return
    }
    setSaving(false)
    if (step >= TOTAL - 1) {
      await finish()
      return
    }
    goTo(step + 1, 420)
  }

  /**
   * Uploads straight away rather than at the end, so a vendor sees their own
   * branding immediately — the most motivating moment in the whole flow.
   */
  const pickImage = (isLogo: boolean) => {
    void pickImages().then(async ([file]) => {
      if (!file) return
      setUploading(isLogo ? 'logo' : 'banner')
      try {
        const url = await uploadImage(
          await prepareImage(file, isLogo ? 800 : 1600, 0.82),
          isLogo ? 'stores/logos' : 'stores/banners',
        )
        update((s) => (isLogo ? { ...s, logoUrl: url } : { ...s, bannerUrl: url }))
        // Persisted at once — an upload is expensive to redo.
        void storeRepo.patch(isLogo ? { logoUrl: url } : { bannerUrl: url }).catch(() => undefined)
      } catch (error) {
        toast(error instanceof UploadError ? error.message : 'Could not open your photos.', { tone: 'danger' })
      } finally {
        setUploading(null)
      }
    })
  }

  const pinLocation = async () => {
    try {
      const pin = await dropPin()
      update((s) => ({
        ...s,
        latitude: pin.latitude,
        longitude: pin.longitude,
        address: pin.street || s.address,
        city: pin.city || s.city,
        state: pin.state || s.state,
      }))
      haptic.medium()
      toast('Location pinned. Check the address reads right.', { tone: 'success' })
    } catch (error) {
      toast(error instanceof LocationError ? error.message : 'Could not get your location. Type the address instead.', {
        tone: 'danger',
      })
    }
  }

  const isLast = step === TOTAL - 1
  const optional = step >= 3

  return (
    <Page background="var(--color-surface)">
      <div className="pt-safe shrink-0 pb-4 pl-3 pr-5 pt-2">
        <div className="flex items-center">
          <BlorbIconButton icon="round/arrow_back" background="transparent" tooltip="Back" onClick={back} />
          <span className="flex-1" />
          <span className="t-label-sm text-ink-muted">
            Step {step + 1} of {TOTAL}
          </span>
        </div>
        <div className="mt-3 flex gap-[5px] px-2" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span
              key={i}
              className="h-[5px] flex-1 rounded-full transition-colors duration-[280ms] ease-emph"
              style={{ background: i <= step ? 'var(--color-brand)' : 'var(--color-line)' }}
            />
          ))}
        </div>
        <div className="mt-5 px-2">
          <SwapIn swapKey={TITLES[step]} className="block">
            <h1 className="t-display-sm">{TITLES[step]}</h1>
          </SwapIn>
          <SwapIn swapKey={SUBTITLES[step]} className="mt-1.5 block">
            <p className="t-body">{SUBTITLES[step]}</p>
          </SwapIn>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            translate: `${-step * 100}% 0`,
            transition: duration ? `translate ${duration}ms var(--ease-emph)` : undefined,
          }}
        >
          {[
            <StepBusinessType
              key="type"
              selected={draft.type}
              // Editing, not signing up: the one thing that may not change.
              // Also enforced in the Firestore rules.
              locked={draft.onboardingComplete}
              onSelect={(type) => {
                haptic.selection()
                update((s) => ({ ...s, type }))
              }}
            />,
            <StepBasics key="basics" store={draft} onChange={setDraft} />,
            <StepLocation key="location" store={draft} onChange={setDraft} onUseGps={pinLocation} />,
            <StepHours key="hours" store={draft} onChange={setDraft} />,
            <StepFulfilment key="fulfilment" store={draft} onChange={setDraft} />,
            <StepBranding
              key="branding"
              store={draft}
              uploading={uploading}
              onPickLogo={() => pickImage(true)}
              onPickBanner={() => pickImage(false)}
            />,
          ].map((page, i) => (
            <div
              key={i}
              className="scroll-y h-full w-full shrink-0"
              inert={i !== step}
              aria-hidden={i !== step || undefined}
            >
              {page}
            </div>
          ))}
        </div>
      </div>

      <div
        data-bottom-bar=""
        className="relative z-10 shrink-0 bg-surface px-5 pt-3 shadow-lift"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <BlorbButton
          label={isLast ? (alreadyLive ? 'Save changes' : 'Put my store live') : 'Continue'}
          busy={saving}
          glow={canAdvance}
          onClick={saving ? null : () => void next()}
          trailing={isLast ? undefined : <Icon name="round/arrow_forward" size={18} color="#fff" />}
        />
        {optional && !isLast ? (
          <div className="mt-1 flex justify-center">
            <TextButton color="var(--color-ink-muted)" onClick={saving ? null : () => void next()}>
              Set this up later
            </TextButton>
          </div>
        ) : (
          <div className="h-2" />
        )}
      </div>
    </Page>
  )
}
