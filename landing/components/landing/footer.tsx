export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#080c10]">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Logo + tagline */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-6 relative">
                <div className="absolute inset-0 bg-[#22d3c8] rounded-sm opacity-15" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-[#22d3c8] text-xs font-bold">RD</span>
                </div>
              </div>
              <span className="font-mono font-bold text-sm text-white/85 tracking-widest">RUSHDINO</span>
            </div>
            <p className="font-mono text-xs text-white/25">
              Local-first AI agent platform. Built with Rust.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-6">
            {[
              { label: "GitHub", href: "https://github.com/kienhaminh/rush_dino" },
              { label: "README", href: "https://github.com/kienhaminh/rush_dino#readme" },
              { label: "Architecture", href: "https://github.com/kienhaminh/rush_dino/blob/main/ARCHITECTURE.md" },
              { label: "License", href: "https://github.com/kienhaminh/rush_dino/blob/main/LICENSE" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-white/25 hover:text-[#22d3c8] transition-colors animated-underline"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="separator-teal mt-8 mb-6 opacity-30" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-xs text-white/20">
            © 2025 RushDino. MIT License.
          </p>
          <p className="font-mono text-xs text-white/20">
            Built with{" "}
            <span className="text-[#22d3c8]">Rust</span>
            {" "}&{" "}
            <span className="text-[#4ade80]">❤</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
