import { createElement, lazy, useState, type ComponentProps, type ComponentType } from 'react'

/**
 * A code-split page that renders at once when its code is already here.
 *
 * React.lazy suspends on its first render even when the module has long
 * since downloaded, and React then holds the Suspense fallback for about
 * 300ms before revealing the page. After a prefetch that is 300ms of empty
 * screen for nothing. This renders the loaded module directly, and only
 * falls back to React.lazy for a genuinely cold load.
 *
 * The choice is made once per mounted page, so a page that did suspend is
 * never swapped for a different component type later — which would remount
 * it and throw away its state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<M extends { default: ComponentType<any> }>(loader: () => Promise<M>) {
  type Props = ComponentProps<M['default']>
  let loaded: M['default'] | null = null
  let pending: Promise<M> | null = null

  /** Downloads the module (once) and resolves with it. */
  const preload = (): Promise<M> =>
    (pending ??= loader().then(
      (module) => {
        loaded = module.default
        return module
      },
      (error: unknown) => {
        // A failed download is retried next time rather than cached forever.
        pending = null
        throw error
      },
    ))

  const Lazy = lazy(async () => ({ default: (await preload()).default }))

  function Page(props: Props) {
    const [Component] = useState<ComponentType<Props>>(() => (loaded ?? Lazy) as ComponentType<Props>)
    return createElement(Component, props)
  }

  return Object.assign(Page, { preload })
}
