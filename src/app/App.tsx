import { useEffect } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { OverlayHost } from '../components/overlay'
import { useUser } from '../lib/authState'
import { initPush } from '../lib/push'
import { isPublicPath, parentOf, prefetch, routes, stackKeyOf } from './routes'
import { StackNavigator, useNav } from './stack'

/**
 * Watches the session while the app is open: a sign-out in another tab, or
 * an account disabled by an admin, returns this tab to sign-in rather than
 * leaving it on screens whose every request now fails. Registers this
 * browser for order pushes whenever a vendor is signed in.
 */
function SessionWatch() {
  const user = useUser()
  const nav = useNav()
  const { pathname } = useLocation()
  const uid = user?.uid

  useEffect(() => {
    if (!uid && !isPublicPath(pathname)) nav.reset('/login', { fade: true })
    // The path is read at the moment the session changes, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, nav])

  useEffect(() => {
    if (uid) void initPush(() => nav.tab('/orders'))
    prefetch(Boolean(uid))
  }, [uid, nav])

  return null
}

export function App() {
  return (
    <BrowserRouter>
      <div className="app-frame">
        <StackNavigator routes={routes} stackKeyOf={stackKeyOf} parentOf={parentOf}>
          <SessionWatch />
          <OverlayHost />
        </StackNavigator>
      </div>
    </BrowserRouter>
  )
}
