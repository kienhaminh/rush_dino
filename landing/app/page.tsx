import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { StatsBar } from "@/components/landing/stats-bar";
import { Features } from "@/components/landing/features";
import { AgentIntelligence } from "@/components/landing/agent-intelligence";
import { Security } from "@/components/landing/security";
import { Channels } from "@/components/landing/channels";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <StatsBar />
      <Features />
      <AgentIntelligence />
      <Security />
      <Channels />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}
