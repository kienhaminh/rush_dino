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
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400 m-0 mb-[14px]">
        {eyebrow}
      </p>
      <h1 className="font-sans font-bold text-[clamp(36px,4.6vw,56px)] leading-[1.05] tracking-[-0.02em] text-text-primary m-0">
        {title}
      </h1>
      <p className="font-sans text-[15px] leading-[1.55] text-text-secondary max-w-[58ch] mt-5">
        {lede}
      </p>
      {children && (
        <div className="mt-6 pt-5 border-t border-border-line">{children}</div>
      )}
    </GlassPanel>
  )
}
