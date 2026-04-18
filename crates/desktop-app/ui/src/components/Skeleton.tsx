import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

type BaseProps = {
  className?: string
  style?: CSSProperties
  width?: number | string
  height?: number | string
  rounded?: boolean
}

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
      className={cn('skeleton', rounded && 'skeleton--pill', className)}
      aria-hidden
      style={{ width, height, ...style }}
    />
  )
}

/** Stack of `lines` text-height bars, each a randomly varied width. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('skeleton-text', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={10}
          width={`${70 + ((i * 13) % 26)}%`}
          className="skeleton--line"
        />
      ))}
    </div>
  )
}

/** Card shape (icon + title + 2 text lines). Stands in for grid cards. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton-card', className)}>
      <div className="skeleton-card__head">
        <Skeleton width={28} height={28} className="skeleton--square" />
        <Skeleton width="55%" height={12} />
      </div>
      <Skeleton width="90%" height={10} className="skeleton--line" />
      <Skeleton width="72%" height={10} className="skeleton--line" />
    </div>
  )
}

/** Row shape (avatar + name + meta). Stands in for list rows. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton-row', className)}>
      <Skeleton width={18} height={18} className="skeleton--square" />
      <div className="skeleton-row__body">
        <Skeleton width="60%" height={11} />
        <Skeleton width="35%" height={9} className="skeleton--line" />
      </div>
    </div>
  )
}

/** Kanban-card shape for the board columns. */
export function SkeletonKanbanCard({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton-kcard', className)}>
      <div className="skeleton-kcard__head">
        <Skeleton width={42} height={14} rounded />
        <Skeleton width={14} height={14} className="skeleton--square" />
      </div>
      <Skeleton width="85%" height={11} className="skeleton--line" />
      <Skeleton width="70%" height={10} className="skeleton--line" />
      <div className="skeleton-kcard__meta">
        <Skeleton width={46} height={11} rounded />
        <Skeleton width={28} height={11} rounded />
      </div>
    </div>
  )
}

/** Single-run row inside AgentPanel. */
export function SkeletonAgentRun({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton-run', className)}>
      <div className="skeleton-run__head">
        <Skeleton width={58} height={12} rounded />
        <Skeleton width={32} height={9} />
      </div>
      <Skeleton width="80%" height={10} className="skeleton--line" />
      <Skeleton width="60%" height={10} className="skeleton--line" />
    </div>
  )
}
