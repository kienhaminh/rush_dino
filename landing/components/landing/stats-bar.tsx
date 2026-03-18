const stats = [
  { value: "100+", label: "Concurrent Conversations" },
  { value: "3+", label: "LLM Providers" },
  { value: "4", label: "Messaging Channels" },
  { value: "<500ms", label: "End-to-End Latency" },
  { value: "0", label: "Cloud Dependencies" },
  { value: "MIT", label: "Open Source License" },
];

export function StatsBar() {
  return (
    <section className="border-t border-b border-white/[0.08] bg-[#0d1117]">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/[0.06]">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-[#0d1117] px-6 py-5 text-center hover:bg-[#111820] transition-colors"
            >
              <div className="font-mono font-bold text-2xl text-[#22d3c8] mb-1">{stat.value}</div>
              <div className="font-mono text-xs text-white/25 leading-tight">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
