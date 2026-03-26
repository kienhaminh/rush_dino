"use client";

import { useEffect, useState } from "react";

const FLOW_STEPS = [
  { label: "User message arrives", accent: false },
  { label: "Router dispatches to AgentEngine", accent: false },
  { label: "ReAct loop: reason → act → observe", accent: true },
  { label: "Knowledge graph facts injected", accent: false },
  { label: "Sub-agents spawned if needed", accent: false },
  { label: "Context window trimmed to budget", accent: false },
  { label: "Response streamed back", accent: false },
];

export function AgentIntelligence() {
  return (
    <section
      id="intelligence"
      className="relative py-32 border-t border-white/[0.06]"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_45%_at_75%_50%,rgba(23,196,214,0.03)_0%,transparent_60%)]" />

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-20">
          <div className="section-label mb-4 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-[#22d3c8]" />
            Agent Intelligence
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-mono font-bold text-[2.4rem] lg:text-[3.2rem] text-white/90 leading-none">
              SMARTER AGENTS.
              <br />
              <span className="text-[#22d3c8]">DEEPER MEMORY.</span>
            </h2>
            <p className="lg:max-w-xs font-mono text-white/40 text-sm leading-relaxed">
              Built-in orchestration, persistent knowledge, and intelligent
              context management — all running locally with zero cloud calls.
            </p>
          </div>
          <div className="separator-teal mt-6 opacity-60" />
        </div>

        {/* 2×2 capability cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-16">
          <AgentTeamCard />
          <WorkflowCard />
          <KnowledgeGraphCard />
          <ContextWindowCard />
        </div>

        {/* Request lifecycle flow */}
        <RequestLifecycle />

        {/* Parallel agents benchmark */}
        <div className="mt-4">
          <ParallelAgentsBenchmark />
        </div>
      </div>
    </section>
  );
}

