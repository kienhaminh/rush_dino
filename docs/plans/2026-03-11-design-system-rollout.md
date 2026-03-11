# Design System Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the RushDino terminal/mission-control design system (JetBrains Mono, teal #22d3c8, dark bg scale) consistently across the entire frontend.

**Architecture:** Three-layer rollout — (1) global tokens in `globals.css` + `tailwind.config.js`, (2) shared UI components (Button, Badge, Card, Sidebar), (3) every page updated to use design-system classes instead of hardcoded Tailwind color utilities.

**Tech Stack:** React 18, Tailwind CSS, shadcn/ui (class-variance-authority), lucide-react, JetBrains Mono (Google Fonts)

---

## Design System Reference

### Color tokens (HSL for CSS variables)
```
--background:    220 28% 7%       (#0d1117 - surface, main app bg)
--card:          217 31% 10%      (#111820 - card bg)
--card-elevated: 218 29% 12%      (#161e28 - elevated card)
--primary:       176 72% 48%      (#22d3c8 - teal accent)
--primary-foreground: 220 33% 5% (#080c10 - text on teal)

Semantic (add as CSS vars):
--ds-success:    142 69% 58%      (#4ade80)
--ds-warning:    38 92% 50%       (#f59e0b)
--ds-error:      0 91% 71%        (#f87171)
--ds-info:       213 93% 68%      (#60a5fa)
```

### Tailwind teal scale (add to tailwind.config.js)
```js
teal: {
  950: '#0a2e2c',
  800: '#0e7a72',
  600: '#0ea898',
  400: '#22d3c8',  // primary
  300: '#67e8e3',
  200: '#a5f3ef',
}
```

### Typography
- Single font everywhere: `'JetBrains Mono', ui-monospace, monospace`
- Replace `font-family: 'IBM Plex Sans'` in body
- Remove Space Grotesk from tailwind config

### Status color mapping (old → new)
```
emerald-500/600 → text-[#4ade80] or ds-success
amber-500/600   → text-[#f59e0b] or ds-warning
rose-500        → text-[#f87171] or ds-error
blue-500        → text-[#60a5fa] or ds-info
```

---

## Task 1: Global token foundation

**Files:**
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/tailwind.config.js`

**Step 1: Update globals.css**

Replace the entire file content with:

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
  color: hsl(var(--foreground));
  background-color: hsl(var(--background));
}

body {
  margin: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  min-height: 100vh;
}

* { box-sizing: border-box; }

/* View-transition theme-switch animation */
::view-transition-old(root),
::view-transition-new(root) { animation: none; mix-blend-mode: normal; }

html.theme-transition::view-transition-old(root) { z-index: 1; }
html.theme-transition::view-transition-new(root) {
  z-index: 9999;
  animation: theme-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes theme-enter {
  from { clip-path: circle(0% at var(--theme-switch-x, 50%) var(--theme-switch-y, 50%)); }
  to   { clip-path: circle(150% at var(--theme-switch-x, 50%) var(--theme-switch-y, 50%)); }
}

@layer base {
  :root {
    /* Light theme (fallback) */
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 176 72% 48%;
    --primary-foreground: 220 33% 5%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 176 72% 48%;
    --accent-foreground: 220 33% 5%;
    --destructive: 0 91% 71%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 92%;
    --input: 0 0% 91%;
    --ring: 176 72% 48%;
    --radius: 0.625rem;
    /* Semantic */
    --ds-success: 142 69% 58%;
    --ds-warning: 38 92% 50%;
    --ds-error: 0 91% 71%;
    --ds-info: 213 93% 68%;
  }

  .dark {
    --background: 220 28% 7%;
    --foreground: 0 0% 92%;
    --card: 217 31% 10%;
    --card-foreground: 0 0% 92%;
    --popover: 217 31% 10%;
    --popover-foreground: 0 0% 92%;
    --primary: 176 72% 48%;
    --primary-foreground: 220 33% 5%;
    --secondary: 218 29% 12%;
    --secondary-foreground: 0 0% 92%;
    --muted: 218 29% 12%;
    --muted-foreground: 0 0% 55%;
    --accent: 176 25% 14%;
    --accent-foreground: 176 72% 48%;
    --destructive: 0 91% 71%;
    --destructive-foreground: 0 0% 98%;
    --border: 217 25% 14%;
    --input: 217 25% 14%;
    --ring: 176 72% 48%;
    /* Semantic */
    --ds-success: 142 69% 58%;
    --ds-warning: 38 92% 50%;
    --ds-error: 0 91% 71%;
    --ds-info: 213 93% 68%;
  }
}
```

