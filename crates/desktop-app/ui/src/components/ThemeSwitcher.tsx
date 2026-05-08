import { Monitor, Sun, Moon, type LucideIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { cn } from '@/lib/cn'

const OPTIONS: Array<{ value: Theme; label: string; hint: string; Icon: LucideIcon }> = [
  { value: 'auto', label: 'Auto', hint: 'Follow system', Icon: Monitor },
  { value: 'light', label: 'Light', hint: 'Always light', Icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Always dark', Icon: Moon },
]

const OPTION_BASE =
  'flex flex-col items-start gap-1 px-4 py-3.5 border rounded-md font-sans text-left cursor-pointer transition-[background,border-color,color] duration-[140ms] ease-ease-cubic'
const OPTION_INACTIVE =
  'bg-bg-panel border-border-strong text-text-muted hover:text-text-primary hover:border-teal-line'
const OPTION_ACTIVE =
  'bg-teal-soft border-teal-line text-teal-400 shadow-[inset_0_0_0_1px_var(--ds-teal-line)]'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <GlassPanel
      variant="body"
      className="flex flex-col gap-4 px-[26px] py-[22px]"
    >
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-sans text-sm font-semibold uppercase tracking-[0.06em] text-text-primary">
          Appearance
        </h2>
        <p className="m-0 font-sans text-[12.5px] leading-[1.5] text-text-muted">
          Auto follows your system's <span className="font-mono [font-feature-settings:'tnum'_1]">prefers-color-scheme</span>.
          Choose Light or Dark to override.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2.5" role="radiogroup">
        {OPTIONS.map(({ value, label, hint, Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              className={cn(OPTION_BASE, active ? OPTION_ACTIVE : OPTION_INACTIVE)}
              onClick={() => setTheme(value)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span
                className={cn(
                  'text-[13px] font-semibold',
                  active ? 'text-teal-400' : 'text-text-primary',
                )}
              >
                {label}
              </span>
              <span className="font-mono text-[10px] tracking-[0.04em] text-text-dim">
                {hint}
              </span>
            </button>
          )
        })}
      </div>
    </GlassPanel>
  )
}
