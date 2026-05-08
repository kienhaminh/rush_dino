export function Streaming({ text = 'Analyzing the request' }: { text?: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 px-3 py-2 bg-bg-card border border-border-line rounded-lg text-[13px] text-text-primary">
      <span className="inline-flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[5px] h-[5px] rounded-full bg-teal-400"
            // Per-dot animation delay is computed; keep inline.
            style={{ animation: `rd-shimmer 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </span>
      <span>{text}</span>
      <span className="inline-block w-2 h-3.5 bg-teal-400 ml-0.5 align-middle animate-[rd-blink_1s_step-end_infinite]" />
    </div>
  )
}
