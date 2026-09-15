/*
 * Title, canonical URL and robots rule for each route.
 *
 * Sign-up and sign-in are the only public pages. Everything else belongs to
 * a signed-in vendor and is kept out of search (robots.txt also asks
 * crawlers not to fetch it).
 */
const SITE = 'https://vendor.blorbmart.com.ng'

const PUBLIC: Record<string, { title: string; description: string }> = {
  '/signup': {
    title: 'Sell to students on your campus | Blorbmart Vendor',
    description:
      'Open your Blorbmart store and sell food, medicine or event tickets to students at UNIOSUN, LAUTECH, UNN and OOU. Orders and payouts in one app.',
  },
  '/login': {
    title: 'Vendor sign in | Blorbmart Vendor',
    description: 'Sign in to Blorbmart Vendor to manage your menu, orders, events, tickets and payouts.',
  },
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (href === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

export function applyRouteMeta(pathname: string): void {
  const page = PUBLIC[pathname]
  document.title = page?.title ?? 'Blorbmart Vendor'
  setMeta('name', 'robots', page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow')
  setCanonical(page ? SITE + pathname : null)
  if (!page) return
  setMeta('name', 'description', page.description)
  setMeta('property', 'og:url', SITE + pathname)
}
