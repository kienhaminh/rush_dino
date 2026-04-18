import { Command } from 'cmdk'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  ListTree,
  Users,
  Terminal,
  Workflow,
  Sparkles,
  Network,
  Radio,
  KeyRound,
  Sliders,
  Clock,
  Inbox,
  Gauge,
  FileText,
  Shield,
  type LucideIcon,
} from 'lucide-react'

type Entry = {
  id: string
  label: string
  hint: string
  shortcut?: string
  Icon: LucideIcon
  to: string
}

const NAVIGATE: Entry[] = [
  { id: 'n-chat', label: 'Open Chat', hint: 'workbench', Icon: MessageCircle, to: '/', shortcut: 'G C' },
  { id: 'n-sessions', label: 'Sessions', hint: 'timeline', Icon: ListTree, to: '/sessions' },
  { id: 'n-agents', label: 'Agents', hint: 'pool + focus', Icon: Users, to: '/agents' },
  { id: 'n-acp', label: 'Coding Agents', hint: 'ACP bridges', Icon: Terminal, to: '/coding-agents' },
  { id: 'n-workflows', label: 'Workflows', hint: 'kanban · board', Icon: Workflow, to: '/workflows' },
  { id: 'n-skills', label: 'Skills', hint: 'library', Icon: Sparkles, to: '/skills' },
  { id: 'n-kg', label: 'Knowledge Graph', hint: 'facts · xyflow', Icon: Network, to: '/knowledge-graph' },
  { id: 'n-channels', label: 'Channels', hint: 'telegram · discord · slack', Icon: Radio, to: '/channels' },
  { id: 'n-providers', label: 'Providers', hint: 'anthropic · openai · ollama', Icon: KeyRound, to: '/providers' },
]

const CONFIGURE: Entry[] = [
  { id: 'c-settings', label: 'Settings', hint: 'all config', Icon: Sliders, to: '/config' },
  { id: 'c-cron', label: 'Scheduled jobs', hint: 'cron', Icon: Clock, to: '/cron' },
  { id: 'c-approvals', label: 'Approvals inbox', hint: 'human loop', Icon: Inbox, to: '/approvals' },
  { id: 'c-guardrail', label: 'Guardrail', hint: 'security policies', Icon: Shield, to: '/guardrail' },
]

const OPERATE: Entry[] = [
  { id: 'o-metrics', label: 'Metrics', hint: 'tokens · runs · cost', Icon: Gauge, to: '/metrics' },
  { id: 'o-logs', label: 'Logs', hint: 'runtime · live tail', Icon: FileText, to: '/logs' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onOpenChange])

  if (!open) return null

  const go = (to: string) => {
    navigate(to)
    onOpenChange(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="palette-overlay"
      onClick={() => onOpenChange(false)}
    >
      <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" className="palette-cmdk">
          <Command.Input
            autoFocus
            placeholder="Type a command or search anything…"
            className="palette-input"
          />
          <span className="iridescent-line palette-divider" aria-hidden />
          <Command.List className="palette-list">
            <Command.Empty className="palette-empty">No matches.</Command.Empty>

            <Command.Group heading="Navigate" className="palette-group">
              {NAVIGATE.map((e) => (
                <Command.Item
                  key={e.id}
                  value={`${e.label} ${e.hint}`}
                  onSelect={() => go(e.to)}
                  className="palette-item"
                >
                  <e.Icon size={15} strokeWidth={1.6} aria-hidden />
                  <span className="palette-item__label">{e.label}</span>
                  <span className="palette-item__hint">{e.hint}</span>
                  {e.shortcut && <kbd className="palette-item__kbd">{e.shortcut}</kbd>}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Configure" className="palette-group">
              {CONFIGURE.map((e) => (
                <Command.Item
                  key={e.id}
                  value={`${e.label} ${e.hint}`}
                  onSelect={() => go(e.to)}
                  className="palette-item"
                >
                  <e.Icon size={15} strokeWidth={1.6} aria-hidden />
                  <span className="palette-item__label">{e.label}</span>
                  <span className="palette-item__hint">{e.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Operate" className="palette-group">
              {OPERATE.map((e) => (
                <Command.Item
                  key={e.id}
                  value={`${e.label} ${e.hint}`}
                  onSelect={() => go(e.to)}
                  className="palette-item"
                >
                  <e.Icon size={15} strokeWidth={1.6} aria-hidden />
                  <span className="palette-item__label">{e.label}</span>
                  <span className="palette-item__hint">{e.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
