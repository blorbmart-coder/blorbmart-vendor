import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'

/**
 * The vendor app's own web-app registration inside the shared Blorbmart
 * project (`blorbmart-b29b7`) — the same registration the Flutter web build
 * used, so it is the same app to Firebase: same users, same rules, same
 * analytics stream.
 *
 * This is public client configuration, not a secret: every value here ships
 * inside any Firebase web bundle, and access is decided by Auth and the
 * Firestore rules.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAGGDTIx4YY8_7cwuPBDkJV-plZpr-IhWs',
  authDomain: 'blorbmart-b29b7.firebaseapp.com',
  projectId: 'blorbmart-b29b7',
  storageBucket: 'blorbmart-b29b7.firebasestorage.app',
  messagingSenderId: '840596799490',
  appId: '1:840596799490:web:b4b2e30afc4efedbe6671b',
}

export const app = initializeApp(firebaseConfig)

/**
 * initializeAuth rather than getAuth, deliberately. getAuth wires in the
 * popup/redirect resolver, which loads Google's gapi iframe from
 * firebaseapp.com on startup. Vendors sign in with an email and password
 * only, so that iframe would be ~80KB of script and a third-party frame on
 * every visit for a sign-in method this app does not offer. Leaving it out
 * is also what lets the CSP say `frame-src 'none'`.
 */
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
