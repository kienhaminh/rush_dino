"use client";

import { useEffect, useRef, useState } from "react";

const TERM_LINES: { type: "cmd" | "output"; content: string; colorClass?: string }[] = [
  { type: "cmd",    content: "rushdino init" },
  { type: "output", content: "✓ Config created at ~/.rushdino/config.toml", colorClass: "text-[#4ade80]" },
  { type: "output", content: "✓ Database initialized",                     colorClass: "text-[#4ade80]" },
  { type: "cmd",    content: "rushdino start" },
  { type: "output", content: "→ Telegram adapter: listening",               colorClass: "text-[#17C4D6]" },
  { type: "output", content: "→ Discord adapter: connected",                colorClass: "text-[#17C4D6]" },
  { type: "output", content: "→ Slack adapter: socket mode",                colorClass: "text-[#17C4D6]" },
  { type: "output", content: "→ Web UI: http://localhost:28847",            colorClass: "text-[#17C4D6]" },
  { type: "output", content: "✓ RushDino running. All systems go.",         colorClass: "text-[#4ade80]" },
];

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/kienhaminh/rush_dino/main/scripts/install.sh | bash";

export function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }[] = [];

    for (let i = 0; i < 55; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        size: Math.random() * 1.5 + 0.3,
        opacity: Math.random() * 0.22 + 0.04,
      });
    }

    let animFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 200, ${p.opacity})`;
        ctx.fill();
      });
      animFrame = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(INSTALL_CMD);
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden diagonal-stripes">
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Grid lines overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 211, 200, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 200, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
        }}
      />

      {/* Radial ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 30% 50%, rgba(34, 211, 200, 0.04) 0%, transparent 65%)",
        }}
      />

      {/* Left accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#22d3c8]/15 to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-8 lg:px-12 pt-24 pb-24 w-full">
        <div className="grid lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] gap-12 xl:gap-16 items-start">

          {/* Left: Text content */}
          <div className="flex flex-col">
            {/* Section label */}
            <div className="section-label mb-5 animate-fade-in-up flex items-center gap-3">
              <span className="inline-block w-6 h-px bg-[#22d3c8]" />
              Local-First AI Platform
            </div>

            {/* Headline */}
            <h1
              className="font-mono font-bold animate-fade-in-up animate-delay-1 mb-5 leading-none"
              style={{ fontSize: "clamp(3rem, 5.5vw, 5rem)" }}
            >
              <span className="text-white/90">RUN AI</span>
              <br />
              <span className="text-[#22d3c8] text-glow-teal">EVERY</span>
              <span className="text-white/90">WHERE</span>
              <br />
              <span className="text-white/25">OWN YOUR</span>
              <br />
              <span className="text-white/65">DATA.</span>
            </h1>

            {/* Subtext */}
            <p className="font-mono text-white/40 text-sm leading-relaxed mb-7 max-w-md animate-fade-in-up animate-delay-2">
              A local-first AI agent platform built in Rust. One server, four
              messaging channels, multiple LLM providers — self-hosted and
              privacy-preserving.
            </p>

            {/* Tech badges */}
            <div className="flex flex-wrap gap-2 mb-8 animate-fade-in-up animate-delay-2">
              {["Rust", "Async/Tokio", "GPT-5.4", "Claude Opus 4.6", "Kimi 2.5", "Ollama"].map((tech) => (
                <span
                  key={tech}
                  className="font-mono text-xs border border-white/[0.10] text-white/30 px-3 py-1 hover:border-[#22d3c8]/40 hover:text-white/70 transition-colors"
                >
                  {tech}
                </span>
              ))}
            </div>

            {/* Install command */}
            <div className="animate-fade-in-up animate-delay-3 mb-7">
              <p className="section-label mb-2">Quick Install</p>
              <div className="code-block flex items-center justify-between px-4 py-3">
                <code className="font-mono text-xs text-white/80 pr-4 leading-relaxed">
                  <span className="text-[#22d3c8]">$</span>{" "}
                  <span className="text-[#4ade80]">curl</span> -fsSL{" "}
                  <span className="text-[#17C4D6]">https://...</span>install.sh{" "}
                  <span className="text-white/30">| bash</span>
                </code>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 font-mono text-xs text-white/25 hover:text-[#22d3c8] transition-colors px-2 py-1 border border-transparent hover:border-white/10"
                  title="Copy install command"
                >
                  COPY
                </button>
              </div>
              <p className="font-mono text-xs text-white/20 mt-1.5">
                Then:{" "}
                <span className="text-white/40">rushdino init</span>
                {" "}→{" "}
                <span className="text-white/40">rushdino start</span>
              </p>
            </div>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3 animate-fade-in-up animate-delay-4">
              <a
                href="https://github.com/kienhaminh/rush_dino"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs tracking-wider bg-[#22d3c8] text-[#080c10] px-6 py-3 font-bold hover:bg-[#67e8e3] transition-colors flex items-center gap-2"
              >
                <GitHubIcon />
                View on GitHub
              </a>
              <a
                href="#features"
                className="font-mono text-xs tracking-wider border border-white/10 text-white/40 px-6 py-3 hover:border-[#22d3c8]/40 hover:text-white/80 transition-all"
              >
                Learn More →
              </a>
            </div>
          </div>

          {/* Right: Terminal mockup — visible at lg+ */}
          <div className="animate-fade-in-up animate-delay-3 hidden lg:block mt-8">
            <TerminalMockup />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-subtle-pulse">
          <div className="font-mono text-xs text-white/20 tracking-widest">SCROLL</div>
          <div className="w-px h-8 bg-gradient-to-b from-[#22d3c8]/30 to-transparent" />
        </div>
      </div>
    </section>
  );
}

function TerminalMockup() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typedChars, setTypedChars]     = useState(0);

  useEffect(() => {
    if (visibleCount >= TERM_LINES.length) {
      // All lines shown — pause then reset
      const t = setTimeout(() => {
        setVisibleCount(0);
        setTypedChars(0);
      }, 2800);
      return () => clearTimeout(t);
    }

    const line = TERM_LINES[visibleCount];

    if (line.type === "cmd") {
      if (typedChars < line.content.length) {
        // Type one more character
        const t = setTimeout(() => setTypedChars((c) => c + 1), 55);
        return () => clearTimeout(t);
      }
      // Command fully typed — short pause then advance
      const t = setTimeout(() => {
        setVisibleCount((c) => c + 1);
        setTypedChars(0);
      }, 380);
      return () => clearTimeout(t);
    }

    // Output line — brief delay then reveal
    const t = setTimeout(() => {
      setVisibleCount((c) => c + 1);
      setTypedChars(0);
    }, 210);
    return () => clearTimeout(t);
  }, [visibleCount, typedChars]);

  const currentLine   = TERM_LINES[visibleCount];
  const isTypingCmd   = currentLine?.type === "cmd";
  const allDone       = visibleCount >= TERM_LINES.length;

  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="absolute -inset-6 bg-[#22d3c8]/4 blur-3xl rounded-full pointer-events-none" />

      {/* Terminal window */}
      <div className="relative border border-white/[0.08] bg-[#0d1117]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.08] bg-[#080c10]">
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#22d3c8]/45" />
          <span className="ml-3 font-mono text-xs text-white/20">rushdino — zsh</span>
        </div>

        {/* Terminal body — fixed height prevents layout jumps */}
        <div className="p-5 min-h-[220px]">
          <div className="space-y-1.5">
            {/* Completed lines */}
            {TERM_LINES.slice(0, visibleCount).map((line, i) => (
              <div key={i} className="font-mono text-xs leading-relaxed">
                {line.type === "cmd" ? (
                  <span>
                    <span className="text-[#22d3c8]">$</span>{" "}
                    <span className="text-white/85">{line.content}</span>
                  </span>
                ) : (
                  <span className={line.colorClass ?? "text-white/30"}>{line.content}</span>
                )}
              </div>
            ))}

            {/* Currently typing command */}
            {isTypingCmd && (
              <div className="font-mono text-xs leading-relaxed">
                <span className="text-[#22d3c8]">$</span>{" "}
                <span className="text-white/85">
                  {currentLine.content.slice(0, typedChars)}
                </span>
                <span className="animate-pulse text-[#22d3c8]">▋</span>
              </div>
            )}

            {/* Idle cursor after all lines are done */}
            {allDone && (
              <div className="font-mono text-xs leading-relaxed">
                <span className="text-[#22d3c8]">$</span>{" "}
                <span className="animate-pulse text-[#22d3c8]">▋</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Corner accents */}
      <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-[#22d3c8]/25" />
      <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-[#22d3c8]/25" />
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}
