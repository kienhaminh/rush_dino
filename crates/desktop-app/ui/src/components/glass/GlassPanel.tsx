import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

type GlassVariant = 'body' | 'hero' | 'modal' | 'inspector' | 'compact'

type GlassPanelProps = ComponentPropsWithoutRef<'section'> & {
  variant?: GlassVariant
}

const VARIANT_CLASS: Record<GlassVariant, string> = {
  body: 'glass-panel',
  hero: 'glass-panel glass-panel--hero',
  modal: 'glass-panel glass-panel--modal',
  inspector: 'glass-panel glass-panel--inspector',
  compact: 'glass-panel glass-panel--compact',
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
