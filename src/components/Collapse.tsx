import { useRef, type ReactNode } from 'react'

/**
 * AnimatedSize for content that appears and disappears: the height eases
 * open and closed on a grid track, and the last content stays in place while
 * it closes rather than vanishing first.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(children)
  if (open) last.current = children
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 280ms var(--ease-emph)',
      }}
    >
      <div className="min-h-0 overflow-hidden">{last.current}</div>
    </div>
  )
}
