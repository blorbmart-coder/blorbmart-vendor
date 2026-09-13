import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './app/App'
import { isPublicPath, preload } from './app/routes'
import { authReady } from './lib/authState'
import { auth } from './lib/firebase'

// iOS only applies :active — the press-scale on every tap — to a page that
// listens for touches.
document.addEventListener('touchstart', () => undefined, { passive: true })

/**
 * The splash's job, done before the first React render so the first screen
 * React paints is already the right one: restore the session, read the store
 * and the approval state, pick the destination, and download its code while
 * the splash is still up. Then the splash fades out over it.
 */
async function boot() {
  await authReady()

  let destination: string = '/login'
  if (auth.currentUser) {
    const { decideRoute } = await import('./app/session')
    destination = await decideRoute()
  }

  const here = window.location.pathname
  const keep =
    destination === '/'
      ? !isPublicPath(here) && here !== '/onboarding' && here !== '/pending'
      : destination === '/login' && isPublicPath(here)
  const target = keep ? `${here}${window.location.search}` : destination
  if (!keep) window.history.replaceState(null, '', destination)

  // The splash holds for the length of its own entrance — never cut off
  // mid-spring — but no longer: the work above has been running under it.
  await Promise.all([
    preload(target.split('?')[0]),
    new Promise((r) => setTimeout(r, Math.max(0, 800 - performance.now()))),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  const splash = document.getElementById('boot')
  requestAnimationFrame(() => {
    splash?.classList.add('out')
    window.setTimeout(() => splash?.remove(), 450)
  })
}

void boot()

registerSW({ immediate: true })
