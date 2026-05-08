import { Monitor, Sun, Moon } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { useAccentColor, type AccentColor } from '@/hooks/useAccentColor'
import { cn } from '@/lib/cn'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

/* ── Section wrapper ─────────────────────────────────────────────────── */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-bg-card px-6 py-5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-sans text-[13px] font-semibold tracking-[-0.01em] text-text-primary">
          {title}
        </span>
        {hint && (
          <span className="font-sans text-xs text-text-muted">{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/* ── Theme picker ─────────────────────────────────────────────────────── */
const THEMES: Array<{ value: Theme; label: string; Icon: typeof Monitor }> = [
  { value: 'auto',  label: 'Auto',  Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun     },
  { value: 'dark',  label: 'Dark',  Icon: Moon    },
]

/* Preview palette per theme. Auto reuses the dark preview. */
type PreviewPalette = {
  shell: string
  sidebar: string
  topbar: string
  bubble: string
  bubbleUser: string
}
const DARK_PREVIEW: PreviewPalette = {
  shell: 'bg-[#0d1117]',
  sidebar: 'bg-[#0b1016] border-r border-[rgba(255,255,255,0.04)]',
  topbar: 'bg-[rgba(255,255,255,0.06)]',
  bubble: 'bg-[rgba(255,255,255,0.08)]',
  bubbleUser: 'bg-teal-400 opacity-70',
}
const PREVIEW: Record<Theme, PreviewPalette> = {
  dark: DARK_PREVIEW,
  auto: DARK_PREVIEW,
  light: {
    shell: 'bg-white',
    sidebar: 'bg-[#f4f6f9] border-r border-[rgba(0,0,0,0.06)]',
    topbar: 'bg-[rgba(0,0,0,0.05)]',
    bubble: 'bg-[rgba(0,0,0,0.07)]',
    bubbleUser: 'bg-[#0ea898] opacity-80',
  },
}

function ThemeOption({ value, label, Icon, active, onClick }: {
  value: Theme; label: string; Icon: typeof Monitor
  active: boolean; onClick: () => void
}) {
  const palette = PREVIEW[value]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className="flex cursor-pointer flex-col gap-2 rounded-md border-none bg-transparent p-0"
      onClick={onClick}
    >
      <div
        className={cn(
          'flex h-20 w-[120px] overflow-hidden rounded-md border-2',
          'transition-colors duration-[140ms] ease-ease-cubic',
          active ? 'border-teal-400' : 'border-border-base',
          palette.shell,
        )}
      >
        <div className={cn('w-[30%] flex-shrink-0', palette.sidebar)} />
        <div className="flex flex-1 flex-col gap-1 px-2 py-1.5">
          <div className={cn('mb-1 h-2 rounded-sm', palette.topbar)} />
          <div className={cn('h-2.5 w-[80%] rounded-[3px]', palette.bubble)} />
          <div className={cn('h-2.5 w-[55%] self-end rounded-[3px]', palette.bubbleUser)} />
        </div>
      </div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-0.5 font-sans text-xs',
          'transition-colors duration-[140ms] ease-ease-cubic',
          active ? 'font-medium text-text-primary' : 'text-text-secondary',
        )}
      >
        <Icon size={13} strokeWidth={1.7} />
        <span>{label}</span>
      </div>
    </button>
  )
}

/* ── Accent color picker ─────────────────────────────────────────────── */
const ACCENTS: Array<{ value: AccentColor; label: string; swatch: string }> = [
  { value: 'teal',   label: 'Teal',   swatch: '#22d3c8' },
  { value: 'violet', label: 'Violet', swatch: '#a78bfa' },
  { value: 'amber',  label: 'Amber',  swatch: '#f5c118' },
  { value: 'mint',   label: 'Mint',   swatch: '#4ade80' },
]

function AccentOption({ value: _value, label, swatch, active, onClick }: {
  value: AccentColor; label: string; swatch: string
  active: boolean; onClick: () => void
}) {
  void _value
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-md border bg-transparent px-3.5 py-2',
        'font-sans text-[13px]',
        'transition-[border-color,color,background-color] duration-[140ms] ease-ease-cubic',
        active
          ? 'border-teal-400 bg-teal-soft text-text-primary'
          : 'border-border-base text-text-secondary hover:border-border-strong hover:text-text-primary',
      )}
      onClick={onClick}
      title={label}
    >
      <span
        className="h-3 w-3 flex-shrink-0 rounded-full"
        style={{ background: swatch }}
      />
      <span className="font-medium">{label}</span>
    </button>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function SettingsAppearance() {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useAccentColor()

  return (
    <div className="flex w-full max-w-[920px] flex-col gap-5">
      <SettingsPageHeader
        title="Appearance"
        lede="Customise how RushDino looks on your screen."
        divider={false}
      />

      <Section title="Color scheme" hint="Auto follows your system preference.">
        <div className="flex gap-3">
          {THEMES.map(({ value, label, Icon }) => (
            <ThemeOption
              key={value}
              value={value}
              label={label}
              Icon={Icon}
              active={theme === value}
              onClick={() => setTheme(value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Accent color" hint="Used for highlights, active states, and send button.">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map(({ value, label, swatch }) => (
            <AccentOption
              key={value}
              value={value}
              label={label}
              swatch={swatch}
              active={accent === value}
              onClick={() => setAccent(value)}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}
