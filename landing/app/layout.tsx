import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RushDino — Local-First AI Agent Platform",
  description:
    "A local-first AI agent platform built in Rust. Run your AI agents across Telegram, Discord, Slack, and Web simultaneously. Self-hosted, privacy-preserving, and extensible.",
  keywords: ["AI agent", "local AI", "self-hosted", "Rust", "Telegram bot", "Discord bot", "Ollama", "OpenAI"],
  openGraph: {
    title: "RushDino — Local-First AI Agent Platform",
    description: "Run AI everywhere. Own your data. Built in Rust.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
