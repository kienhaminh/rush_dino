const steps = [
  {
    number: "01",
    title: "Install",
    description: "One-liner installer for Linux. Or build from source with Rust stable + Node.js.",
    code: `curl -fsSL https://raw.githubusercontent.com/\\
  kienhaminh/rush_dino/main/scripts/install.sh | bash`,
  },
  {
    number: "02",
    title: "Initialize",
    description: "Creates config.toml and initializes SQLite database in ~/.rushdino/",
    code: `rushdino init
# → ~/.rushdino/config.toml created
# → ~/.rushdino/db.sqlite initialized`,
  },
  {
    number: "03",
    title: "Configure",
    description: "Add your LLM API keys and messaging platform tokens to config.toml",
    code: `[providers.openai]
api_key = "sk-..."

[channels.telegram]
enabled = true
token = "bot:..."`,
  },
  {
    number: "04",
    title: "Launch",
    description: "Start the server. All enabled channels activate and your agent is live.",
    code: `rushdino start
# → Telegram: listening
# → Discord: connected  
# → Web UI: localhost:28847`,
  },
];

export function HowItWorks() {
  return (
    <section id="install" className="relative py-32 border-t border-white/[0.06]">
      {/* Vertical accent line */}
      <div className="absolute right-[15%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#22d3c8]/08 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-20">
          <div className="section-label mb-4 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-[#22d3c8]" />
            Getting Started
          </div>
          <h2 className="font-mono font-bold text-[2.4rem] lg:text-[3.2rem] text-white/90 leading-none">
            UP AND RUNNING
            <br />
            IN{" "}
            <span className="text-[#22d3c8]">MINUTES.</span>
          </h2>
          <div className="separator-teal mt-8 opacity-60" />
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {steps.map((step, index) => (
            <StepRow key={step.number} step={step} isLast={index === steps.length - 1} />
          ))}
        </div>

        {/* CLI reference */}
        <div className="mt-20 border border-white/[0.08] bg-[#0d1117] p-8">
          <div className="section-label mb-6">CLI Reference</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { cmd: "rushdino init", desc: "Initialize config and database" },
              { cmd: "rushdino start", desc: "Start the server" },
              { cmd: "rushdino stop", desc: "Stop the server" },
              { cmd: "rushdino restart", desc: "Restart the server" },
              { cmd: "rushdino status", desc: "Check server status" },
              { cmd: "rushdino upgrade", desc: "Upgrade to latest version" },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="flex flex-col gap-1">
                <code className="font-mono text-sm text-[#22d3c8]">{cmd}</code>
                <span className="font-mono text-xs text-white/25">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: (typeof steps)[0];
  isLast: boolean;
}) {
  return (
    <div className={`flex gap-8 ${!isLast ? "border-b border-white/[0.06]" : ""} py-10`}>
      {/* Step number column */}
      <div className="flex-shrink-0 w-20 flex flex-col items-center">
        <div className="font-mono font-bold text-5xl text-[#22d3c8]/15 leading-none">
          {step.number}
        </div>
        {!isLast && (
          <div className="flex-1 w-px bg-gradient-to-b from-[#22d3c8]/20 to-transparent mt-2" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 grid lg:grid-cols-2 gap-8 items-start">
        <div>
          <h3 className="font-mono font-bold text-2xl text-white/85 mb-3">{step.title}</h3>
          <p className="font-mono text-white/40 text-sm leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Code block */}
        <div className="code-block px-5 py-4">
          <pre className="font-mono text-xs text-white/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
            <code>{step.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
