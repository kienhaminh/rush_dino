import { cn } from '@/lib/cn'

type Props = {
  className?: string
  /** Whether the line animates from 0 → full width on mount. */
  animated?: boolean
  /** Opacity multiplier — the iridescent is meant to stay subtle. */
  opacity?: number
}

/**
 * A 1px horizontal hairline rendered with the copper→magenta→teal→gold
 * iridescent gradient. Reserved for exactly four surfaces app-wide:
 *   (1) under the titlebar on window focus
 *   (2) command palette divider
 *   (3) Knowledge Graph edge highlight base
 *   (4) active agent status line
 * Using it elsewhere will cheapen the effect.
 */
export function IridescentLine({ className, animated = false, opacity = 0.4 }: Props) {
  return (
    <span
      aria-hidden
      className={cn('iridescent-line', animated && 'iridescent-line--animated', className)}
      style={{ opacity }}
    />
  )
}
