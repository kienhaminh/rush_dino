import { cn } from '@/lib/cn'

type Props = {
  className?: string
  /** Whether the line animates from 0 → full width on mount. */
  animated?: boolean
  /** Opacity multiplier — the iridescent is meant to stay subtle. */
  opacity?: number
}

// Static gradient — copper→teal hairline. For the animated variant, the
// background is widened to 200% and the @keyframes rd-iridescent-sweep
// animation (declared in index.css alongside the legacy rule) shifts the
// background-position.
const STATIC_BG =
  'bg-[linear-gradient(90deg,rgba(34,211,200,0.4)_0%,transparent_70%)]'
const ANIMATED_BG =
  'bg-[linear-gradient(90deg,rgba(34,211,200,0.4)_0%,rgba(34,211,200,0.15)_40%,transparent_80%)] bg-[length:200%_100%] animate-[rd-iridescent-sweep_6s_linear_infinite]'

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
      className={cn(
        'block h-px w-full',
        animated ? ANIMATED_BG : STATIC_BG,
        className,
      )}
      style={{ opacity }}
    />
  )
}
