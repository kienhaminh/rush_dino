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

// Tailwind class fragments (extracted for reuse across the three Command.Group blocks).
const ITEM_CLASS = [
  'grid grid-cols-[18px_1fr_auto_auto] items-center gap-3',
  'px-3 py-[9px] rounded-md cursor-pointer',
  'text-text-muted text-[13px]',
  'transition-colors duration-[120ms] ease-ease-cubic',
  'hover:bg-teal-soft hover:text-teal-400',
  'data-[selected=true]:bg-teal-soft data-[selected=true]:text-teal-400',
].join(' ')

const ITEM_LABEL_CLASS = 'text-inherit'
const ITEM_HINT_CLASS = 'font-mono text-[11px] text-text-dim text-right'
const ITEM_KBD_CLASS =
  'font-mono text-[10px] text-text-muted border border-border-strong px-1.5 py-0.5 rounded tracking-[0.05em]'

// `[cmdk-group-heading]` is a data-attribute the cmdk library applies on the group heading
// element. We target it from the parent group via Tailwind's arbitrary descendant selector.
const GROUP_CLASS = [
  'flex flex-col gap-0.5',
  '[&_[cmdk-group-heading]]:font-mono',
  '[&_[cmdk-group-heading]]:text-[10px]',
  '[&_[cmdk-group-heading]]:tracking-[0.18em]',
  '[&_[cmdk-group-heading]]:uppercase',
  '[&_[cmdk-group-heading]]:text-text-dim',
  '[&_[cmdk-group-heading]]:font-bold',
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5',
].join(' ')

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

  const renderEntry = (e: Entry) => (
    <Command.Item
      key={e.id}
      value={`${e.label} ${e.hint}`}
      onSelect={() => go(e.to)}
      className={ITEM_CLASS}
    >
      <e.Icon size={15} strokeWidth={1.6} aria-hidden />
      <span className={ITEM_LABEL_CLASS}>{e.label}</span>
      <span className={ITEM_HINT_CLASS}>{e.hint}</span>
      {e.shortcut && <kbd className={ITEM_KBD_CLASS}>{e.shortcut}</kbd>}
    </Command.Item>
  )

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-[2000] flex items-start justify-center pt-[14vh] bg-[rgb(8_12_16_/_0.55)] backdrop-blur-[20px] backdrop-saturate-[1.3] animate-[rd-palette-in_180ms_var(--ease-cubic)]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-[min(640px,90vw)] bg-bg-panel border border-border-strong rounded-xl overflow-hidden shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] animate-[rd-palette-panel-in_220ms_var(--ease-overshoot)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" className="flex flex-col">
          <Command.Input
            autoFocus
            placeholder="Type a command or search anything…"
            className="w-full bg-transparent border-0 outline-none text-text-primary font-sans text-base tracking-[-0.01em] px-5 py-[18px] border-b border-border-line placeholder:text-text-dim"
          />
          <span className="iridescent-line" aria-hidden />
          <Command.List className="max-h-[52vh] overflow-y-auto px-2 pt-1.5 pb-2.5">
            <Command.Empty className="py-7 px-4 text-text-dim text-[13px] text-center">
              No matches.
            </Command.Empty>

            <Command.Group heading="Navigate" className={GROUP_CLASS}>
              {NAVIGATE.map(renderEntry)}
            </Command.Group>

            <Command.Group heading="Configure" className={GROUP_CLASS}>
              {CONFIGURE.map(renderEntry)}
            </Command.Group>

            <Command.Group heading="Operate" className={GROUP_CLASS}>
              {OPERATE.map(renderEntry)}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
