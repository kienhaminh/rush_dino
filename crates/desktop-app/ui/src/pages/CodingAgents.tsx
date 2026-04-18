import { GlassPanel } from '@/components/glass/GlassPanel'
import { PageTopbar } from '@/components/shell/PageTopbar'

export default function CodingAgents() {
  return (
    <div className="page--framed">
      <PageTopbar eyebrow="ACP" title="Coding Agents" />
      <div className="page__body">
        <GlassPanel variant="body">
          <p className="eyebrow">Paused</p>
          <h2 className="display-title" style={{ fontSize: 22 }}>
            Coding Agents integration is staged for a follow-up
          </h2>
          <p className="lede">
            The ACP routes (<span className="mono">crates/server/src/routes/acp.rs</span>)
            are written but not yet wired into <span className="mono">AppState</span>,
            so the Rust server doesn't expose them at runtime. Once the manager is on
            state, this page will list Claude Code, Codex CLI, and Gemini CLI with
            install status, active sessions, and a prompt composer.
          </p>
        </GlassPanel>
      </div>
    </div>
  )
}
