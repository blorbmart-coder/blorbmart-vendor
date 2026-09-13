import { useCallback, useEffect, useRef, useState } from 'react'
import { AppBar, Page } from '../../components/AppBar'
import { BlorbButton, IconBtn } from '../../components/Button'
import { Icon, type IconName } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { checkInIsDuplicate, type CheckInResult } from '../../data/eventModels'
import { haptic } from '../../lib/haptics'
import { checkIn, EventsError } from '../../services/events'

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type Decode = (frame: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>

/**
 * The fastest decoder this browser has: the built-in BarcodeDetector where it
 * exists (Chrome on Android), otherwise jsQR, loaded only now — nobody who
 * never opens the scanner downloads it.
 */
async function makeDecoder(): Promise<Decode> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  if (Native) {
    try {
      const detector = new Native({ formats: ['qr_code'] })
      return async (frame) => (await detector.detect(frame))[0]?.rawValue || null
    } catch {
      // Present but unsupported for QR — fall through to jsQR.
    }
  }
  const { default: jsQR } = await import('jsqr')
  return async (frame, canvas) => {
    const width = Math.min(640, frame.videoWidth)
    const height = Math.round((frame.videoHeight / frame.videoWidth) * width)
    if (!width || !height) return null
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(frame, 0, 0, width, height)
    const image = ctx.getImageData(0, 0, width, height)
    return jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data || null
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   The door. There is a queue behind the person being scanned, it is dark,
   and whoever holds this phone is doing it for the four-hundredth time:

     * The answer is a full-width colour band, readable at arm's length.
     * The camera keeps running — no modal to dismiss between people.
     * The same code cannot re-fire while its result is on screen.
     * A running count, because "how many are in" is asked all night.
   ───────────────────────────────────────────────────────────────────────── */
export default function ScannerScreen() {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const busyRef = useRef(false)
  const lastCode = useRef<string | null>(null)
  const clearTimer = useRef(0)

  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [torch, setTorch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [admitted, setAdmitted] = useState(0)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const onCode = useCallback(async (code: string) => {
    // One ticket held steady is detected every frame; it goes once.
    if (busyRef.current || code === lastCode.current) return
    busyRef.current = true
    lastCode.current = code
    setBusy(true)

    let answer: CheckInResult
    try {
      answer = await checkIn(code)
      if (answer.ok) haptic.heavy()
      else if (checkInIsDuplicate(answer)) haptic.medium()
      else haptic.vibrate()
    } catch (e) {
      haptic.vibrate()
      answer = {
        ok: false,
        reason: 'network',
        message: e instanceof EventsError ? e.message : 'No connection. Try that one again.',
        holderName: '',
        ticketTypeName: '',
        usedAt: null,
      }
    }
    setResult(answer)
    if (answer.ok) setAdmitted((n) => n + 1)
    busyRef.current = false
    setBusy(false)

    // Clears itself so the next person is scanned without a tap.
    window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => {
      setResult(null)
      lastCode.current = null
    }, 3000)
  }, [])

  useEffect(() => {
    let cancelled = false
    let frame = 0
    let last = 0

    const start = async () => {
      setCameraError(null)
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = media
        const el = video.current!
        el.srcObject = media
        await el.play().catch(() => undefined)
        const decode = await makeDecoder()

        // About eight looks a second: plenty for a person holding up a
        // phone, and a fraction of the battery of decoding every frame.
        const tick = async (now: number) => {
          if (cancelled) return
          if (now - last > 120 && !busyRef.current && el.readyState >= 2) {
            last = now
            const code = await decode(el, canvas.current!).catch(() => null)
            if (code && !cancelled) void onCode(code)
          }
          frame = requestAnimationFrame((t) => void tick(t))
        }
        frame = requestAnimationFrame((t) => void tick(t))
      } catch (error) {
        const name = (error as { name?: string })?.name
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access is needed to scan tickets. Allow it in your browser settings.'
            : 'No camera is available on this device.',
        )
      }
    }
    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [facing, attempt, onCode])

  useEffect(() => () => window.clearTimeout(clearTimer.current), [])

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0]
    const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
    if (!track || !caps.torch) {
      setTorch(false)
      return
    }
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorch(next)
    } catch {
      // No torch on this camera.
    }
  }

  return (
    <Page background="#000">
      <AppBar
        title="Scan tickets"
        background="#000"
        color="#fff"
        actions={
          <>
            <IconBtn
              icon={torch ? 'round/flashlight_on' : 'round/flashlight_off'}
              tooltip={torch ? 'Torch off' : 'Torch on'}
              color="#fff"
              onClick={() => void toggleTorch()}
            />
            <IconBtn
              icon="round/cameraswitch"
              tooltip="Switch camera"
              color="#fff"
              onClick={() => {
                setTorch(false)
                setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
              }}
            />
            <span className="w-2" />
          </>
        }
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvas} className="hidden" />

        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <Icon name="round/no_photography" size={40} color="rgb(255 255 255 / 0.7)" />
            <p className="t-body mt-4 text-white">{cameraError}</p>
            <div className="mt-6">
              <BlorbButton label="Try again" size="md" expand={false} onClick={() => setAttempt((n) => n + 1)} />
            </div>
          </div>
        ) : (
          // Only so whoever holds the phone knows where to put the ticket.
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-[18px]"
            style={{ border: '2px solid rgb(255 255 255 / 0.54)' }}
          />
        )}

        <div className="absolute inset-x-5 top-4 flex justify-center">
          <span className="t-label rounded-full px-4 py-2 text-white" style={{ background: 'rgb(0 0 0 / 0.54)' }}>
            {admitted} checked in
          </span>
        </div>

        {busy && (
          <div className="absolute inset-x-0 bottom-40 flex justify-center">
            <Spinner size={30} color="#fff" />
          </div>
        )}

        {result && <ResultBanner result={result} />}
      </div>
    </Page>
  )
}

function ResultBanner({ result }: { result: CheckInResult }) {
  const [colour, icon, headline]: [string, IconName, string] = result.ok
    ? ['var(--color-success)', 'round/check_circle', 'Let them in']
    : checkInIsDuplicate(result)
      ? ['var(--color-warning)', 'round/replay', 'Already checked in']
      : ['var(--color-danger)', 'round/cancel', 'Do not admit']
  const details = [result.holderName, result.ticketTypeName].filter(Boolean).join('  ·  ')

  return (
    <div
      role="status"
      aria-live="assertive"
      className="swap-in absolute inset-x-0 bottom-0 flex items-center px-5 pt-5"
      style={{ background: colour, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
    >
      <Icon name={icon} size={40} color="#fff" />
      <div className="ml-4 min-w-0 flex-1">
        <p className="t-h1 text-white" style={{ fontSize: 22 }}>
          {headline}
        </p>
        {details && <p className="t-body mt-1 text-white">{details}</p>}
        <p className="t-caption-sm mt-0.5" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
          {result.message}
        </p>
      </div>
    </div>
  )
}
