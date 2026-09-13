import { Collapse } from '../../components/Collapse'
import { Icon } from '../../components/Icon'
import { FadeSlideIn } from '../../components/motion'

/**
 * Inline error block — VendorErrorNote. Zero height when there is nothing to
 * say, so the form never jumps as the message appears.
 */
export function ErrorNote({ message }: { message: string | null }) {
  return (
    <Collapse open={Boolean(message)}>
      <div className="pt-2">
        <FadeSlideIn key={message ?? ''} duration={200} y="-20%">
          <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-danger-soft p-3">
            <Icon name="round/error_outline" size={18} color="var(--color-danger)" />
            <p className="t-body-sm flex-1 text-danger">{message}</p>
          </div>
        </FadeSlideIn>
      </div>
    </Collapse>
  )
}
