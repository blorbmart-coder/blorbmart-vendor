# Blorbmart Vendor — web

The vendor side of Blorbmart for the browser: a React port of the Flutter
`blorb_vendor` app, screen for screen. It uses the same Firebase project, the
same Firestore documents, and the same backend (`Blorbmart-backend`). A vendor
can switch between the phone app and this one mid-shift. Both read and write
the same store, menu, orders and wallet.

## Run

```bash
npm install
cp .env.example .env     # optional; every key has a working default
npm run dev              # http://localhost:5175
npm run build            # icons → type-check → Vite → service worker
npm run preview          # serve the build on :5175
npm run lint
```

Port 5175 is fixed (`strictPort`). It is on the backend's CORS allowlist. Vite
falling back to 5176 would give you an origin the API refuses, and that looks
exactly like a dead backend.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind 4 · React Router 7 · Firebase Auth +
Firestore · vite-plugin-pwa (injectManifest) · Firebase Cloud Messaging.

There is no animation library, no icon font, no state library and no HTTP
client:

- **Motion** is CSS: press-scale, fade-slide, page transitions, sheets and the
  shimmer. It is all compositor-only transforms and opacity.
- **Icons** are the exact Material glyphs the Flutter app draws.
  `scripts/gen-icons.mjs` scans the source for `round/…`, `outlined/…` and
  `filled/…` names and writes only those paths into
  `src/components/icons.generated.ts`. It runs before `dev` and `build`, so a
  new icon only needs to be used. The wallet screens keep their Iconsax icons
  (`iconsax-react`, tree-shaken).
- **State**: the store, the approval status and the session are small stores
  read through `useSyncExternalStore`. They are the web versions of the
  Flutter `ChangeNotifier` repos.

## How it maps to the Flutter app

| Flutter | Here |
| --- | --- |
| `core/theme/*` | `src/index.css` (`@theme` tokens, `.t-*` type styles) |
| `core/widgets/blorb_*` | `src/components/*` |
| `Navigator` push/pop | `src/app/stack.tsx` — a page stack over browser history |
| `showBlorbSheet`, `confirmBlorb`, `showBlorbToast` | `src/components/overlay.tsx` |
| `StoreRepo`, `VendorStatusRepo`, `MenuRepo` | `src/data/*Repo.ts` |
| `services/*`, `wallet_api_service.dart` | `src/services/*`, `src/features/wallet/api.ts` |
| `features/*` | `src/features/*` |

**The page stack.** A plain router unmounts the page you leave, and the Flutter
app does not. Here every page lives in its own layer. A covered layer stays
mounted, keeping its scroll position, live listeners and half-typed forms, and
it stops painting once hidden. The browser's back button, the app bar's
arrow and a deep link all resolve through the history entry.
`nav.push(path, data)` resolves with whatever the page pops with, like
`Navigator.push<T>`.

**The dashboard tabs** share one layer and switch with `replace`, so tab changes
never pile up history. A tab stays mounted once visited, and hidden tabs skip
rendering (`content-visibility`).

## Performance

- The splash is plain HTML, so it paints before any script loads. Behind it,
  the app restores the session, reads the store and approval status, picks the
  first screen and downloads that screen's code. Then the splash fades out.
- Every page is its own chunk. Signed-out visitors never download Firestore
  until they sign in. Likely-next pages are prefetched when the browser is
  idle.
- One Firestore listener per order stage feeds both that tab's badge and its
  list. The Flutter screen opened two per stage.
- Cloudinary images are requested at the size they are drawn, bucketed so the
  cache hits (`c_limit,w_…,q_auto,f_auto`). Uploads are resized and re-encoded
  on the device first.
- The service worker precaches the app shell. The QR decoder and the wallet's
  Raleway font are cached on first use instead.
  Firestore and the API are never cached.

## Security

- **Headers** (`vercel.json`): a strict CSP (`script-src 'self'`, no frames,
  `connect-src` limited to Firebase, the API, Cloudinary and Nominatim), HSTS,
  `nosniff`, `frame-ancestors 'none'`, and a Permissions-Policy that allows
  only camera and geolocation. **If you point `VITE_API_URL` at another host,
  add that host to `connect-src`.**
- Auth uses `initializeAuth` with no popup/redirect resolver, so no Google
  iframe is ever loaded.
- Firestore uses the in-memory cache, not IndexedDB. Customer names, phones and
  addresses in orders are never left on a shared computer's disk.
- Signing out withdraws this browser's push token, closes every listener and
  forgets the cached store before the credentials go. A second session
  watcher sends every tab to sign-in if the session ends elsewhere.
- No API call sends cookies (`credentials: 'omit'`). Every call carries its own
  bearer token. Path segments are URL-encoded.
- Photos are re-encoded before upload, which strips EXIF, including the GPS
  position a phone camera stamps on them. Only `https://res.cloudinary.com/…`
  URLs are ever saved.
- Wallet PINs live only in component state, are sent once, and are cleared on
  every failure.

## Deploying

This is a new Vercel project. The origin it will be served from must be in
the backend's CORS list (`Blorbmart-backend/config/origins.js`):

- `https://blorbmart-vendor.vercel.app` is **already allowed**. Naming the
  Vercel project `blorbmart-vendor` needs no backend change.
- The existing Flutter web build is deployed as the Vercel project
  `blorb-vendor`. If this app replaces it on that project, or gets a custom
  domain, add the origin to `VENDOR_ORIGINS` on Render.

The Firebase web API key used here (the vendor web registration) must allow
the new origin, if the key has HTTP-referrer restrictions set in Google Cloud.
Add the domain to Firebase Auth's authorised domains as well.

## Where this differs from the Flutter app, on purpose

- **Sign-in checks approval.** The Flutter splash did, but its sign-in screen
  did not, so an account under review landed on a dashboard where every call
  failed. Both now route through one decision (`app/session.ts`).
- **The campus list waits 60 s with one retry**, not 20 s. It is usually the
  first call a new vendor makes, and it often reaches a sleeping Render
  instance.
- **Sign-out removes the push token.** The Flutter profile screen never
  called `removeToken`.
- **Pickers:** the bank and campus pickers use the native `<select>`, which on
  a phone opens the OS wheel. Date and time use Material 3 dialogs.
- **The splash holds for its own 800 ms entrance**, not a fixed 1.1 s.
- **Desktop:** the app stays a phone-width column, centred, rather than
  stretching.
- **Browser back leaves onboarding** instead of stepping back a page. Every
  step is already saved, so nothing is lost.
- **New-order chime:** a foreground push for a new order plays a short chime
  and shows a toast. The Flutter web build showed nothing in the foreground.
- `OnboardingDoneScreen` is not ported. It is dead code in the Flutter app,
  and nothing routes to it.
