const features = [
  {
    number: "01",
    icon: "🦀",
    title: "Built in Rust",
    description:
      "No GC pauses. Memory-safe by design. Single-binary deployment with sub-500ms end-to-end message latency.",
    stat: "<500ms",
    statLabel: "latency",
  },
  {
    number: "02",
    icon: "🔒",
    title: "Local-First Privacy",
    description:
      "Self-hosted, no cloud dependencies. Your conversations stay on your machine. Data stored in local SQLite.",
    stat: "0",
    statLabel: "cloud calls",
  },
  {
    number: "03",
    icon: "⚡",
    title: "Write Once, Run Everywhere",
    description:
      "Single AgentEngine powers Telegram, Discord, Slack, and Web simultaneously. Add new channels without touching core logic.",
    stat: "4",
    statLabel: "channels",
  },
  {
    number: "04",
    icon: "🧠",
    title: "Multi-LLM Backend",
    description:
      "GPT-5.4, Claude Opus 4.6, Kimi 2.5, or local Ollama. Swap providers with a config change. Automatic fallback on failure.",
    stat: "3+",
    statLabel: "providers",
  },
  {
    number: "05",
    icon: "🔌",
    title: "Plugin Architecture",
    description:
      "Extensible via trait-based adapters. Add new channels and LLM providers with minimal boilerplate.",
    stat: "∞",
    statLabel: "extensible",
  },
  {
    number: "06",
    icon: "💾",
    title: "Session Continuity",
    description:
      "Conversations persist across server restarts. Per-user sessions tied to each channel. ACID transactions via SQLite.",
    stat: "100%",
    statLabel: "persistence",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-32 border-t border-white/[0.06]">
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(34, 211, 200, 0.04) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-16">
          <div className="section-label mb-4 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-[#22d3c8]" />
            Why RushDino
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-mono font-bold text-[2.4rem] lg:text-[3.2rem] text-white/90 leading-none">
              BUILT FOR
              <br />
              <span className="text-[#22d3c8]">DEVELOPERS</span>
              <br />
              WHO CARE.
            </h2>
            <p className="lg:max-w-xs font-mono text-white/40 text-sm leading-relaxed">
              Performance-obsessed, privacy-respecting, and extensible by
              design. No compromises on what matters.
            </p>
          </div>
          <div className="separator-teal mt-6 opacity-60" />
        </div>

        {/* Feature grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.06]">
          {features.map((feature) => (
            <FeatureCard key={feature.number} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
}: {
  feature: (typeof features)[0];
}) {
  return (
    <div className="feature-card bg-[#080c10] p-8 group">
      {/* Number */}
      <div className="font-mono text-xs text-white/20 mb-6 flex items-center justify-between">
        <span>{feature.number}</span>
        <span className="text-2xl">{feature.icon}</span>
      </div>

      {/* Title */}
      <h3 className="font-mono font-semibold text-white/85 text-base mb-3 group-hover:text-[#22d3c8] transition-colors">
        {feature.title}
      </h3>

      {/* Description */}
      <p className="font-mono text-white/40 text-xs leading-relaxed mb-8">
        {feature.description}
      </p>

      {/* Stat */}
      <div className="mt-auto pt-4 border-t border-white/[0.06]">
        <span className="font-mono font-bold text-3xl text-[#22d3c8]">
          {feature.stat}
        </span>
        <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
          {feature.statLabel}
        </span>
      </div>
    </div>
  );
}