**Step 2: Update tailwind.config.js**

Replace with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        body: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        teal: {
          950: '#0a2e2c',
          800: '#0e7a72',
          600: '#0ea898',
          400: '#22d3c8',
          300: '#67e8e3',
          200: '#a5f3ef',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        success: 'hsl(var(--ds-success))',
        warning: 'hsl(var(--ds-warning))',
        error: 'hsl(var(--ds-error))',
        info: 'hsl(var(--ds-info))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 6px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

**Step 3: Verify build compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**

```bash
git add frontend/src/styles/globals.css frontend/tailwind.config.js
git commit -m "feat: apply design system global tokens — JetBrains Mono + teal primary + dark bg scale"
```

---

## Task 2: Update shadcn Button component

**Files:**
- Modify: `frontend/src/components/ui/button.tsx`

**Step 1: Replace CVA variants to use teal primary**

The current button uses neutral grays for `default`. Update to use teal:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-[11px] font-semibold tracking-[0.07em] transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-teal-300',
        outline:
          'border border-primary/30 text-primary bg-transparent hover:bg-primary/6 hover:border-primary/50',
        ghost:
          'border border-border text-muted-foreground hover:bg-white/5 hover:border-white/18 hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border border-destructive/25 text-destructive bg-transparent hover:bg-destructive/8 hover:border-destructive/45',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 rounded-[10px]',
        sm: 'h-7 px-3 rounded-[6px]',
        lg: 'h-11 px-6 rounded-[10px]',
        icon: 'h-9 w-9 rounded-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/ui/button.tsx
git commit -m "feat: update Button to design system — teal primary, tracking, 11px mono"
```

---

## Task 3: Update shadcn Badge component

**Files:**
- Modify: `frontend/src/components/ui/badge.tsx`

**Step 1: Replace with design-system badge variants**

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center text-[10px] font-semibold tracking-[0.09em] uppercase',
  {
    variants: {
      variant: {
        default:
          'rounded-[5px] px-2 py-0.5 bg-primary/8 text-primary border border-primary/22',
        secondary:
          'rounded-[5px] px-2 py-0.5 bg-white/4 text-white/35 border border-white/10',
        destructive:
          'rounded-[5px] px-2 py-0.5 bg-destructive/8 text-destructive border border-destructive/22',
        outline:
          'rounded-[5px] px-2 py-0.5 border border-border text-muted-foreground',
        success:
          'rounded-[5px] px-2 py-0.5 bg-success/8 text-success border border-success/22',
        warning:
          'rounded-[5px] px-2 py-0.5 bg-warning/8 text-warning border border-warning/22',
        info:
          'rounded-[5px] px-2 py-0.5 bg-info/8 text-info border border-info/22',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/ui/badge.tsx
git commit -m "feat: update Badge to design system — teal default, semantic variants, mono caps"
```

---

## Task 4: Update shadcn Card component

**Files:**
- Modify: `frontend/src/components/ui/card.tsx`

**Step 1: Update Card to use tighter radius + border tokens**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-[14px] border border-border/70 bg-card text-card-foreground', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 p-5 pb-3', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-[13px] font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-[11px] text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

**Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/ui/card.tsx
git commit -m "feat: update Card to design system — 14px radius, tighter padding, border token"
```

---

## Task 5: Update Input, Textarea, Select components

**Files:**
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/textarea.tsx`
- Modify: `frontend/src/components/ui/select.tsx`

**Step 1: Update Input**

In `input.tsx`, find the className string and update to:
```tsx
className={cn(
  'flex h-9 w-full rounded-[10px] border border-border bg-card/50 px-3 py-1 text-[12px] font-mono placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/8 disabled:cursor-not-allowed disabled:opacity-40 transition-colors',
  className
)}
```

**Step 2: Update Textarea**

In `textarea.tsx`, find the className and update to:
```tsx
className={cn(
  'flex min-h-[80px] w-full rounded-[10px] border border-border bg-card/50 px-3 py-2 text-[12px] font-mono placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/8 disabled:cursor-not-allowed disabled:opacity-40 transition-colors resize-none',
  className
)}
```

**Step 3: Commit**

```bash
git add frontend/src/components/ui/input.tsx frontend/src/components/ui/textarea.tsx
git commit -m "feat: update Input/Textarea to design system — teal focus ring, mono font"
```

---

## Task 6: Update Sidebar

**Files:**
- Modify: `frontend/src/components/sidebar/sidebar.tsx`

**Step 1: Read the current file to understand structure**

Read: `frontend/src/components/sidebar/sidebar.tsx`

**Step 2: Apply changes**

Key changes:
- Nav item active state: replace current highlight with `border-l-2 border-primary text-primary bg-primary/6`
- Inactive nav items: `text-muted-foreground hover:text-foreground hover:bg-white/5`
- Section headers: `text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase`
- Sidebar background: `bg-card border-r border-border`
- Icon colors: match text color (no separate icon color)

Read the file first, then make targeted edits to replace hardcoded colors.

**Step 3: Commit**

```bash
git add frontend/src/components/sidebar/sidebar.tsx
git commit -m "feat: update Sidebar to design system — teal active indicator, mono type"
```

---

## Task 7: Update OverviewPage

**Files:**
- Modify: `frontend/src/pages/overview/OverviewPage.tsx`

**Step 1: Read the file**

Read: `frontend/src/pages/overview/OverviewPage.tsx`

**Step 2: Replace status color classes**

Pattern replacements:
```
bg-emerald-500/10 text-emerald-600 dark:text-emerald-400  →  bg-success/10 text-success
bg-amber-500/10 text-amber-600 dark:text-amber-400        →  bg-warning/10 text-warning
bg-rose-500/10 text-rose-500                              →  bg-error/10 text-error
bg-blue-500/10 text-blue-500                              →  bg-info/10 text-info
bg-slate-500/10 text-slate-500                            →  bg-muted text-muted-foreground
border-emerald-500/30 text-emerald-*                      →  border-success/30 text-success
border-amber-500/30 text-amber-*                          →  border-warning/30 text-warning
border-rose-500/30 text-rose-*                            →  border-destructive/30 text-destructive
```

Also replace any `text-sm` with `text-[12px]` and `text-base` with `text-[13px]`.

**Step 3: Commit**

```bash
git add frontend/src/pages/overview/OverviewPage.tsx
git commit -m "feat: apply design system to OverviewPage — semantic color tokens"
```

---

## Task 8: Update ApprovalsPage

**Files:**
- Modify: `frontend/src/pages/approvals/ApprovalsPage.tsx`

**Step 1: Read the file**

Read: `frontend/src/pages/approvals/ApprovalsPage.tsx`

**Step 2: Apply same color token replacements as Task 7**

Additionally look for and replace:
- Badge variant usage: `variant="outline"` with status-specific `className` → use new `variant="success"` / `variant="warning"` / `variant="destructive"` badge variants directly

**Step 3: Commit**

```bash
git add frontend/src/pages/approvals/ApprovalsPage.tsx
git commit -m "feat: apply design system to ApprovalsPage"
```

---

## Task 9: Update DiagnosticsPage

**Files:**
- Modify: `frontend/src/pages/diagnostics/DiagnosticsPage.tsx`

**Step 1: Read the file**

Read: `frontend/src/pages/diagnostics/DiagnosticsPage.tsx`

**Step 2: Apply replacements**

- `border-destructive/30 bg-destructive/10` — keep (already uses semantic token)
- `border-amber-500/30 bg-amber-500/10` → `border-warning/30 bg-warning/10`
- Tone functions that return hardcoded emerald/amber/rose → return `text-success`, `text-warning`, `text-destructive`

**Step 3: Commit**

```bash
git add frontend/src/pages/diagnostics/DiagnosticsPage.tsx
git commit -m "feat: apply design system to DiagnosticsPage"
```

---

## Task 10: Update AgentBoardPage + NodesPage

**Files:**
- Modify: `frontend/src/pages/agent-board/AgentBoardPage.tsx`
- Modify: `frontend/src/pages/nodes/NodesPage.tsx`

**Step 1: Read both files**

Read: `frontend/src/pages/agent-board/AgentBoardPage.tsx`
Read: `frontend/src/pages/nodes/NodesPage.tsx`

**Step 2: Apply color token replacements to both files**

For AgentBoardPage, status badge mapping:
- Running/active → `variant="default"` (teal)
- Waiting → `variant="warning"`
- Error/failed → `variant="destructive"`
- Idle/done → `variant="secondary"`

For NodesPage: replace any hardcoded status colors, update input focus styles.

**Step 3: Commit**

```bash
git add frontend/src/pages/agent-board/AgentBoardPage.tsx frontend/src/pages/nodes/NodesPage.tsx
git commit -m "feat: apply design system to AgentBoardPage and NodesPage"
```

---

## Task 11: Update SoulMemoryPage + ConfigPage

**Files:**
- Modify: `frontend/src/pages/soul-memory/SoulMemoryPage.tsx`
- Modify: `frontend/src/pages/config/ConfigPage.tsx`
- Modify: `frontend/src/pages/config/ConfigSectionProfiles.tsx` (if exists)
- Modify: `frontend/src/pages/config/ConfigSectionCredentials.tsx` (if exists)
- Modify: `frontend/src/pages/config/ConfigSectionServer.tsx` (if exists)

**Step 1: Read the files**

**Step 2: Apply color token replacements**

- Replace any success/error feedback colors with semantic tokens
- Ensure `<pre>` code blocks use `font-mono` and `bg-secondary` background
- Update border classes to use `border-border` token

**Step 3: Commit**

```bash
git add frontend/src/pages/soul-memory/ frontend/src/pages/config/
git commit -m "feat: apply design system to SoulMemoryPage and ConfigPage"
```

---

## Task 12: Update LogsPage + CronPage

**Files:**
- Modify: `frontend/src/pages/logs/LogsPage.tsx`
- Modify: `frontend/src/pages/logs/LogsHeader.tsx`
- Modify: `frontend/src/pages/logs/LogsStream.tsx`
- Modify: `frontend/src/pages/cron/CronPage.tsx`
- Modify: `frontend/src/pages/cron/CronHeader.tsx`
- Modify: `frontend/src/pages/cron/CronStats.tsx`
- Modify: `frontend/src/pages/cron/CronList.tsx`
- Modify: `frontend/src/pages/cron/CronHistory.tsx`

**Step 1: Read all files in both page directories**

**Step 2: Apply changes**

LogsPage:
- `bg-rose-500 text-rose-400` → `bg-error text-error`
- `bg-emerald-500 animate-pulse` → `bg-success animate-pulse`
- Tab active state → use `text-primary border-b-2 border-primary`

CronPage:
- Replace any hardcoded status colors with semantic tokens
- Tabs styling → same as logs

**Step 3: Commit**

```bash
git add frontend/src/pages/logs/ frontend/src/pages/cron/
git commit -m "feat: apply design system to LogsPage and CronPage"
```

---

## Task 13: Update RunsRoute pages

**Files:**
- Modify: `frontend/src/pages/runs/RunsRoute.tsx`
- Modify: `frontend/src/pages/runs/RunsPage.tsx` (read to find actual file)
- Modify any sub-components in `frontend/src/pages/runs/`

**Step 1: Read all files in runs/**

```bash
ls frontend/src/pages/runs/
```

**Step 2: Apply color token replacements**

Run status mapping:
- running/active → `text-primary` / `bg-primary/10`
- completed → `text-success` / `bg-success/10`
- failed/error → `text-destructive` / `bg-destructive/10`
- pending/queued → `text-warning` / `bg-warning/10`

**Step 3: Commit**

```bash
git add frontend/src/pages/runs/
git commit -m "feat: apply design system to RunsPage"
```

---

## Task 14: Update SkillsRoute pages

**Files:**
- Modify: all files in `frontend/src/pages/skills/`

**Step 1: Read all files in skills/**

**Step 2: Apply color token replacements + update any inline color usage**

**Step 3: Commit**

```bash
git add frontend/src/pages/skills/
git commit -m "feat: apply design system to SkillsPage"
```

---

## Task 15: Update MetricsPage

**Files:**
- Modify: all files in `frontend/src/pages/metrics/`

**Step 1: Read all files in metrics/**

```bash
ls frontend/src/pages/metrics/
```

**Step 2: Apply changes**

- Replace chart colors with teal scale: primary chart = `#22d3c8`, secondary = `#0ea898`, tertiary = `#67e8e3`
- Replace emerald/amber/rose hardcodes with semantic tokens
- Ensure recharts or chart library uses `var(--primary)` / `hsl(var(--primary))`

**Step 3: Commit**

```bash
git add frontend/src/pages/metrics/
git commit -m "feat: apply design system to MetricsPage — teal chart palette"
```

---

## Task 16: Update WorkflowsPage

**Files:**
- Modify: all files in `frontend/src/pages/workflows/`

**Step 1: Read all files in workflows/**

**Step 2: Apply color token replacements**

- Workflow run status: use semantic tokens
- Editor panel: ensure monospace font via CSS variables (already set globally)
- Any hardcoded `#` hex colors → replace with CSS variable equivalents

**Step 3: Commit**

```bash
git add frontend/src/pages/workflows/
git commit -m "feat: apply design system to WorkflowsPage"
```

---

## Task 17: Update AgentsPage + all sub-components

**Files:**
- Modify: all files in `frontend/src/pages/agents/`

**Step 1: Read all files in agents/**

```bash
ls frontend/src/pages/agents/
```

**Step 2: Apply changes to each sub-component**

- Replace all hardcoded status colors with semantic tokens
- Panel switching tabs: active tab → `text-primary border-b-primary`
- Any inline `style={{ color: '...' }}` → replace with Tailwind class or CSS variable

**Step 3: Commit**

```bash
git add frontend/src/pages/agents/
git commit -m "feat: apply design system to AgentsPage and all agent sub-panels"
```

---

## Task 18: Update GatewayRoute

**Files:**
- Modify: all files in `frontend/src/pages/gateway/`
- Modify: all files in `frontend/src/pages/gateway-sessions/`

**Step 1: Read all files in gateway/**

```bash
ls frontend/src/pages/gateway/
ls frontend/src/pages/gateway-sessions/
```

**Step 2: Apply changes**

- Connection status: connected → `text-success`, degraded → `text-warning`, disconnected → `text-destructive`
- Channel type cards: use `bg-card` + `border-border` + hover `border-primary/30`
- Any hardcoded `bg-emerald/bg-amber/bg-rose` → semantic tokens

**Step 3: Commit**

```bash
git add frontend/src/pages/gateway/ frontend/src/pages/gateway-sessions/
git commit -m "feat: apply design system to GatewayRoute"
```

---

## Task 19: Update ChatPage

**Files:**
- Modify: `frontend/src/pages/chat/ChatPage.tsx`
- Modify: `frontend/src/components/workspace/conversation-timeline.tsx`
- Modify: all files in `frontend/src/components/chat/`

**Step 1: Read all relevant files**

**Step 2: Apply changes**

- Selected conversation highlight: `bg-primary/8 border-l-2 border-primary text-primary`
- Message bubbles: assistant → `bg-card border border-border`, user → `bg-primary/8 border border-primary/20`
- Streaming indicator: `text-primary animate-pulse`
- Send button: use Button `variant="default"` (already teal after Task 2)
- Input area: use updated Textarea component (already done in Task 5)

**Step 3: Commit**

```bash
git add frontend/src/pages/chat/ frontend/src/components/workspace/ frontend/src/components/chat/
git commit -m "feat: apply design system to ChatPage — teal selection, message styling"
```

---

## Task 20: Normalize SessionsPage to Tailwind

**Files:**
- Modify: `frontend/src/pages/sessions/SessionsPage.tsx`

**Context:** The sessions page was the first page enhanced with the design system, but uses CSS injection (`useEffect` + `document.createElement('style')`) and inline styles. This task normalizes it to use Tailwind classes + CSS variables like all other pages, while preserving the same visual output.

**Step 1: Read the current file**

Read: `frontend/src/pages/sessions/SessionsPage.tsx`

**Step 2: Replace inline styles with Tailwind equivalents**

Key mappings:
- `background: 'rgba(255,255,255,0.025)'` → `bg-white/[0.025]`
- `border: '1px solid rgba(255,255,255,0.07)'` → `border border-white/[0.07]`
- `color: 'rgba(255,255,255,0.92)'` → `text-foreground`
- `color: 'rgba(255,255,255,0.30)'` → `text-muted-foreground`
- Font classes: remove CSS injection, rely on global font

Keep the `SessionCard`, `Chip`, `StatCell` component structure — just normalize the styling approach.

**Step 3: Remove the `useSessionStyles` hook and CSS injection**

**Step 4: Commit**

```bash
git add frontend/src/pages/sessions/SessionsPage.tsx
git commit -m "refactor: normalize SessionsPage to Tailwind — remove CSS injection, use design tokens"
```

---

## Task 21: Update DesignSystemPage to remove CSS injection

**Files:**
- Modify: `frontend/src/pages/design-system/DesignSystemPage.tsx`

**Context:** The design system showcase page also uses CSS injection. Since global tokens are now in `globals.css`, the `DS_CSS` block only needs to contain the animation keyframes and the demo-specific classes. Remove the token variable declarations (they now come from globals.css) and the `@import` for JetBrains Mono (also in globals.css).

**Step 1: Read the file and trim the injected CSS to only animations + demo classes**

**Step 2: Commit**

```bash
git add frontend/src/pages/design-system/DesignSystemPage.tsx
git commit -m "refactor: trim DesignSystemPage CSS injection — tokens now in globals.css"
```

---

## Task 22: Final verification pass

**Step 1: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: no errors

**Step 2: Visual spot check — open these routes and verify**

- `/design-system` — all tokens rendering correctly
- `/` (chat) — teal selection highlight, monospace font
- `/sessions` — teal status dots, correct font
- `/overview` — semantic status colors (not hardcoded emerald/amber)
- `/agents` — panels using correct colors
- `/metrics` — charts using teal palette

**Step 3: Check for remaining hardcoded color classes**

```bash
grep -r "text-emerald\|text-amber\|bg-emerald\|bg-amber\|bg-rose\|text-rose\|text-blue-5\|bg-blue-5" frontend/src/pages/ --include="*.tsx" -l
```
Expected: no matches (or only legitimate uses like the design system page itself)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete design system rollout — terminal aesthetic applied globally"
```

---

## Reference: Hardcoded → Token Quick Cheatsheet

| Old class | New class |
|---|---|
| `text-emerald-400/500/600` | `text-success` |
| `bg-emerald-500/10` | `bg-success/10` |
| `border-emerald-500/30` | `border-success/30` |
| `text-amber-400/500/600` | `text-warning` |
| `bg-amber-500/10` | `bg-warning/10` |
| `border-amber-500/30` | `border-warning/30` |
| `text-rose-400/500` | `text-destructive` |
| `bg-rose-500/10` | `bg-destructive/10` |
| `text-blue-400/500` | `text-info` |
| `bg-blue-500/10` | `bg-info/10` |
| `dark:text-emerald-400` | (remove — no dark: prefix needed) |
| `font-mono` | already correct |
| `text-sm` (12px) | `text-[12px]` or keep `text-sm` |
| `rounded-xl` | `rounded-[14px]` or `rounded-lg` |
