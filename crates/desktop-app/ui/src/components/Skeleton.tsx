import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

type BaseProps = {
  className?: string
  style?: CSSProperties
  width?: number | string
  height?: number | string
  rounded?: boolean
}

// Quiet pulse against the panel surface — uses the bg-overlay token so the
// shimmer reads in both light and dark themes without harsh white flashes.
const SKELETON_BASE =
  'inline-block align-middle rounded-[4px] bg-bg-overlay animate-pulse motion-reduce:animate-none'

// Shared surface for composite skeletons — matches `.skeleton-card` /
// `.skeleton-kcard` / `.skeleton-run` from the legacy stylesheet.
const CARD_SURFACE = 'bg-bg-card border border-border-subtle rounded-md'

// Default styling for "text line" skeletons — block + the 6px top gap from
// the legacy `.skeleton--line` rule.
const LINE_BAR = 'block mt-1.5'

/**
 * Shimmering placeholder block. Pass width/height as px or any CSS length;
 * `rounded` swaps the small default radius for a pill shape. Every visual
 * loading state in the app should route through this or one of the
 * composite helpers below — it keeps the shimmer consistent and respects
 * the design-system tokens in both light and dark themes.
 */
export function Skeleton({ className, style, width, height, rounded }: BaseProps) {
  return (
    <span
      className={cn(SKELETON_BASE, rounded && 'rounded-full', className)}
      aria-hidden
      style={{ width, height, ...style }}
    />
  )
}

/** Stack of `lines` text-height bars, each a randomly varied width. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={10}
          width={`${70 + ((i * 13) % 26)}%`}
          className={LINE_BAR}
        />
      ))}
    </div>
  )
}

/** Card shape (icon + title + 2 text lines). Stands in for grid cards. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 px-4 py-3.5', CARD_SURFACE, className)}>
      <div className="flex items-center gap-2.5">
        <Skeleton width={28} height={28} className="rounded-md" />
        <Skeleton width="55%" height={12} />
      </div>
      <Skeleton width="90%" height={10} className={LINE_BAR} />
      <Skeleton width="72%" height={10} className={LINE_BAR} />
    </div>
  )
}

/** Row shape (avatar + name + meta). Stands in for list rows. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 px-2.5 py-2', className)}>
      <Skeleton width={18} height={18} className="rounded-md" />
      <div className="flex-1 flex flex-col gap-1">
        <Skeleton width="60%" height={11} />
        <Skeleton width="35%" height={9} className={LINE_BAR} />
      </div>
    </div>
  )
}

/** Kanban-card shape for the board columns. */
export function SkeletonKanbanCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-3 py-2.5', CARD_SURFACE, className)}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton width={42} height={14} rounded />
        <Skeleton width={14} height={14} className="rounded-md" />
      </div>
      <Skeleton width="85%" height={11} className={LINE_BAR} />
      <Skeleton width="70%" height={10} className={LINE_BAR} />
      <div className="flex gap-1.5 mt-0.5">
        <Skeleton width={46} height={11} rounded />
        <Skeleton width={28} height={11} rounded />
      </div>
    </div>
  )
}

/** Single-run row inside AgentPanel. */
export function SkeletonAgentRun({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5 px-3 py-2.5', CARD_SURFACE, className)}>
      <div className="flex items-center justify-between">
        <Skeleton width={58} height={12} rounded />
        <Skeleton width={32} height={9} />
      </div>
      <Skeleton width="80%" height={10} className={LINE_BAR} />
      <Skeleton width="60%" height={10} className={LINE_BAR} />
    </div>
  )
}
