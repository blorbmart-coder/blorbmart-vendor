/**
 * HapticFeedback, on the web.
 *
 * Only Android browsers can vibrate, and only after the page has had a user
 * gesture — anything else is a silent no-op, which is the right failure for
 * something that was only ever a flourish.
 */
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

function buzz(pattern: number | number[]) {
  if (!canVibrate) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Blocked before the first gesture. Nothing to do.
  }
}

export const haptic = {
  selection: () => buzz(5),
  light: () => buzz(10),
  medium: () => buzz(16),
  heavy: () => buzz(26),
  vibrate: () => buzz([40, 50, 40]),
}