/* ── Agent Team Card ── */
function AgentTeamCard() {
  const agents = [
    {
      name: "researcher",
      icon: "🔍",
      textClass: "text-[#22d3c8]",
      model: "gpt-5.4",
    },
    {
      name: "coder",
      icon: "💻",
      textClass: "text-[#3DBE8A]",
      model: "claude-opus-4.6",
    },
    {
      name: "writer",
      icon: "✍️",
      textClass: "text-[#17C4D6]",
      model: "kimi-2.5",
    },
    {
      name: "analyst",
      icon: "📊",
      textClass: "text-[#F5C118]",
      model: "o4-mini",
    },
  ];

  return (
    <div className="feature-card bg-[#080c10] p-7 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-white/25 mb-2">
            01 / AGENT TEAM
          </div>
          <h3 className="font-mono font-bold text-white/85 text-lg leading-tight">
            Specialized Agent
            <br />
            Roster
          </h3>
        </div>
        <div className="w-10 h-10 flex items-center justify-center border border-[#22d3c8]/25 bg-[#22d3c8]/5">
          <span className="text-lg">🤖</span>
        </div>
      </div>

      <p className="font-mono text-white/40 text-xs leading-relaxed">
        Define named agent templates with custom system prompts, preferred
        models, tool permissions, and sandbox policies. The orchestrator routes
        tasks to the right specialist automatically.
      </p>

      <div className="flex flex-col gap-1.5">
        {agents.map((a) => (
          <div
            key={a.name}
            className="flex items-center justify-between px-3 py-2 bg-[#0d1117] border border-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{a.icon}</span>
              <span className="font-mono text-xs text-white/60">{a.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs ${a.textClass}`}>
                {a.model}
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]/70" />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <span className="font-mono font-bold text-2xl text-[#22d3c8]">∞</span>
        <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
          composable agents
        </span>
      </div>
    </div>
  );
}

/* ── Workflow Card ── */
const STATUS_BG: Record<string, string> = {
  succeeded: "bg-[#4ade80]",
  running: "bg-[#22d3c8]",
  queued: "bg-white/20",
  failed: "bg-[#f87171]",
};
const STATUS_TEXT: Record<string, string> = {
  succeeded: "text-[#4ade80]",
  running: "text-[#22d3c8]",
  queued: "text-white/20",
  failed: "text-[#f87171]",
};

function WorkflowCard() {
  const steps = [
    { id: "step_1", label: "fetch_context", status: "succeeded" },
    { id: "step_2", label: "run_researcher", status: "succeeded" },
    { id: "step_3", label: "run_coder", status: "running" },
    { id: "step_4", label: "review_output", status: "queued" },
  ];

  return (
    <div className="feature-card bg-[#080c10] p-7 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-white/25 mb-2">
            02 / AGENT WORKFLOW
          </div>
          <h3 className="font-mono font-bold text-white/85 text-lg leading-tight">
            Multi-Step Workflow
            <br />
            Engine
          </h3>
        </div>
        <div className="w-10 h-10 flex items-center justify-center border border-[#17C4D6]/25 bg-[#17C4D6]/5">
          <span className="text-lg">⚙️</span>
        </div>
      </div>

      <p className="font-mono text-white/40 text-xs leading-relaxed">
        Chain multiple agents into ordered workflows. Each step can invoke
        tools, spawn sub-agents, or run shell commands. Workflows can be
        triggered manually, by the agent itself, or on a cron schedule.
      </p>

      <div className="code-block px-4 py-3">
        <div className="font-mono text-xs text-white/30 mb-2">
          workflow: deep-research · run #14
        </div>
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-1">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_BG[s.status]} ${s.status === "running" ? "animate-pulse" : ""}`}
            />
            <span className="font-mono text-xs text-white/50 w-16 flex-shrink-0">
              {s.id}
            </span>
            <span className="font-mono text-xs text-white/60">{s.label}</span>
            <span
              className={`ml-auto font-mono text-xs ${STATUS_TEXT[s.status]}`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <span className="font-mono font-bold text-2xl text-[#17C4D6]">
          cron
        </span>
        <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
          + manual + agent-spawned
        </span>
      </div>
    </div>
  );
}

/* ── Knowledge Graph Card ── */
function KnowledgeGraphCard() {
  const facts = [
    "user prefers concise responses",
    "project stack: Rust + Next.js + SQLite",
    "last deploy: 2026-03-17 via CI",
    "preferred model: claude-opus-4.6",
  ];

  return (
    <div className="feature-card bg-[#080c10] p-7 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-white/25 mb-2">
            03 / KNOWLEDGE GRAPH
          </div>
          <h3 className="font-mono font-bold text-white/85 text-lg leading-tight">
            Persistent Fact
            <br />
            Memory
          </h3>
        </div>
        <div className="w-10 h-10 flex items-center justify-center border border-[#3DBE8A]/25 bg-[#3DBE8A]/5">
          <span className="text-lg">🧠</span>
        </div>
      </div>

      <p className="font-mono text-white/40 text-xs leading-relaxed">
        Agents write structured facts to a local knowledge graph stored in
        SQLite. Before each reply, relevant facts are queried and injected into
        the prompt — giving your agent long-term memory without ballooning the
        context window.
      </p>

      <div className="flex flex-col gap-2">
        <div className="font-mono text-xs text-white/20 mb-1">
          → facts_for_prompt(&quot;project setup&quot;)
        </div>
        {facts.map((fact, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-mono text-xs text-[#3DBE8A]/60 flex-shrink-0 mt-0.5">
              ▸
            </span>
            <span className="font-mono text-xs text-white/50 leading-snug">
              {fact}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <span className="font-mono font-bold text-2xl text-[#3DBE8A]">
          SQLite
        </span>
        <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
          local · semantic search
        </span>
      </div>
    </div>
  );
}

/* ── Context Window Card ── */
const CTX_SEGMENTS = [
  {
    label: "system",
    tokens: "1.2k",
    barClass: "bg-[#22d3c8]/30",
    textClass: "text-[#22d3c8]/80",
  },
  {
    label: "history",
    tokens: "11.4k",
    barClass: "bg-[#17C4D6]/30",
    textClass: "text-[#17C4D6]/80",
  },
  {
    label: "KG facts",
    tokens: "1.6k",
    barClass: "bg-[#3DBE8A]/30",
    textClass: "text-[#3DBE8A]/80",
  },
];

function ContextWindowCard() {
  const budget = 128_000;
  const used = 14_200;
  const pct = Math.round((used / budget) * 100); // ≈ 11

  return (
    <div className="feature-card bg-[#080c10] p-7 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-white/25 mb-2">
            04 / CONTEXT OPTIMIZATION
          </div>
          <h3 className="font-mono font-bold text-white/85 text-lg leading-tight">
            Context Window
            <br />
            Budget Control
          </h3>
        </div>
        <div className="w-10 h-10 flex items-center justify-center border border-[#F5C118]/25 bg-[#F5C118]/5">
          <span className="text-lg">🗜️</span>
        </div>
      </div>

      <p className="font-mono text-white/40 text-xs leading-relaxed">
        Every LLM call is token-budgeted. The engine estimates token cost per
        message, always preserves the system prompt and the most recent turns,
        and silently trims old history to stay within the configured limit —
        minimizing API costs while keeping conversations coherent.
      </p>

      <div className="code-block px-4 py-3 flex flex-col gap-3">
        <div className="flex justify-between font-mono text-xs text-white/30">
          <span>context budget</span>
          <span>
            {used.toLocaleString()} / {(budget / 1000).toFixed(0)}k tokens
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded overflow-hidden">
          <div
            className="h-full rounded w-[11%] bg-gradient-to-r from-[#22d3c8] to-[#17C4D6]"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CTX_SEGMENTS.map((seg) => (
            <div key={seg.label} className="flex flex-col gap-0.5">
              <div className={`h-0.5 rounded ${seg.barClass}`} />
              <div className={`font-mono text-xs ${seg.textClass}`}>
                {seg.tokens}
              </div>
              <div className="font-mono text-xs text-white/25">{seg.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-white/[0.06]">
        <span className="font-mono font-bold text-2xl text-[#F5C118]">
          {pct}%
        </span>
        <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
          budget used · auto-trim active
        </span>
      </div>
    </div>
  );
}

/* ── Parallel Agents Benchmark ── */
const BENCHMARK_ROWS = [
  { concurrency: 1,  throughput: 1.0,  avgMs: 1820 },
  { concurrency: 2,  throughput: 1.97, avgMs: 924  },
  { concurrency: 4,  throughput: 3.88, avgMs: 469  },
  { concurrency: 8,  throughput: 7.71, avgMs: 236  },
  { concurrency: 16, throughput: 15.1, avgMs: 121  },
  { concurrency: 32, throughput: 28.9, avgMs:  63  },
];

const TASK_POOL = [
  "web_search", "summarize", "code_review", "translate",
  "analyze_data", "generate_img", "fact_check", "embed_docs",
  "run_tool", "parse_pdf", "query_db", "call_api",
];

const NUM_SLOTS = 8;

type AgentSlot = { id: number; task: string; progress: number };

function ParallelAgentsBenchmark() {
  const [slots, setSlots] = useState<AgentSlot[]>(() =>
    Array.from({ length: NUM_SLOTS }, (_, i) => ({
      id: i,
      task: TASK_POOL[i % TASK_POOL.length],
      progress: Math.floor(Math.random() * 80),
    }))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setSlots((prev) =>
        prev.map((slot) => {
          const next = slot.progress + Math.random() * 14 + 5;
          if (next >= 100) {
            return {
              ...slot,
              progress: 0,
              task: TASK_POOL[Math.floor(Math.random() * TASK_POOL.length)],
            };
          }
          return { ...slot, progress: next };
        })
      );
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="border border-white/[0.08] bg-[#0d1117] p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="section-label">Parallel Agent Benchmark</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22d3c8] animate-subtle-pulse" />
            <span className="font-mono text-xs text-white/25 tracking-widest">
              SIMULATING
            </span>
          </div>
          <span className="font-mono text-xs text-white/20 border border-white/[0.08] px-2 py-0.5">
            {NUM_SLOTS} agents · parallel
          </span>
        </div>
      </div>

      {/* Live agent slots */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="bg-[#080c10] border border-white/[0.06] p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-white/30">
                agent_{String(slot.id).padStart(2, "0")}
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-[#22d3c8]/70 animate-pulse" />
            </div>
            <div className="font-mono text-xs text-[#22d3c8]/70 mb-2 truncate">
              {slot.task}
            </div>
            <div className="h-0.5 bg-white/[0.06] rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#22d3c8]/50 to-[#22d3c8] transition-all duration-150 rounded"
                style={{ width: `${slot.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Scaling table */}
      <div className="border border-white/[0.06] overflow-hidden mb-6">
        <div className="grid grid-cols-3 px-4 py-2 bg-[#080c10] border-b border-white/[0.06]">
          <span className="font-mono text-xs text-white/25 uppercase tracking-widest">
            Concurrency
          </span>
          <span className="font-mono text-xs text-white/25 uppercase tracking-widest text-center">
            Throughput
          </span>
          <span className="font-mono text-xs text-white/25 uppercase tracking-widest text-right">
            Avg latency
          </span>
        </div>
        {BENCHMARK_ROWS.map((row) => {
          const isHighlighted = row.concurrency === NUM_SLOTS;
          return (
            <div
              key={row.concurrency}
              className={`grid grid-cols-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0 transition-colors ${
                isHighlighted ? "bg-[#22d3c8]/[0.04]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white/60 w-8">
                  {row.concurrency}×
                </span>
                <div
                  className="h-1 rounded bg-[#22d3c8]/20"
                  style={{ width: `${(row.concurrency / 32) * 72}px` }}
                >
                  <div
                    className="h-full rounded bg-[#22d3c8]/55"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div className="text-center">
                <span
                  className={`font-mono text-xs font-bold ${
                    isHighlighted ? "text-[#22d3c8]" : "text-white/50"
                  }`}
                >
                  {row.throughput.toFixed(1)}×
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs text-white/40">
                  {row.avgMs}ms
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-6 pt-4 border-t border-white/[0.06]">
        <div>
          <span className="font-mono font-bold text-2xl text-[#22d3c8]">
            32
          </span>
          <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
            max parallel agents
          </span>
        </div>
        <div>
          <span className="font-mono font-bold text-2xl text-[#4ade80]">
            28.9×
          </span>
          <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
            peak throughput
          </span>
        </div>
        <div>
          <span className="font-mono font-bold text-2xl text-white/55">
            ~linear
          </span>
          <span className="font-mono text-xs text-white/25 ml-2 uppercase tracking-widest">
            scaling curve
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Animated Request Lifecycle ── */
function RequestLifecycle() {
  const [active, setActive] = useState(-1);
  const [done, setDone] = useState<boolean[]>(FLOW_STEPS.map(() => false));

  useEffect(() => {
    let step = 0;

    const advance = () => {
      setActive(step);
      setDone((prev) => {
        const next = [...prev];
        if (step > 0) next[step - 1] = true;
        return next;
      });

      step++;

      if (step < FLOW_STEPS.length) {
        timer = setTimeout(advance, 650);
      } else {
        setTimeout(() => {
          setDone(FLOW_STEPS.map(() => true));
          setTimeout(reset, 1200);
        }, 650);
      }
    };

    const reset = () => {
      step = 0;
      setActive(-1);
      setDone(FLOW_STEPS.map(() => false));
      timer = setTimeout(advance, 400);
    };

    let timer = setTimeout(advance, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="border border-white/[0.08] bg-[#0d1117] p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="section-label">Request Lifecycle</div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22d3c8] animate-subtle-pulse" />
          <span className="font-mono text-xs text-white/25 tracking-widest">
            LIVE
          </span>
        </div>
      </div>

      {/* pt-5 + -mt-5 gives the ping ring room above the clip boundary */}
      <div className="overflow-x-auto pt-5 -mt-5 pb-2">
        <div className="flex items-start gap-0">
          {FLOW_STEPS.map((step, i) => {
            const isActive = active === i;
            const isDone = done[i];

            const dotClass = isDone
              ? "bg-[#22d3c8]/45"
              : isActive
                ? "bg-[#22d3c8] scale-125"
                : "bg-white/[0.12]";

            const labelClass = isDone
              ? "text-[#22d3c8]/45"
              : isActive
                ? step.accent
                  ? "text-[#22d3c8]"
                  : "text-white/85"
                : "text-white/20";

            const fillClass = isDone
              ? "w-full duration-300"
              : isActive
                ? "w-full duration-500"
                : "w-0 duration-500";

            return (
              <div key={i} className="flex items-start flex-shrink-0">
                {/* Step node + label */}
                <div className="flex flex-col items-center min-w-[110px]">
                  <div className="relative flex items-center justify-center w-5 h-5 mb-3">
                    {isActive && (
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-[#22d3c8]/50 animate-ping" />
                    )}
                    <div
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${dotClass}`}
                    />
                  </div>
                  <div
                    className={`font-mono text-xs leading-snug text-center px-1 max-w-[96px] transition-all duration-300 ${labelClass} ${isActive ? "-translate-y-px" : ""}`}
                  >
                    {step.label}
                  </div>
                </div>

                {/* Connector */}
                {i < FLOW_STEPS.length - 1 && (
                  <div className="relative flex-shrink-0 mx-1 mt-[9px] w-7">
                    <div className="h-px w-full bg-white/[0.08]" />
                    <div
                      className={`absolute top-0 left-0 h-px bg-gradient-to-r from-[#22d3c8]/60 to-[#22d3c8]/20 transition-all ease-out ${fillClass}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
