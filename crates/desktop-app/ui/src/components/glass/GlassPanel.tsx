import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

type GlassVariant = 'body' | 'hero' | 'modal' | 'inspector' | 'compact'

type GlassPanelProps = ComponentPropsWithoutRef<'section'> & {
  variant?: GlassVariant
}

// Shared base: panel surface + strong border + medium radius. Variants tune
// padding and (for hero/modal) the radius / max-width.
const BASE = 'bg-bg-panel border border-border-strong rounded-lg'

const VARIANT_CLASS: Record<GlassVariant, string> = {
  body:      cn(BASE, 'px-7 py-6'),
  hero:      cn(BASE, 'w-full max-w-[760px] px-9 py-8'),
  modal:     cn(BASE, 'px-7 py-6 rounded-xl'),
  inspector: cn(BASE, 'px-4 py-[18px] rounded-md'),
  compact:   cn(BASE, 'px-5 py-4 rounded-md'),
}

/**
 * Translucent glass surface. Pairs with the macOS vibrancy substrate that the
 * Tauri main window installs via `window-vibrancy`. The outer stroke + the
 * 1px inner-top highlight together are what sell the glass — don't drop either.
 */
export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(
  ({ variant = 'body', className, ...rest }, ref) => (
    <section ref={ref} className={cn(VARIANT_CLASS[variant], className)} {...rest} />
  ),
)
GlassPanel.displayName = 'GlassPanel'
