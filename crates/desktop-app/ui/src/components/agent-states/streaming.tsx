import { TEAL, INK, LINE, SURFACE_2 } from './tokens'

export function Streaming({ text = 'Analyzing the request' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: SURFACE_2,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        fontSize: 13,
        color: INK,
      }}
    >
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: TEAL,
              animation: `rd-shimmer 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </span>
      <span>{text}</span>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 14,
          background: TEAL,
          animation: 'rd-blink 1s step-end infinite',
          marginLeft: 2,
          verticalAlign: 'middle',
        }}
      />
    </div>
  )
}
