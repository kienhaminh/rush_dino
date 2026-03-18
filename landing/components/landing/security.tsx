const POLICY_YAML = `version: "1"
sandbox:
  filesystem:
    default: deny
    allow:
      - path: ~/.rushdino
        mode: read-write
      - path: /tmp/workspace
        mode: read-write

  process:
    allow_privileged: false
    max_concurrent: 4
    deny_commands: [curl, wget, nc]

  network:
    default: deny
    on_block: prompt          # pause → ask human
    allow:
      - host: "*.anthropic.com"
        port: 443

  inference:
    route_via: gateway:8080
    strip_agent_credentials: true`;

const LAYERS = [
  {
    id: "filesystem",
    label: "Filesystem",
    icon: "📁",
    colorClass: "text-[#22d3c8]",
    borderClass: "border-[#22d3c8]/20",
    bgClass: "bg-[#22d3c8]/5",
    description: "Per-path allow/deny rules with read-only or read-write modes. Default-deny keeps the entire filesystem locked unless explicitly opened.",
    rules: [
      { text: "~/.rushdino  read-write", allowed: true  },
      { text: "/tmp/workspace  read-write", allowed: true  },
      { text: "/etc  blocked", allowed: false },
      { text: "/home/*  blocked", allowed: false },
    ],
  },
  {
    id: "process",
    label: "Process",
    icon: "⚙️",
    colorClass: "text-[#F5C118]",
    borderClass: "border-[#F5C118]/20",
    bgClass: "bg-[#F5C118]/5",
    description: "Blocks privileged execution, caps concurrent subprocesses, and denies specific commands like curl, wget, or nc by name.",
    rules: [
      { text: "allow_privileged: false", allowed: true  },
      { text: "max_concurrent: 4", allowed: true  },
      { text: "curl  denied", allowed: false },
      { text: "wget  denied", allowed: false },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: "🌐",
    colorClass: "text-[#3DBE8A]",
    borderClass: "border-[#3DBE8A]/20",
    bgClass: "bg-[#3DBE8A]/5",
    description: "Glob host allow-list with per-rule method and path scoping. Blocked requests can prompt a human for approval or hard-stop the agent.",
    rules: [
      { text: "*.anthropic.com:443  allow", allowed: true  },
      { text: "on_block: prompt → human", allowed: true  },
      { text: "arbitrary outbound  deny", allowed: false },
      { text: "data exfiltration  blocked", allowed: false },
    ],
  },
  {
    id: "inference",
    label: "Inference",
    icon: "🧠",
    colorClass: "text-[#17C4D6]",
    borderClass: "border-[#17C4D6]/20",
    bgClass: "bg-[#17C4D6]/5",
    description: "Routes all LLM calls through an internal gateway. Agent credentials are stripped before forwarding — no raw API keys ever leave the host.",
    rules: [
      { text: "route_via: gateway:8080", allowed: true  },
      { text: "strip_agent_credentials: true", allowed: true  },
      { text: "raw API keys  never exposed", allowed: true  },
      { text: "direct model access  denied", allowed: false },
    ],
  },
];

const AUDIT_ROWS = [
  { cat: "network",     decision: "allow",   detail: "api.anthropic.com:443 POST /v1/messages",  ts: "14:02:01" },
  { cat: "filesystem",  decision: "allow",   detail: "~/.rushdino/memory/notes.md read",         ts: "14:02:01" },
  { cat: "network",     decision: "pending", detail: "api.github.com:443 POST /repos — awaiting approval", ts: "14:02:03" },
  { cat: "process",     decision: "deny",    detail: "curl attempted — command in deny list",    ts: "14:02:04" },
  { cat: "inference",   decision: "allow",   detail: "routed via gateway:8080 credentials stripped", ts: "14:02:05" },
];

const DECISION_COLOR: Record<string, string> = {
  allow:   "text-[#4ade80]",
  deny:    "text-[#f87171]",
  pending: "text-[#F5C118]",
};
const DECISION_BG: Record<string, string> = {
  allow:   "bg-[#4ade80]/10 border-[#4ade80]/20",
  deny:    "bg-[#f87171]/10 border-[#f87171]/20",
  pending: "bg-[#F5C118]/10 border-[#F5C118]/20",
};

export function Security() {
  return (
    <section id="security" className="relative py-32 border-t border-white/[0.06]">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_40%_at_20%_60%,rgba(34,211,200,0.03)_0%,transparent_60%)]" />

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-20">
          <div className="section-label mb-4 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-[#22d3c8]" />
            Security & Sandbox
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-mono font-bold text-[2.4rem] lg:text-[3.2rem] text-white/90 leading-none">
              AGENTS RUN IN
              <br />
              <span className="text-[#22d3c8]">ISOLATION.</span>
              <br />
              <span className="text-white/30">YOU STAY IN CONTROL.</span>
            </h2>
            <p className="lg:max-w-xs font-mono text-white/40 text-sm leading-relaxed">
              Every agent operates inside a 4-layer sandbox. Filesystem,
              process, network, and inference access are all policy-gated,
              audited, and reversible.
            </p>
          </div>
          <div className="separator-teal mt-6 opacity-60" />
        </div>

        {/* 4-layer sandbox cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {LAYERS.map((layer) => (
            <div key={layer.id} className={`feature-card bg-[#080c10] p-6 flex flex-col gap-4 ${layer.borderClass}`}>
              <div className="flex items-center justify-between">
                <div className={`w-9 h-9 flex items-center justify-center border rounded-sm text-base ${layer.borderClass} ${layer.bgClass}`}>
                  {layer.icon}
                </div>
                <span className={`font-mono text-xs font-bold tracking-widest ${layer.colorClass}`}>
                  {layer.label.toUpperCase()}
                </span>
              </div>

              <p className="font-mono text-white/40 text-xs leading-relaxed">
                {layer.description}
              </p>

              <div className="flex flex-col gap-1 mt-auto">
                {layer.rules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-xs flex-shrink-0 ${rule.allowed ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                      {rule.allowed ? "✓" : "✗"}
                    </span>
                    <span className="font-mono text-xs text-white/35 leading-snug">{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom row: policy YAML + audit log + taint */}
        <div className="grid lg:grid-cols-[1fr_1fr_auto] gap-4">

          {/* Policy YAML snippet */}
          <div className="border border-white/[0.08] bg-[#0d1117]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <span className="section-label">sandbox.yaml</span>
              <span className="font-mono text-xs text-white/20">per-agent policy file</span>
            </div>
            <pre className="p-5 font-mono text-xs text-white/55 leading-relaxed overflow-x-auto">
              {POLICY_YAML.split("\n").map((line, i) => {
                const isKey     = /^\s*(version|sandbox|filesystem|process|network|inference|providers):/.test(line);
                const isValue   = /:\s*(deny|allow|prompt|true|false|\d+)/.test(line);
                const isComment = line.trim().startsWith("#");
                const isString  = /:\s*"/.test(line);
                return (
                  <span key={i} className="block">
                    {isComment
                      ? <span className="text-white/25">{line}</span>
                      : isKey
                      ? <span className="text-[#22d3c8]/70">{line}</span>
                      : isString
                      ? <span className="text-[#3DBE8A]/70">{line}</span>
                      : isValue
                      ? <span className="text-[#F5C118]/70">{line}</span>
                      : <span>{line}</span>
                    }
                  </span>
                );
              })}
            </pre>
          </div>

          {/* Audit log */}
          <div className="border border-white/[0.08] bg-[#0d1117]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <span className="section-label">Audit Log</span>
              <span className="font-mono text-xs text-white/20">sandbox_audit_log</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {AUDIT_ROWS.map((row, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="font-mono text-xs text-white/20 flex-shrink-0 pt-0.5">{row.ts}</span>
                  <span className={`font-mono text-xs border rounded px-1.5 py-0.5 flex-shrink-0 ${DECISION_BG[row.decision]} ${DECISION_COLOR[row.decision]}`}>
                    {row.decision}
                  </span>
                  <span className="font-mono text-xs text-white/40 leading-snug">{row.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Taint levels */}
          <div className="border border-white/[0.08] bg-[#0d1117] min-w-[200px]">
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <span className="section-label">Taint Tracking</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="font-mono text-xs text-white/30 leading-relaxed mb-1">
                Data flowing through the agent is annotated with a taint level. Prompt-injection signals escalate automatically.
              </p>
              {[
                { level: "Clean",      color: "text-[#4ade80]",  bar: "bg-[#4ade80]",  w: "w-1/4",  desc: "trusted internal" },
                { level: "UserInput",  color: "text-[#22d3c8]",  bar: "bg-[#22d3c8]",  w: "w-2/4",  desc: "user-supplied" },
                { level: "Suspicious", color: "text-[#F5C118]",  bar: "bg-[#F5C118]",  w: "w-3/4",  desc: "partial injection" },
                { level: "Malicious",  color: "text-[#f87171]",  bar: "bg-[#f87171]",  w: "w-full", desc: "policy violation" },
              ].map((t) => (
                <div key={t.level} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs font-bold ${t.color}`}>{t.level}</span>
                    <span className="font-mono text-xs text-white/20">{t.desc}</span>
                  </div>
                  <div className="h-0.5 bg-white/[0.06] rounded overflow-hidden">
                    <div className={`h-full rounded ${t.bar} ${t.w}`} />
                  </div>
                </div>
              ))}
              <div className="mt-2 pt-3 border-t border-white/[0.06]">
                <div className="font-mono text-xs text-white/20 leading-relaxed">
                  Taint propagates on combination — max level wins. Malicious data blocks tool execution.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Human approval callout */}
        <div className="mt-4 border border-[#F5C118]/20 bg-[#F5C118]/[0.03] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center border border-[#F5C118]/25 bg-[#F5C118]/5 text-xl">
            🔔
          </div>
          <div className="flex-1">
            <div className="font-mono font-bold text-sm text-[#F5C118] mb-1">Human Approval Gate</div>
            <p className="font-mono text-xs text-white/40 leading-relaxed">
              When a network request matches <span className="text-white/65">on_block: prompt</span>, the agent pauses and surfaces a real-time approval request to you. You approve or deny — the agent only proceeds on your explicit decision. Requests time out automatically if unanswered.
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col gap-2 sm:items-end">
            <span className="font-mono text-xs border border-[#4ade80]/30 text-[#4ade80] px-3 py-1">APPROVE</span>
            <span className="font-mono text-xs border border-[#f87171]/30 text-[#f87171] px-3 py-1">DENY</span>
          </div>
        </div>
      </div>
    </section>
  );
}
