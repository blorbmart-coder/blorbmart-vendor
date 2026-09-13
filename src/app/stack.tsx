import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useNavigationType, useRoutes, type Location, type RouteObject } from 'react-router-dom'
import { useOverlayOpen } from '../components/overlay'

/* ─────────────────────────────────────────────────────────────────────────
   A page stack on top of the browser's history — Flutter's Navigator.

   A plain router unmounts the page you leave. The Flutter app does not: the
   dashboard stays alive beneath the product editor, with its scroll
   position, its live listeners and anything half-typed, and it is simply
   uncovered on the way back. So every page here lives in a layer of its own,
   rendered for its own history entry, and a covered layer is kept mounted
   and merely stops painting.

   The browser's back button, the app bar's back arrow and a deep link all
   meet in one place: the history entry. Layers are pushed and popped to
   mirror it.
   ───────────────────────────────────────────────────────────────────────── */

type LayerState = 'enter' | 'fade' | 'idle' | 'exit'

interface Entry {
  id: string
  stackKey: string
  location: Location
  state: LayerState
  /** Replaced or reset away: still on screen under the page arriving over it. */
  doomed?: boolean
}

interface NavState {
  __rid?: string
  data?: unknown
}

export interface Nav {
  /** Navigator.push — resolves with whatever the page pops with. */
  push<T = unknown>(to: string, data?: unknown): Promise<T | undefined>
  /** Navigator.pop, with an optional result for whoever pushed. */
  pop(result?: unknown): void
  /** Navigator.pushReplacement. */
  replace(to: string, data?: unknown): void
  /** Navigator.pushAndRemoveUntil(.., (_) => false). */
  reset(to: string, opts?: { fade?: boolean; data?: unknown }): void
  /** Switches the dashboard's tab without adding a history entry. */
  tab(to: string): void
}

interface LayerInfo {
  location: Location
  active: boolean
  canPop: boolean
  data: unknown
}

const NavContext = createContext<Nav | null>(null)
const LayerContext = createContext<LayerInfo | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav outside StackNavigator')
  return nav
}

/** The page's own layer: whether it is on top, and what it was pushed with. */
export function useLayer<T = unknown>() {
  const layer = useContext(LayerContext)
  if (!layer) throw new Error('useLayer outside a layer')
  return layer as LayerInfo & { data: T | undefined }
}

const EXIT_MS = 320

const makeEntry = (location: Location, stackKey: string, state: LayerState): Entry => ({
  id: location.key,
  stackKey,
  location,
  state,
})

const ridOf = (e: Entry) => (e.location.state as NavState | null)?.__rid

