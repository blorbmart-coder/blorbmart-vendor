/**
 * The Blorbmart alert, on the web — the same sound the Android apps play for
 * a new order or a new job (public/sounds/blorbmart-alert.wav).
 *
 * Browsers refuse to start sound before the page has had a tap or a key
 * press. `primeAlertSound` plays the file silently on the first one, which
 * unlocks it, so a later order can ring with nobody touching the screen.
 * An alert that repeats stops on the next tap anywhere, or after `repeatFor`.
 *
 * Only the open tab can ring. A closed tab gets the browser's own
 * notification sound, which no web page can change.
 */
const SRC = '/sounds/blorbmart-alert.wav'

let audio: HTMLAudioElement | null = null
let unlocked = false
let stopTimer: number | null = null

function element(): HTMLAudioElement | null {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio(SRC)
    audio.preload = 'auto'
    audio.volume = 1
  }
  return audio
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

export function primeAlertSound() {
  if (typeof window === 'undefined' || unlocked) return
  const prime = () => {
    const a = element()
    if (!a || unlocked) return
    a.muted = true
    a.play()
      .then(() => {
        a.pause()
        a.currentTime = 0
        a.muted = false
        unlocked = true
        for (const g of GESTURES) window.removeEventListener(g, prime, true)
      })
      .catch(() => {
        a.muted = false
      })
  }
  for (const g of GESTURES) window.addEventListener(g, prime, { capture: true, passive: true })
}

export function stopAlert() {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer)
    stopTimer = null
  }
  window.removeEventListener('pointerdown', stopAlert, true)
  if (audio) {
    audio.loop = false
    audio.pause()
    audio.currentTime = 0
  }
}

/** Rings the alert. With `repeatFor`, it loops until a tap or that many ms. */
export function playAlert({ repeatFor = 0 }: { repeatFor?: number } = {}) {
  const a = element()
  if (!a) return
  stopAlert()
  a.loop = repeatFor > 0
  a.currentTime = 0
  void a.play().catch(() => undefined)
  try {
    navigator.vibrate?.([700, 250, 700, 250, 700])
  } catch {
    // Blocked before the first gesture.
  }
  if (repeatFor > 0) {
    stopTimer = window.setTimeout(stopAlert, repeatFor)
    // Deferred, so the tap that caused the alert (if any) does not stop it.
    window.setTimeout(() => window.addEventListener('pointerdown', stopAlert, { capture: true, once: true }), 400)
  }
}
