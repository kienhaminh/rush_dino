import { useEffect, useState } from 'react';

/* ─── CSS ──────────────────────────────────────────────────────────────────── */
const DS_STYLE_ID = 'ds-styles';
const DS_CSS = `
  /* ── Animations ── */
  @keyframes ds-pulse-ring {
    0%   { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  @keyframes ds-fade-up {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ds-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes ds-scan {
    0%   { transform: translateY(0); opacity: 0.4; }
    50%  { opacity: 0.08; }
    100% { transform: translateY(100%); opacity: 0; }
  }

  .ds-section { animation: ds-fade-up 0.4s ease both; }

  /* ── Swatch ── */
  .ds-swatch { transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: default; }
  .ds-swatch:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }

  /* ── Buttons ── */
  .ds-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; font-weight: 600; letter-spacing: 0.07em; cursor: pointer; transition: all 0.15s ease; white-space: nowrap; }
  .ds-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .ds-btn-primary { background: var(--ds-teal-400); color: #080c10; border: none; }
  .ds-btn-primary:hover:not(:disabled) { background: var(--ds-teal-300); }

  .ds-btn-outline { background: transparent; color: var(--ds-teal-400); border: 1px solid rgba(34,211,200,0.3); }
  .ds-btn-outline:hover:not(:disabled) { background: rgba(34,211,200,0.06); border-color: rgba(34,211,200,0.5); }

  .ds-btn-ghost { background: transparent; color: var(--ds-text-secondary); border: 1px solid var(--ds-border-base); }
  .ds-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.05); border-color: var(--ds-border-strong); color: var(--ds-text-primary); }

  .ds-btn-danger { background: transparent; color: var(--ds-error); border: 1px solid rgba(248,113,113,0.25); }
  .ds-btn-danger:hover:not(:disabled) { background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.45); }

  .ds-btn-sm { height: 28px; font-size: 10px; padding: 0 10px; border-radius: var(--ds-radius-sm); }
  .ds-btn-md { height: 34px; font-size: 11px; padding: 0 14px; border-radius: var(--ds-radius-md); }
  .ds-btn-lg { height: 42px; font-size: 12px; padding: 0 20px; border-radius: var(--ds-radius-md); }

  /* ── Status dot ── */
  .ds-dot { position: relative; display: inline-block; border-radius: 50%; flex-shrink: 0; }
  .ds-dot-ring::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: currentColor; animation: ds-pulse-ring 1.6s cubic-bezier(0,0,0.2,1) infinite; }
  .ds-dot-ring-fast::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: currentColor; animation: ds-pulse-ring 0.75s cubic-bezier(0,0,0.2,1) infinite; }

  /* ── Chip ── */
  .ds-chip { display: inline-flex; align-items: center; font-size: 10px; font-weight: 600; letter-spacing: 0.09em; padding: 2px 8px; white-space: nowrap; }

  /* ── Card ── */
  .ds-card { transition: box-shadow 0.2s ease; }
  .ds-card-hoverable:hover { box-shadow: var(--ds-glow-teal); }

  /* ── Input ── */
  .ds-input { font-family: inherit; color: var(--ds-text-primary); outline: none; width: 100%; transition: border-color 0.15s, box-shadow 0.15s; }
  .ds-input::placeholder { color: var(--ds-text-dim); }
  .ds-input:focus { border-color: rgba(34,211,200,0.45) !important; box-shadow: 0 0 0 3px rgba(34,211,200,0.08); }

  /* ── Progress bar ── */
  .ds-prog-bar { transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }

  /* ── Grid ── */
  .ds-token-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .ds-comp-row   { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

  /* ── Cursor blink for terminal effect ── */
  .ds-cursor { animation: ds-blink 1s step-end infinite; }

  /* ── Divider ── */
  .ds-divider { border: none; border-top: 1px solid var(--ds-border-subtle); margin: 0; }

  /* ── Copy hint ── */
  .ds-copy-hint { opacity: 0; transition: opacity 0.15s; font-size: 9px; letter-spacing: 0.08em; }
  .ds-swatch:hover .ds-copy-hint { opacity: 1; }
`;

