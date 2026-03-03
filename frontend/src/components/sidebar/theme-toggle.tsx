import { Monitor, Moon, Sun } from 'lucide-react';
import { useRef } from 'react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import type { ThemeMode } from '@/components/layout/theme';

// ---------------------------------------------------------------------------
// Option definition
// ---------------------------------------------------------------------------
const OPTIONS: { mode: ThemeMode; Icon: React.ElementType; label: string }[] = [
  { mode: 'light', Icon: Sun, label: 'Light' },
  { mode: 'system', Icon: Monitor, label: 'System' },
  { mode: 'dark', Icon: Moon, label: 'Dark' },
];

// ---------------------------------------------------------------------------
// ThemeToggle — compact 3-button segmented control
// Designed to sit in the sidebar footer.
// ---------------------------------------------------------------------------
interface ThemeToggleProps {
  /** When collapsed, only show the active icon (no labels). */
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { mode, setMode } = useTheme();
  const buttonRefs = useRef<Record<ThemeMode, HTMLButtonElement | null>>({
    light: null,
    system: null,
    dark: null,
  });

  if (collapsed) {
    // Collapsed: cycle through the three options on click
    const currentIndex = OPTIONS.findIndex((o) => o.mode === mode);
    const next = OPTIONS[(currentIndex + 1) % OPTIONS.length];
    const currentOption = OPTIONS[currentIndex] ?? OPTIONS[1];
    const CurrentIcon = currentOption.Icon;

    return (
      <button
        onClick={(e) => setMode(next.mode, e)}
        title={`Theme: ${currentOption.label} — click to switch to ${next.label}`}
        className={cn(
          'w-10 h-10 mx-auto flex items-center justify-center rounded-xl',
          'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          'transition-all duration-200',
        )}
      >
        <CurrentIcon size={18} />
      </button>
    );
  }

  return (
    <div
      className={cn('flex items-center gap-0.5 rounded-xl p-1', 'bg-muted ring-1 ring-border')}
      role="group"
      aria-label="Theme selection"
    >
      {OPTIONS.map(({ mode: optMode, Icon, label }) => {
        const active = mode === optMode;
        return (
          <button
            key={optMode}
            ref={(el) => {
              buttonRefs.current[optMode] = el;
            }}
            onClick={(e) => setMode(optMode, e)}
            title={label}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 flex-1 justify-center px-2 py-1.5 rounded-lg',
              'text-xs font-medium transition-all duration-200 cursor-pointer',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
