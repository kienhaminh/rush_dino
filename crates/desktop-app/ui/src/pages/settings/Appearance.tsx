import { Monitor, Sun, Moon } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { useAccentColor, type AccentColor } from '@/hooks/useAccentColor'
import { cn } from '@/lib/cn'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

/* ── Section wrapper ─────────────────────────────────────────────────── */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="ap-section">
      <div className="ap-section__head">
        <span className="ap-section__title">{title}</span>
        {hint && <span className="ap-section__hint">{hint}</span>}
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

function ThemeOption({ value, label, Icon, active, onClick }: {
  value: Theme; label: string; Icon: typeof Monitor
  active: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn('ap-theme-card', active && 'ap-theme-card--active')}
      onClick={onClick}
    >
      <div className={cn('ap-theme-card__preview', `ap-theme-card__preview--${value}`)}>
        <div className="ap-theme-card__preview-sidebar" />
        <div className="ap-theme-card__preview-body">
          <div className="ap-theme-card__preview-topbar" />
          <div className="ap-theme-card__preview-bubble" />
          <div className="ap-theme-card__preview-bubble ap-theme-card__preview-bubble--user" />
        </div>
      </div>
      <div className="ap-theme-card__foot">
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
      className={cn('ap-accent-btn', active && 'ap-accent-btn--active')}
      onClick={onClick}
      title={label}
    >
      <span className="ap-accent-btn__dot" style={{ background: swatch }} />
      <span className="ap-accent-btn__label">{label}</span>
    </button>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function SettingsAppearance() {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useAccentColor()

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Appearance"
        lede="Customise how RushDino looks on your screen."
        divider={false}
      />

      <Section title="Color scheme" hint="Auto follows your system preference.">
        <div className="ap-theme-grid">
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
        <div className="ap-accent-row">
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
