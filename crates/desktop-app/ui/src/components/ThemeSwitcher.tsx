import { Monitor, Sun, Moon, type LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { cn } from '@/lib/cn'

const OPTIONS: Array<{ value: Theme; label: string; hint: string; Icon: LucideIcon }> = [
  { value: 'auto', label: 'Auto', hint: 'Follow system', Icon: Monitor },
  { value: 'light', label: 'Light', hint: 'Always light', Icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Always dark', Icon: Moon },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <GlassPanel variant="body" className="theme-switcher">
      <div className="theme-switcher__head">
        <h2 className="theme-switcher__title">Appearance</h2>
        <p className="theme-switcher__hint">
          Auto follows your system's <span className="mono">prefers-color-scheme</span>.
          Choose Light or Dark to override.
        </p>
      </div>
      <div className="theme-switcher__options" role="radiogroup">
        {OPTIONS.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={cn(
              'theme-option',
              theme === value && 'theme-option--active',
            )}
            onClick={() => setTheme(value)}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span className="theme-option__label">{label}</span>
            <span className="theme-option__hint">{hint}</span>
          </button>
        ))}
      </div>
    </GlassPanel>
  )
}
