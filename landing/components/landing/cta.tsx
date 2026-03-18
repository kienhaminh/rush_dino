"use client";

export function CTA() {
  return (
    <section className="relative py-32 border-t border-white/[0.06] overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(34, 211, 200, 0.06) 0%, transparent 70%)",
        }}
      />

      {/* Diagonal pattern */}
      <div className="absolute inset-0 diagonal-stripes pointer-events-none opacity-50" />

      {/* Horizontal scan lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <div className="section-label mb-6 justify-center flex items-center gap-3">
          <span className="inline-block w-8 h-px bg-[#22d3c8]" />
          Open Source
          <span className="inline-block w-8 h-px bg-[#22d3c8]" />
        </div>

        <h2 className="font-mono font-bold mb-6" style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1 }}>
          <span className="text-white/90">TAKE BACK</span>
          <br />
          <span className="text-[#22d3c8] text-glow-teal">CONTROL</span>
          <br />
          <span className="text-white/40">OF YOUR AI.</span>
        </h2>

        <p className="font-mono text-white/40 text-sm max-w-xl mx-auto mb-12 leading-relaxed">
          Self-hosted, open source, and built for developers who believe in
          owning their infrastructure. No subscriptions. No vendor lock-in.
          Just your agent, your data.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <a
            href="https://github.com/kienhaminh/rush_dino"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs tracking-wider bg-[#22d3c8] text-[#080c10] px-10 py-4 font-bold hover:bg-[#67e8e3] transition-colors w-full sm:w-auto text-center flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            Star on GitHub
          </a>
          <a
            href="https://github.com/kienhaminh/rush_dino#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs tracking-wider border border-white/[0.10] text-white/40 px-10 py-4 hover:border-[#22d3c8]/40 hover:text-white/80 transition-all w-full sm:w-auto text-center"
          >
            Read the Docs
          </a>
        </div>

        {/* Install command */}
        <div className="max-w-lg mx-auto code-block flex items-center justify-between px-5 py-4">
          <code className="font-mono text-xs text-white/80 leading-relaxed">
            <span className="text-[#22d3c8]">$</span>{" "}
            <span className="text-[#4ade80]">curl</span> -fsSL .../install.sh{" "}
            <span className="text-white/30">| bash</span>
          </code>
          <button
            onClick={() =>
              navigator.clipboard.writeText(
                "curl -fsSL https://raw.githubusercontent.com/kienhaminh/rush_dino/main/scripts/install.sh | bash"
              )
            }
            className="font-mono text-xs text-white/25 hover:text-[#22d3c8] transition-colors ml-4"
          >
            COPY
          </button>
        </div>

        {/* License badge */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <span className="font-mono text-xs text-white/25">MIT License</span>
          <span className="w-1 h-1 rounded-full bg-white/15" />
          <span className="font-mono text-xs text-white/25">Open Source</span>
          <span className="w-1 h-1 rounded-full bg-white/15" />
          <span className="font-mono text-xs text-white/25">Self-Hosted</span>
        </div>
      </div>
    </section>
  );
}
