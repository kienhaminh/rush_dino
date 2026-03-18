"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#080c10]/95 backdrop-blur-md border-b border-white/[0.08]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="#" className="flex items-center gap-3 group">
          <div className="w-8 h-8 relative">
            <div className="absolute inset-0 bg-[#22d3c8] rounded-sm opacity-15 group-hover:opacity-25 transition-opacity" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[#22d3c8] text-xs font-bold">RD</span>
            </div>
          </div>
          <span className="font-mono font-bold text-base text-white/90 tracking-widest">
            RUSHDINO
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-8">
          {["Features", "Intelligence", "Channels", "Install"].map((item) => (
            <Link
              key={item}
              href={`#${item.toLowerCase()}`}
              className="font-mono text-xs tracking-wider text-white/40 hover:text-white/90 transition-colors animated-underline"
            >
              {item}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <a
          href="https://github.com/kienhaminh/rush_dino"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs tracking-wider border border-[#22d3c8]/40 text-[#22d3c8] px-4 py-1.5 hover:bg-[#22d3c8] hover:text-[#080c10] transition-all duration-200 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
          GitHub
        </a>
      </div>
    </nav>
  );
}
