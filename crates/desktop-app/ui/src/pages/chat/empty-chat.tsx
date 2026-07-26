import { Sparkles } from 'lucide-react'

/** Empty state shown when a conversation has no messages yet. */
export function EmptyChat() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center px-6 pb-1 text-center">
      <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl border border-border-base bg-bg-panel text-teal-400 shadow-sm">
        <Sparkles size={20} strokeWidth={1.6} aria-hidden />
      </div>
      <h2 className="m-0 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
        Start a conversation
      </h2>
      <p className="m-0 mt-2 max-w-[46ch] text-[13px] leading-[1.55] text-text-muted">
        Ask a question, hand off a task, or paste code. RushDino keeps the work local and streams
        progress into this thread.
      </p>
    </div>
  )
}
