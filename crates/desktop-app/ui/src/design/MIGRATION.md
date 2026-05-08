# Tailwind Migration Playbook (Unit 1 Foundation)

This file is the playbook for **Units 2-15** migrating BEM CSS in `crates/desktop-app/ui` to Tailwind utilities. Unit 1 (this PR) only wires up the foundation — it produces **zero visual change**. Legacy CSS still wins. Do **not** start converting TSX class names until Unit 1 is merged.

## How the foundation works

- `src/design/tokens.css` — single source of truth for `--ds-*` and `--brand-*` CSS variables. Loaded **first** in `main.tsx`.
- `src/design/tailwind.css` — three `@tailwind base/components/utilities` directives only. Loaded **second**, before legacy CSS.
- `tailwind.config.js` — every utility maps to a `var(--ds-…)` so generated classes resolve to the **same color literal** the legacy CSS uses today.
- All legacy CSS files (`shell-v2.css`, `chat.css`, etc.) load **after** Tailwind, so their selectors keep winning by source-order. As Units 2-15 add Tailwind classes to JSX, they delete the matching BEM rules in the same PR — no specificity wars.

## Token → utility map

Source of truth: `tokens.css`. Use these utility names anywhere a class is needed.

| CSS variable | Tailwind class fragment(s) |
| --- | --- |
| `--ds-bg-base` | `bg-bg-base` |
| `--ds-bg-side` | `bg-bg-side` |
| `--ds-bg-main` | `bg-bg-main` |
| `--ds-bg-surface` | `bg-bg-surface` |
| `--ds-bg-card` | `bg-bg-card` |
| `--ds-bg-panel` | `bg-bg-panel` |
| `--ds-bg-elevated` | `bg-bg-elevated` |
| `--ds-bg-overlay` | `bg-bg-overlay` |
| `--ds-bg-input` | `bg-bg-input` |
| `--ds-text-primary` | `text-text-primary` |
| `--ds-text-secondary` | `text-text-secondary` |
| `--ds-text-muted` | `text-text-muted` |
| `--ds-text-dim` | `text-text-dim` |
| `--ds-text-faint` | `text-text-faint` |
| `--ds-border-subtle` | `border-border-subtle` / `divide-border-subtle` |
| `--ds-border-base` | `border-border-base` |
| `--ds-border-strong` | `border-border-strong` |
| `--ds-border-line` | `border-border-line` |
| `--ds-teal-{200,300,400,600,800,950}` | `bg-teal-400` / `text-teal-400` / `border-teal-400` / `ring-teal-400` |
| `--ds-teal-soft` | `bg-teal-soft` |
| `--ds-teal-line` | `border-teal-line` |
| `--ds-success` / `--ds-warning` / `--ds-error` / `--ds-info` / `--ds-violet` | `text-success`, `bg-warning`, `border-error`, etc. |
| `--brand-{navy,ocean,teal,cyan,mint,lime,amber,glow,ice,dark}` | `bg-brand-cyan`, `text-brand-amber`, … |
| `--ds-radius-{sm,md,lg,xl,2xl,pill}` | `rounded-sm`, `rounded-md`, `rounded-pill`, … (`rounded` alone = `md`) |
| `--ds-glow-teal` / `--ds-glow-amber` | `shadow-glow-teal`, `shadow-glow-amber` |
| `--ease-cubic` / `--ease-overshoot` | `ease-ease-cubic`, `ease-ease-overshoot` |
| `--font-sans` / `--font-mono` | `font-sans`, `font-mono` |

The brand teal scale **shadows the default Tailwind teal**. That is intentional — there is only one teal in this product.

## Dark mode pattern

Today, theme switching is done via `:root[data-theme='dark'] .x { … }` rules scattered across `theme-light.css`. The dark theme is the default (no attribute set or `data-theme='dark'`); `theme-light.css` overrides for `data-theme='light'`.

The Tailwind config uses:

```js
darkMode: ['variant', ['&:where([data-theme=dark] *)', '&:where([data-theme=dark])']],
```

So during migration, use `dark:` for **dark-mode-specific** styles and treat the un-prefixed class as the **light-mode** base:

```tsx
// before — depended on theme-light.css overriding dark
<div className="rd-card" />

// after — light is the unprefixed base, dark adds the override
<div className="bg-white text-text-primary dark:bg-bg-card dark:text-text-primary" />
```

If a token already has the same value in both themes (e.g. `--ds-teal-400`), no `dark:` variant is needed — write it once.

## When tokens are not enough — arbitrary values

For one-off `rgba(...)` values that have no token, use Tailwind's bracket syntax:

```tsx
<div className="bg-[rgb(255_255_255_/_0.06)]" />
<div className="shadow-[0_4px_20px_rgba(0,0,0,0.4)]" />
<button className="ring-[1.5px] ring-teal-400 ring-offset-2" />
```

Prefer adding a token to `tokens.css` + `tailwind.config.js` if the same arbitrary value would repeat 3+ times across the codebase. Otherwise inline-bracket is fine.

## Migration workflow per unit

1. Pick a surface (e.g. one TSX file or one logical component group).
2. `grep -n "className=" path/to/file.tsx` to inventory current classes.
3. For each `className`, locate the matching BEM rule in `src/design/*.css` (try `grep '\\.bem-name' src/design/*.css`).
4. Replace `className="bem-name"` with the equivalent Tailwind utility set in JSX.
5. **Delete** the matching BEM rule from the CSS file in the same PR. Don't leave dead CSS — it bloats the bundle and causes specificity confusion.
6. Inline `style={{}}` props convert too — turn them into utilities (use arbitrary values for non-token literals).
7. Run `pnpm typecheck && pnpm build`, then visually diff against `main` in the dev server. The unit's screenshots must match `main` exactly.

## Useful one-liners

```bash
# Find all BEM-ish class selectors in legacy CSS
grep -hn "^\s*\.[a-z][a-z0-9_-]*" src/design/*.css | head

# See which classes a TSX file uses
grep -oE 'className="[^"]+"' src/components/path/foo.tsx | sort -u

# Check that Tailwind is actually shipping a class (after `pnpm build`)
grep -o "bg-teal-400" dist/assets/index-*.css

# After a unit, confirm no orphan CSS rules remain for the converted surface
grep -rn ".rd-foo" src/design/
```

## Reminders

- Legacy CSS still wins for any selector it matches; Tailwind is just a tool the converter reaches for.
- Prefer tokens over hex literals. Reach for arbitrary values only when no token applies.
- `:focus-visible`, `::selection`, scrollbar styling, and the radial-gradient body background live in `tailwind.css` `@layer base` (moved from `tokens.css` in Unit 14). `@keyframes rd-*` are global and also live in `tailwind.css`. `tokens.css` is now token-only.
