const channels = [
  {
    name: "Telegram",
    description:
      "Long polling or webhook via teloxide. Real-time bot integration with full message threading.",
    color: "#229ED9",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    status: "Production",
  },
  {
    name: "Discord",
    description:
      "Gateway WebSocket via serenity. Full slash command support and rich embed responses.",
    color: "#5865F2",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.079.11 18.1.127 18.11a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
    status: "Production",
  },
  {
    name: "Slack",
    description:
      "Socket Mode WebSocket for secure, firewall-friendly connectivity. Works without public endpoints.",
    color: "#4A154B",
    textColor: "#E01E5A",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    status: "Production",
  },
  {
    name: "Web Chat",
    description:
      "React frontend with real-time WebSocket. Browser-based interface with conversation history.",
    color: "#22d3c8",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        />
      </svg>
    ),
    status: "Production",
  },
];

export function Channels() {
  return (
    <section
      id="channels"
      className="relative py-32 border-t border-white/[0.06]"
    >
      {/* Background decoration */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none"
        style={{
          background:
            "linear-gradient(to left, rgba(34, 211, 200, 0.02) 0%, transparent 100%)",
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="mb-20">
          <div className="section-label mb-4 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-[#22d3c8]" />
            Multi-Channel Gateway
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-mono font-bold text-[2.4rem] lg:text-[3.2rem] text-white/90 leading-none">
              YOUR AGENT,
              <br />
              <span className="text-[#22d3c8]">4 CHANNELS,</span>
              <br />
              ONE CODEBASE.
            </h2>
            <p className="lg:max-w-xs font-mono text-white/40 text-sm leading-relaxed">
              Deploy once. Your AI agent is live on every platform your users
              already use — simultaneously.
            </p>
          </div>
          <div className="separator-teal mt-6 opacity-60" />
        </div>

        {/* Architecture diagram */}
        <div className="mb-20">
          <ArchitectureDiagram />
        </div>

        {/* Channel cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {channels.map((channel) => (
            <ChannelCard key={channel.name} channel={channel} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── SVG layout constants ──
// viewBox: 0 0 860 256 — three balanced columns
const CH_Y = [44, 100, 156, 212] as const;
const CHANNELS = ["Telegram", "Discord", "Slack", "Web"] as const;
const PROVIDERS = ["GPT", "Claude", "Kimi", "Gemini"] as const;

const MID_Y = 128; // vertical centre
const MERGE_X = 252; // x where all branch verticals converge

// Right-angle (PCB-style) L-paths: channel right → merge column → centre → gateway
const BRANCH_PATHS = CH_Y.map(
  (y) => `M 136,${y} H ${MERGE_X} V ${MID_Y} H 300`,
);
// Straight shot: Gateway right-edge → Agent left-edge
const MAIN_PATH = `M 480,${MID_Y} H 568`;

function ArchitectureDiagram() {
  const FONT = "'JetBrains Mono', monospace";

  // Box geometry — all centred on MID_Y
  const GW = { x: 300, y: MID_Y - 38, w: 180, h: 76, cx: 390 };
  const AG = { x: 568, y: MID_Y - 60, w: 252, h: 120, cx: 694 };

  // 4 provider chips perfectly centred inside the Agent box
  const CHIP_W = 52;
  const CHIP_GAP = 4;
  const CHIP_STRIDE = CHIP_W + CHIP_GAP;
  const CHIP_X0 =
    AG.x +
    (AG.w - (PROVIDERS.length * CHIP_W + (PROVIDERS.length - 1) * CHIP_GAP)) /
      2;
  const CHIP_Y = MID_Y + 24;

  return (
    <div className="relative border border-white/[0.08] bg-[#0d1117] overflow-hidden">
      {/* Teal grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(34,211,200,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,200,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <svg viewBox="0 0 860 256" className="w-full h-auto relative">
        <defs>
          {BRANCH_PATHS.map((d, i) => (
            <path key={i} id={`bp${i}`} d={d} />
          ))}
          <path id="mp" d={MAIN_PATH} />
        </defs>

        {/* ── Channel boxes ── */}
        {CHANNELS.map((ch, i) => (
          <g key={ch}>
            <rect
              x={20}
              y={CH_Y[i] - 20}
              width={116}
              height={40}
              fill="#080c10"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1}
            />
            {/* left accent bar */}
            <rect
              x={20}
              y={CH_Y[i] - 20}
              width={3}
              height={40}
              fill="rgba(34,211,200,0.35)"
            />
            <text
              x={84}
              y={CH_Y[i] + 5}
              textAnchor="middle"
              fill="rgba(255,255,255,0.65)"
              fontSize={12}
              fontFamily={FONT}
            >
              {ch}
            </text>
          </g>
        ))}

        {/* ── Branch track lines (right-angle / PCB style) ── */}
        {BRANCH_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="rgba(34,211,200,0.18)"
            strokeWidth={1.5}
          />
        ))}

        {/* Corner dots at the horizontal→vertical bend (MERGE_X, CH_Y[i]) */}
        {CH_Y.map((y, i) => (
          <rect
            key={i}
            x={MERGE_X - 3}
            y={y - 3}
            width={6}
            height={6}
            fill="rgba(34,211,200,0.55)"
          />
        ))}
        {/* Convergence dot where all verticals meet (MERGE_X, MID_Y) */}
        <circle
          cx={MERGE_X}
          cy={MID_Y}
          r={5}
          fill="none"
          stroke="rgba(34,211,200,0.65)"
          strokeWidth={1.5}
        />
        <circle cx={MERGE_X} cy={MID_Y} r={2.5} fill="#22d3c8" opacity={0.9} />

        {/* "adapters" label */}
        <text
          x={194}
          y={MID_Y - 12}
          textAnchor="middle"
          fill="rgba(255,255,255,0.25)"
          fontSize={10}
          fontFamily={FONT}
          letterSpacing={1}
        >
          adapters
        </text>

        {/* ── Gateway box ── */}
        <rect
          x={GW.x}
          y={GW.y}
          width={GW.w}
          height={GW.h}
          fill="#081210"
          stroke="#22d3c8"
          strokeWidth={1.5}
          strokeOpacity={0.65}
        />
        {/* top accent line */}
        <line
          x1={GW.x}
          y1={GW.y}
          x2={GW.x + GW.w}
          y2={GW.y}
          stroke="#22d3c8"
          strokeWidth={2.5}
          strokeOpacity={0.8}
        />
        {/* breathing glow */}
        <rect
          x={GW.x}
          y={GW.y}
          width={GW.w}
          height={GW.h}
          fill="none"
          stroke="#22d3c8"
          strokeWidth={8}
          strokeOpacity={0.08}
        >
          <animate
            attributeName="stroke-opacity"
            values="0.08;0.22;0.08"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </rect>
        <text
          x={GW.cx}
          y={MID_Y - 7}
          textAnchor="middle"
          fill="#22d3c8"
          fontSize={15}
          fontWeight="bold"
          fontFamily={FONT}
          letterSpacing={3}
        >
          GATEWAY
        </text>
        <text
          x={GW.cx}
          y={MID_Y + 13}
          textAnchor="middle"
          fill="rgba(255,255,255,0.30)"
          fontSize={10}
          fontFamily={FONT}
        >
          ChannelAdapter trait
        </text>

        {/* ── Main path track ── */}
        <path
          d={MAIN_PATH}
          fill="none"
          stroke="rgba(34,211,200,0.22)"
          strokeWidth={1.5}
        />

        {/* Arrow tip at Agent entrance */}
        <polygon
          points={`${568},${MID_Y - 5} ${568},${MID_Y + 5} ${576},${MID_Y}`}
          fill="rgba(34,211,200,0.50)"
        />

        {/* "routes to" label */}
        <text
          x={524}
          y={MID_Y - 12}
          textAnchor="middle"
          fill="rgba(255,255,255,0.25)"
          fontSize={10}
          fontFamily={FONT}
          letterSpacing={1}
        >
          routes to
        </text>

        {/* ── Agent box ── */}
        <rect
          x={AG.x}
          y={AG.y}
          width={AG.w}
          height={AG.h}
          fill="#0d1117"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={1}
        />
        {/* top accent line */}
        <line
          x1={AG.x}
          y1={AG.y}
          x2={AG.x + AG.w}
          y2={AG.y}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={2}
        />
        <text
          x={AG.cx}
          y={MID_Y - 14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.88)"
          fontSize={15}
          fontWeight="bold"
          fontFamily={FONT}
          letterSpacing={2}
        >
          AGENT
        </text>
        <text
          x={AG.cx}
          y={MID_Y + 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.30)"
          fontSize={10}
          fontFamily={FONT}
        >
          AgentEngine
        </text>

        {/* Provider chips — evenly centred */}
        {PROVIDERS.map((p, i) => (
          <g key={p}>
            <rect
              x={CHIP_X0 + i * CHIP_STRIDE}
              y={CHIP_Y}
              width={CHIP_W}
              height={18}
              fill="rgba(34,211,200,0.04)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
            />
            <text
              x={CHIP_X0 + i * CHIP_STRIDE + CHIP_W / 2}
              y={CHIP_Y + 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.40)"
              fontSize={9}
              fontFamily={FONT}
            >
              {p}
            </text>
          </g>
        ))}

        {/* ── Animated dots: branch paths ── */}
        {BRANCH_PATHS.map((_, i) => (
          <circle key={i} r={3.5} fill="#22d3c8" opacity={0.95}>
            <animateMotion
              dur="1.7s"
              repeatCount="indefinite"
              begin={`${i * 0.38}s`}
            >
              <mpath href={`#bp${i}`} />
            </animateMotion>
          </circle>
        ))}

        {/* ── Animated dot: gateway → agent ── */}
        <circle r={4} fill="#22d3c8" opacity={1}>
          <animateMotion dur="0.68s" repeatCount="indefinite" begin="0.15s">
            <mpath href="#mp" />
          </animateMotion>
        </circle>
      </svg>
    </div>
  );
}

function ChannelCard({ channel }: { channel: (typeof channels)[0] }) {
  return (
    <div className="feature-card bg-[#080c10] p-6 flex items-start gap-5">
      {/* Icon */}
      <div
        className="channel-icon-wrapper flex-shrink-0 w-12 h-12 flex items-center justify-center border border-white/[0.08]"
        style={{ color: channel.textColor || channel.color }}
      >
        {channel.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono font-semibold text-white/85">
            {channel.name}
          </h3>
          <span className="font-mono text-xs text-[#4ade80] border border-[#4ade80]/20 px-2 py-0.5">
            {channel.status}
          </span>
        </div>
        <p className="font-mono text-white/40 text-xs leading-relaxed">
          {channel.description}
        </p>
      </div>
    </div>
  );
}
