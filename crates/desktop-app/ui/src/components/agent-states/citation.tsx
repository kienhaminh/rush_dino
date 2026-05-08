import { useState } from 'react'
import { cn } from '@/lib/cn'

export function Citation({
  num = 1,
  title = 'Rust async-trait RFC',
  domain = 'rust-lang.github.io',
  excerpt,
}: {
  num?: number
  title?: string
  domain?: string
  excerpt?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-teal-400 text-[11px] cursor-pointer font-semibold font-[inherit] border border-[rgb(34_211_200_/_0.25)]',
          open ? 'bg-[rgb(34_211_200_/_0.15)]' : 'bg-[rgb(34_211_200_/_0.08)]',
        )}
      >
        <span className="font-mono text-[10px]">{String(num).padStart(2, '0')}</span>
        <span>{domain}</span>
      </button>
      {open && (
        <div className="mt-2 px-3 py-2.5 bg-bg-surface border border-border-strong rounded-lg max-w-[360px] text-xs leading-[1.5]">
          <div className="text-text-primary font-semibold mb-1">{title}</div>
          <div className="text-teal-400 font-mono text-[10px] mb-1.5">{domain}</div>
          {excerpt && <div className="text-text-muted italic">{`"${excerpt}"`}</div>}
        </div>
      )}
    </div>
  )
}