const newRid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`

export function StackNavigator({
  routes,
  stackKeyOf,
  parentOf,
  children,
}: {
  /** Rendered inside the navigator's context, after the layers. */
  children?: ReactNode
  routes: RouteObject[]
  /** Paths that share a key share a layer — the dashboard's tabs. */
  stackKeyOf: (pathname: string) => string
  /** Where "back" goes from a page opened directly, with nothing beneath it. */
  parentOf: (pathname: string) => string | null
}) {
  const location = useLocation()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const overlayOpen = useOverlayOpen()

  const [stack, setStackState] = useState<Entry[]>(() => [
    makeEntry(location, stackKeyOf(location.pathname), 'idle'),
  ])
  const stackRef = useRef(stack)
  const setStack = useCallback((next: Entry[]) => {
    stackRef.current = next
    setStackState(next)
  }, [])

  const seenKey = useRef(location.key)
  const mode = useRef<'reset' | 'reset-fade' | null>(null)
  const waiters = useRef(new Map<string, (value: unknown) => void>())
  const results = useRef(new Map<string, unknown>())

  // Resolves the push() of every page leaving the stack.
  const settle = useCallback((removed: Entry[]) => {
    for (const entry of removed) {
      const rid = ridOf(entry)
      if (!rid) continue
      const waiter = waiters.current.get(rid)
      if (waiter) {
        waiters.current.delete(rid)
        waiter(results.current.get(rid))
      }
      results.current.delete(rid)
    }
  }, [])

  const removeLater = useCallback(
    (ids: string[]) => {
      window.setTimeout(() => setStack(stackRef.current.filter((e) => !ids.includes(e.id))), EXIT_MS)
    },
    [setStack],
  )

  useLayoutEffect(() => {
    if (location.key === seenKey.current) return
    seenKey.current = location.key

    const prev = stackRef.current
    const leaving = prev.filter((e) => e.state === 'exit' || e.doomed)
    const live = prev.filter((e) => e.state !== 'exit' && !e.doomed)
    const top = live[live.length - 1]
    const key = stackKeyOf(location.pathname)
    const requested = mode.current
    mode.current = null

    if (requested) {
      settle(live)
      const doomed = live.map((e) => ({ ...e, doomed: true }))
      setStack([...doomed, makeEntry(location, key, requested === 'reset-fade' ? 'fade' : 'enter')])
      removeLater(doomed.map((d) => d.id))
      return
    }

    if (navType === 'PUSH' || navType === 'REPLACE') {
      if (top && top.stackKey === key) {
        setStack([...leaving, ...live.slice(0, -1), { ...top, location }])
        return
      }
      if (navType === 'PUSH' || !top) {
        setStack([...prev, makeEntry(location, key, 'enter')])
        return
      }
      settle([top])
      setStack([...leaving, ...live.slice(0, -1), { ...top, doomed: true }, makeEntry(location, key, 'enter')])
      removeLater([top.id])
      return
    }

    // POP — back or forward through history.
    let index = live.findIndex((e) => e.location.key === location.key)
    if (index === -1) index = live.findIndex((e) => e.stackKey === key)
    if (index === -1) {
      settle(live)
      setStack([makeEntry(location, key, 'fade')])
      return
    }

    const above = live.slice(index + 1)
    settle(above)
    const exiting = above[above.length - 1]
    setStack([
      ...leaving.filter((e) => e.doomed),
      ...live.slice(0, index),
      { ...live[index], location },
      ...leaving.filter((e) => !e.doomed),
      ...(exiting ? [{ ...exiting, state: 'exit' as const }] : []),
    ])
    if (exiting) removeLater([exiting.id])
  }, [location, navType, stackKeyOf, settle, setStack, removeLater])

  const nav = useMemo<Nav>(
    () => ({
      push(to, data) {
        const rid = newRid()
        return new Promise((resolve) => {
          waiters.current.set(rid, resolve as (value: unknown) => void)
          navigate(to, { state: { __rid: rid, data } satisfies NavState })
        })
      },
      pop(result) {
        const live = stackRef.current.filter((e) => e.state !== 'exit' && !e.doomed)
        const top = live[live.length - 1]
        if (!top) return
        const rid = ridOf(top)
        if (rid) results.current.set(rid, result)
        if (live.length > 1) {
          navigate(-1)
          return
        }
        const parent = parentOf(top.location.pathname)
        if (parent) navigate(parent, { replace: true })
      },
      replace(to, data) {
        navigate(to, { replace: true, state: { data } satisfies NavState })
      },
      reset(to, opts) {
        mode.current = opts?.fade ? 'reset-fade' : 'reset'
        navigate(to, { replace: true, state: { data: opts?.data } satisfies NavState })
      },
      tab(to) {
        navigate(to, { replace: true })
      },
    }),
    [navigate, parentOf],
  )

  const markIdle = useCallback(
    (id: string) => setStack(stackRef.current.map((e) => (e.id === id ? { ...e, state: 'idle' } : e))),
    [setStack],
  )

  let activeIndex = -1
  stack.forEach((e, i) => {
    if (e.state !== 'exit' && !e.doomed) activeIndex = i
  })

  return (
    <NavContext.Provider value={nav}>
      {stack.map((entry, i) => (
        <Layer
          key={entry.id}
          entry={entry}
          routes={routes}
          active={i === activeIndex}
          covered={i < activeIndex}
          inert={i !== activeIndex || overlayOpen}
          canPop={i > 0 || parentOf(entry.location.pathname) != null}
          onEntered={markIdle}
        />
      ))}
      {children}
    </NavContext.Provider>
  )
}

const Layer = memo(function Layer({
  entry,
  routes,
  active,
  covered,
  inert,
  canPop,
  onEntered,
}: {
  entry: Entry
  routes: RouteObject[]
  active: boolean
  covered: boolean
  inert: boolean
  canPop: boolean
  onEntered: (id: string) => void
}) {
  const element = useRoutes(routes, entry.location)
  const info = useMemo<LayerInfo>(
    () => ({
      location: entry.location,
      active,
      canPop,
      data: (entry.location.state as NavState | null)?.data,
    }),
    [entry.location, active, canPop],
  )

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (
      (entry.state === 'enter' && e.animationName === 'page-in-move') ||
      (entry.state === 'fade' && e.animationName === 'page-in-fade')
    ) {
      onEntered(entry.id)
    }
  }

  return (
    <div
      className="layer"
      data-layer=""
      data-state={entry.state === 'idle' ? undefined : entry.state}
      data-covered={covered ? '' : undefined}
      data-top-layer={active ? '' : undefined}
      aria-hidden={active ? undefined : true}
      inert={inert}
      onAnimationEnd={onAnimationEnd}
    >
      <LayerContext.Provider value={info}>{element as ReactNode}</LayerContext.Provider>
    </div>
  )
})