function useStyles() {
  useEffect(() => {
    if (document.getElementById(DS_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = DS_STYLE_ID;
    el.textContent = DS_CSS;
    document.head.appendChild(el);
    return () => { document.getElementById(DS_STYLE_ID)?.remove(); };
  }, []);
}

/* ─── Section wrapper ─────────────────────────────────────────────────────── */
function Section({ title, subtitle, children, index = 0 }: { title: string; subtitle?: string; children: React.ReactNode; index?: number }) {
  return (
    <section className="ds-section" style={{ animationDelay: `${index * 0.06}s` }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(34,211,200,0.7)', margin: 0, textTransform: 'uppercase' }}>
            {title}
          </h2>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
        {subtitle && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '6px 0 0', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── Color swatch ────────────────────────────────────────────────────────── */
function Swatch({ name, value, token, textDark }: { name: string; value: string; token: string; textDark?: boolean }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  const text = textDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
  const textMuted = textDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';

  return (
    <button
      className="ds-swatch"
      onClick={copy}
      style={{ all: 'unset', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', display: 'block', width: '100%' }}
    >
      <div style={{ height: 64, background: value }} />
      <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>{token}</div>
        <div style={{ fontSize: 10, color: copied ? 'rgba(34,211,200,0.8)' : 'rgba(255,255,255,0.25)' }}>
          {copied ? '✓ copied' : value}
        </div>
      </div>
    </button>
  );
}

/* ─── Alpha swatch ────────────────────────────────────────────────────────── */
function AlphaSwatch({ name, token, value }: { name: string; token: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: value, border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{token}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

/* ─── Type specimen ───────────────────────────────────────────────────────── */
function TypeSpecimen({ label, size, weight, tracking, sample }: { label: string; size: number; weight: number; tracking: string; sample: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ width: 80, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(34,211,200,0.6)', letterSpacing: '0.1em' }}>{label}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{size}px · w{weight}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>{tracking}</div>
      </div>
      <div style={{ fontSize: size, fontWeight: weight, color: 'rgba(255,255,255,0.88)', letterSpacing: tracking === 'widest' ? '0.12em' : tracking === 'wider' ? '0.08em' : tracking === 'wide' ? '0.05em' : tracking === 'tight' ? '-0.02em' : 'normal', lineHeight: 1.3 }}>
        {sample}
      </div>
    </div>
  );
}

/* ─── Spacing token ───────────────────────────────────────────────────────── */
function SpacingRow({ label, token, px }: { label: string; token: string; px: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
      <div style={{ width: 60, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(34,211,200,0.6)' }}>{token}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{label} · {px}px</div>
      </div>
      <div style={{ height: 8, width: px * 2, background: 'rgba(34,211,200,0.35)', borderRadius: 2, flexShrink: 0 }} />
    </div>
  );
}

/* ─── Radius token ────────────────────────────────────────────────────────── */
function RadiusBox({ label, token, radius }: { label: string; token: string; radius: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 80, height: 80, background: 'rgba(34,211,200,0.08)', border: '1px solid rgba(34,211,200,0.25)', borderRadius: radius }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{token}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{label} · {radius}px</div>
      </div>
    </div>
  );
}

/* ─── Glow demo ───────────────────────────────────────────────────────────── */
function GlowCard({ label, token, glow, accentColor }: { label: string; token: string; glow: string; accentColor: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="ds-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, boxShadow: hovered ? glow : 'none', cursor: 'default', transition: 'box-shadow 0.25s ease' }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accentColor}15`, border: `1px solid ${accentColor}30`, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>{token}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>hover to preview</div>
    </div>
  );
}

/* ─── Status dot showcase ─────────────────────────────────────────────────── */
function StatusDotRow({ label, color, ring }: { label: string; color: string; ring?: 'normal' | 'fast' }) {
  const ringClass = ring === 'fast' ? 'ds-dot-ring-fast' : ring === 'normal' ? 'ds-dot-ring' : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className={`ds-dot ${ringClass}`} style={{ width: 8, height: 8, background: color, color }} />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>{color}</span>
    </div>
  );
}

/* ─── Progress bar showcase ───────────────────────────────────────────────── */
function ProgBar({ label, pct, gradient }: { label: string; pct: number; gradient: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div className="ds-prog-bar" style={{ height: '100%', width: `${pct}%`, background: gradient, borderRadius: 2 }} />
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */
export function DesignSystemPage() {
  useStyles();

  return (
    <div
      className="ds-root"
      style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', background: '#080c10', padding: '40px 40px 80px' }}
    >
      {/* ── Hero ── */}
      <div className="ds-section" style={{ marginBottom: 56 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(34,211,200,0.6)', marginBottom: 10, textTransform: 'uppercase' }}>
              RushDino UI
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.1 }}>
              Design System
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 10, lineHeight: 1.6, maxWidth: 480 }}>
              Terminal-grade visual language for the RushDino agent dashboard.
              Tokens, typography, and components — built on JetBrains Mono and electric teal.
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>version</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(34,211,200,0.5)' }}>1.0</div>
          </div>
        </div>

        {/* Token summary strip */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
          {[
            { label: 'Font', value: 'JetBrains Mono' },
            { label: 'Primary', value: '#22d3c8' },
            { label: 'Dark bg', value: '#080c10' },
            { label: 'Radius', value: '6–20px' },
            { label: 'Base unit', value: '4px' },
          ].map((t) => (
            <div key={t.label} style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{t.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{t.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 52 }}>

        {/* ══ COLORS ══ */}
        <Section title="Colors" subtitle="Click any swatch to copy the hex value." index={0}>
          {/* Backgrounds */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 10, textTransform: 'uppercase' }}>Backgrounds</div>
            <div className="ds-token-grid">
              <Swatch name="Base"     token="--ds-bg-base"     value="#080c10" />
              <Swatch name="Surface"  token="--ds-bg-surface"  value="#0d1117" />
              <Swatch name="Card"     token="--ds-bg-card"     value="#111820" />
              <Swatch name="Elevated" token="--ds-bg-elevated" value="#161e28" />
              <Swatch name="Overlay"  token="--ds-bg-overlay"  value="#1c2430" />
            </div>
          </div>

          {/* Teal accent */}
          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 10, textTransform: 'uppercase' }}>Teal Accent</div>
            <div className="ds-token-grid">
              <Swatch name="Teal 950" token="--ds-teal-950" value="#0a2e2c" />
              <Swatch name="Teal 800" token="--ds-teal-800" value="#0e7a72" />
              <Swatch name="Teal 600" token="--ds-teal-600" value="#0ea898" />
              <Swatch name="Teal 400 ★" token="--ds-teal-400" value="#22d3c8" textDark />
              <Swatch name="Teal 300" token="--ds-teal-300" value="#67e8e3" textDark />
              <Swatch name="Teal 200" token="--ds-teal-200" value="#a5f3ef" textDark />
            </div>
          </div>

          {/* Semantic */}
          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 10, textTransform: 'uppercase' }}>Semantic</div>
            <div className="ds-token-grid">
              <Swatch name="Success" token="--ds-success" value="#4ade80" textDark />
              <Swatch name="Warning" token="--ds-warning" value="#f59e0b" textDark />
              <Swatch name="Error"   token="--ds-error"   value="#f87171" textDark />
              <Swatch name="Info"    token="--ds-info"    value="#60a5fa" textDark />
            </div>
          </div>

          {/* Alphas */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 10, textTransform: 'uppercase' }}>Text & Border (alpha)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              <AlphaSwatch name="Text dim"       token="--ds-text-dim"       value="rgba(255,255,255,0.20)" />
              <AlphaSwatch name="Text muted"     token="--ds-text-muted"     value="rgba(255,255,255,0.40)" />
              <AlphaSwatch name="Text secondary" token="--ds-text-secondary" value="rgba(255,255,255,0.65)" />
              <AlphaSwatch name="Text primary"   token="--ds-text-primary"   value="rgba(255,255,255,0.92)" />
              <AlphaSwatch name="Border subtle"  token="--ds-border-subtle"  value="rgba(255,255,255,0.06)" />
              <AlphaSwatch name="Border base"    token="--ds-border-base"    value="rgba(255,255,255,0.10)" />
              <AlphaSwatch name="Border strong"  token="--ds-border-strong"  value="rgba(255,255,255,0.18)" />
            </div>
          </div>
        </Section>

        {/* ══ TYPOGRAPHY ══ */}
        <Section title="Typography" subtitle="JetBrains Mono — a single typeface applied at all scales." index={1}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 20px', overflow: 'hidden' }}>
            <TypeSpecimen label="display"  size={24} weight={700} tracking="tight"   sample="Agent dashboard — run #1042" />
            <TypeSpecimen label="lg"       size={18} weight={700} tracking="tight"   sample="Conversation sessions" />
            <TypeSpecimen label="md"       size={15} weight={600} tracking="normal"  sample="Session metadata and run history" />
            <TypeSpecimen label="base"     size={13} weight={400} tracking="normal"  sample="The active run completed with 41 messages exchanged." />
            <TypeSpecimen label="sm"       size={12} weight={400} tracking="normal"  sample="Last updated 2 minutes ago · gpt-4o-mini" />
            <TypeSpecimen label="xs"       size={11} weight={400} tracking="wide"    sample="7009c7ba-db76-49de-999d-4c99f64ad3ac" />
            <TypeSpecimen label="2xs"      size={10} weight={600} tracking="widest"  sample="ACTIVE · CONTEXT · RUNS · MESSAGES" />
          </div>
        </Section>

        {/* ══ SPACING ══ */}
        <Section title="Spacing" subtitle="4px base unit. Named scale from --space-1 to --space-10." index={2}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px' }}>
            {[
              { label: 'space-1', token: '--space-1', px: 4 },
              { label: 'space-2', token: '--space-2', px: 8 },
              { label: 'space-3', token: '--space-3', px: 12 },
              { label: 'space-4', token: '--space-4', px: 16 },
              { label: 'space-5', token: '--space-5', px: 20 },
              { label: 'space-6', token: '--space-6', px: 24 },
              { label: 'space-8', token: '--space-8', px: 32 },
              { label: 'space-10', token: '--space-10', px: 40 },
            ].map((s) => <SpacingRow key={s.label} {...s} />)}
          </div>
        </Section>

        {/* ══ RADIUS ══ */}
        <Section title="Border Radius" subtitle="Tight and purposeful. Chips use sm, cards use lg, modals use xl." index={3}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', padding: '24px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            <RadiusBox label="sm"  token="--ds-radius-sm" radius={6} />
            <RadiusBox label="md"  token="--ds-radius-md" radius={10} />
            <RadiusBox label="lg"  token="--ds-radius-lg" radius={14} />
            <RadiusBox label="xl"  token="--ds-radius-xl" radius={20} />
          </div>
        </Section>

        {/* ══ GLOWS ══ */}
        <Section title="Glows" subtitle="Contextual ring + shadow combinations. Applied on hover or active state." index={4}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            <GlowCard label="Teal Glow"  token="--ds-glow-teal"  glow="0 0 0 1px rgba(34,211,200,0.12), 0 4px 20px rgba(0,0,0,0.3)"   accentColor="#22d3c8" />
            <GlowCard label="Amber Glow" token="--ds-glow-amber" glow="0 0 0 1px rgba(245,158,11,0.15), 0 4px 20px rgba(0,0,0,0.3)"   accentColor="#f59e0b" />
            <GlowCard label="Error Glow" token="--ds-glow-error" glow="0 0 0 1px rgba(248,113,113,0.15), 0 4px 20px rgba(0,0,0,0.3)"  accentColor="#f87171" />
          </div>
        </Section>

        {/* ══ STATUS DOTS ══ */}
        <Section title="Status Dots" subtitle="Live animated indicators. Used alongside session and run status labels." index={5}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <StatusDotRow label="active — slow pulse ring"    color="#22d3c8" ring="normal" />
            <StatusDotRow label="awaiting — fast pulse ring"  color="#f59e0b" ring="fast"   />
            <StatusDotRow label="blocked — static"            color="#f87171" />
            <StatusDotRow label="idle — static, dim"          color="rgba(255,255,255,0.22)" />
          </div>
        </Section>

        {/* ══ BUTTONS ══ */}
        <Section title="Buttons" subtitle="Four variants × three sizes. Font-family and letter-spacing inherited from root." index={6}>
          {/* Variants */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* By variant */}
            {[
              { variant: 'Primary',     cls: 'ds-btn-primary'  },
              { variant: 'Outline',     cls: 'ds-btn-outline'  },
              { variant: 'Ghost',       cls: 'ds-btn-ghost'    },
              { variant: 'Destructive', cls: 'ds-btn-danger'   },
            ].map(({ variant, cls }) => (
              <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 90, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>{variant.toUpperCase()}</span>
                <button className={`ds-btn ${cls} ds-btn-sm`}>{variant}</button>
                <button className={`ds-btn ${cls} ds-btn-md`}>{variant}</button>
                <button className={`ds-btn ${cls} ds-btn-lg`}>{variant}</button>
                <button className={`ds-btn ${cls} ds-btn-md`} disabled>Disabled</button>
              </div>
            ))}
          </div>
        </Section>

        {/* ══ CHIPS / BADGES ══ */}
        <Section title="Chips & Badges" subtitle="Status chips, semantic labels, and count indicators." index={7}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 12, textTransform: 'uppercase' }}>Session status</div>
              <div className="ds-comp-row">
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(34,211,200,0.9)', background: 'rgba(34,211,200,0.08)', border: '1px solid rgba(34,211,200,0.22)' }}>ACTIVE</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(245,158,11,0.9)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>AWAITING</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(248,113,113,0.9)', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)' }}>BLOCKED</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>IDLE</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 12, textTransform: 'uppercase' }}>Semantic</div>
              <div className="ds-comp-row">
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(74,222,128,0.9)', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.22)' }}>SUCCESS</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(245,158,11,0.9)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>WARNING</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(248,113,113,0.9)', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)' }}>ERROR</span>
                <span className="ds-chip" style={{ borderRadius: 5, color: 'rgba(96,165,250,0.9)', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.22)' }}>INFO</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', marginBottom: 12, textTransform: 'uppercase' }}>Count indicators</div>
              <div className="ds-comp-row">
                <span className="ds-chip" style={{ borderRadius: 6, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>12 TOTAL</span>
                <span className="ds-chip" style={{ borderRadius: 6, color: 'rgba(34,211,200,0.9)', background: 'rgba(34,211,200,0.08)', border: '1px solid rgba(34,211,200,0.22)' }}>3 ACTIVE</span>
                <span className="ds-chip" style={{ borderRadius: 6, color: 'rgba(245,158,11,0.9)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>2 PENDING</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ══ PROGRESS BARS ══ */}
        <Section title="Progress Bars" subtitle="3px height. Gradient transitions from teal → amber → red as usage increases." index={8}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px' }}>
            <ProgBar label="Low usage (25%)"      pct={25}  gradient="linear-gradient(90deg,#22d3c8,#0ea5e9)" />
            <ProgBar label="Moderate usage (55%)" pct={55}  gradient="linear-gradient(90deg,#22d3c8,#0ea5e9)" />
            <ProgBar label="High usage (72%)"     pct={72}  gradient="linear-gradient(90deg,#22d3c8,#f59e0b)" />
            <ProgBar label="Critical (91%)"       pct={91}  gradient="linear-gradient(90deg,#f59e0b,#ef4444)" />
            <ProgBar label="Full (100%)"           pct={100} gradient="linear-gradient(90deg,#f59e0b,#ef4444)" />
          </div>
        </Section>

        {/* ══ INPUT ══ */}
        <Section title="Inputs" subtitle="Focus ring uses teal glow at 8% opacity. Placeholder uses text-dim." index={9}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
            <div>
              <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Default</label>
              <input className="ds-input" placeholder="Session title..." style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, height: 36, padding: '0 12px', fontSize: 12 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Error state</label>
              <input className="ds-input" defaultValue="invalid input" style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 10, height: 36, padding: '0 12px', fontSize: 12 }} />
              <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.7)', marginTop: 5 }}>This field is required</div>
            </div>
            <div>
              <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Disabled</label>
              <input className="ds-input" disabled placeholder="Read-only..." style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, height: 36, padding: '0 12px', fontSize: 12, opacity: 0.5, cursor: 'not-allowed' }} />
            </div>
          </div>
        </Section>

        {/* ══ CARDS ══ */}
        <Section title="Cards" subtitle="Three surface elevations. Hover state applies --ds-glow-teal." index={10}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {[
              { name: 'Surface',  bg: '#0d1117', token: '--ds-bg-surface'  },
              { name: 'Card',     bg: '#111820', token: '--ds-bg-card'     },
              { name: 'Elevated', bg: '#161e28', token: '--ds-bg-elevated' },
            ].map((c) => (
              <div key={c.name} className="ds-card ds-card-hoverable" style={{ background: c.bg, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px', cursor: 'default' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,211,200,0.08)', border: '1px solid rgba(34,211,200,0.15)', marginBottom: 14 }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>{c.name} card</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{c.token}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>Hover to see glow</div>
              </div>
            ))}
          </div>
        </Section>

      </div>

      {/* Footer */}
      <div style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em' }}>
          RUSHDINO DESIGN SYSTEM · v1.0
        </div>
        <div style={{ fontSize: 10, color: 'rgba(34,211,200,0.4)' }}>
          Terminal / Mission-Control
        </div>
      </div>
    </div>
  );
}

export default DesignSystemPage;
