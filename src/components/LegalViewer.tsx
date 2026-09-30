/* ═══════════════════════════════════════════════════════════════════════
   Support contacts, and the legal pages read without leaving the app.

   The same file in the rider and vendor web apps. The pages live on the
   landing site (one copy to keep right) and are framed here with ?embed=1,
   which hides the site's own navigation; the landing site allows exactly
   these three pages to be framed by the app domains (blorbmart-landing
   vercel.json). Inline styles, so it looks the same in either app.
   ═══════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** 0904 592 7921, the official support line. */
export const SUPPORT_WHATSAPP = '2349045927921'
export const SUPPORT_EMAIL = 'blorbmarthelpdesk@gmail.com'

export const supportWhatsAppUrl = (message = 'Hello Blorbmart, I need help') =>
  `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`

export const supportEmailUrl = (subject = 'Help with Blorbmart') =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`

export const LEGAL_DOCS = {
  terms: { title: 'Terms and conditions', url: 'https://www.blorbmart.com.ng/terms' },
  privacy: { title: 'Privacy policy', url: 'https://www.blorbmart.com.ng/privacy' },
  'delete-account': { title: 'Delete my account', url: 'https://www.blorbmart.com.ng/delete-account' },
} as const

export type LegalDoc = keyof typeof LEGAL_DOCS

/** A full-screen reader over the app. `doc` null means closed. */
export function LegalViewer({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!doc) return
    setLoaded(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [doc, onClose])

  if (!doc) return null
  const { title, url } = LEGAL_DOCS[doc]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: '#fff' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 8px 8px',
          borderBottom: '1px solid #e9edf4',
          background: '#0a0f12',
          color: '#fff',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ width: 44, height: 44, border: 0, background: 'transparent', color: 'inherit', fontSize: 22, cursor: 'pointer' }}
        >
          ←
        </button>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{title}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, padding: '0 12px', textDecoration: 'none' }}
        >
          Open in browser
        </a>
      </header>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {!loaded && (
          <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0, color: '#6b7891' }}>
            Loading…
          </p>
        )}
        <iframe
          key={doc}
          title={title}
          src={`${url}?embed=1`}
          onLoad={() => setLoaded(true)}
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
    </div>,
    document.body,
  )
}
