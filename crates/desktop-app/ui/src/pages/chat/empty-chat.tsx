/** Empty state shown when a conversation has no messages yet. */
export function EmptyChat() {
  return (
    <div className="max-w-[640px] px-3 pt-10 pb-4">
      <div className="font-mono text-[10px] font-bold tracking-[0.2em] text-teal-300 mb-[18px]">
        FRESH SESSION
      </div>
      <h2 className="text-[clamp(32px,3.2vw,44px)] font-semibold tracking-[-0.02em] leading-[1.08] text-text-primary m-0 mb-[18px]">
        Run AI everywhere. Own your data.
      </h2>
      <p className="text-sm leading-[1.6] text-text-secondary max-w-[52ch] m-0">
        RushDino runs locally on your machine. Start with a question, a task, or a paste of code —
        tool output streams into the same thread.
      </p>
    </div>
  )
}
