import type { ReactNode } from 'react'
import { GlassPanel } from '@/components/glass/GlassPanel'

type Props = {
  eyebrow: string
  title: string
  lede: string
  children?: ReactNode
}

/**
 * Shared layout for feature-area placeholders. Each page owns its own
 * eyebrow/title/lede so the shell never feels same-y between routes.
 * Phase D replaces each call site with a real implementation.
 */
export function PlaceholderPage({ eyebrow, title, lede, children }: Props) {
  return (
    <GlassPanel variant="hero">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display-title">{title}</h1>
      <p className="lede">{lede}</p>
      {children && <div className="placeholder-body">{children}</div>}
    </GlassPanel>
  )
}
