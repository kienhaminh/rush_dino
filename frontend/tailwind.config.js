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
        // ── Legacy teal scale (kept for backward compatibility) ──
        teal: {
          950: '#0a2e2c',
          800: '#0e7a72',
          600: '#0ea898',
          400: '#22d3c8',
          300: '#67e8e3',
          200: '#a5f3ef',
        },
        // ── Brand palette — extracted from RushDino logo ──
        brand: {
          navy:  'hsl(var(--brand-navy))',   // #1A3A5C — outer body silhouette
          ocean: 'hsl(var(--brand-ocean))',  // #1B70A0 — main body fill
          teal:  'hsl(var(--brand-teal))',   // #1B9DB8 — mid-tone body
          cyan:  'hsl(var(--brand-cyan))',   // #17C4D6 — speed lines & highlights
          mint:  'hsl(var(--brand-mint))',   // #3DBE8A — belly & chest
          lime:  'hsl(var(--brand-lime))',   // #82C840 — circuit patterns
          amber: 'hsl(var(--brand-amber))',  // #F5C118 — lightbulb
          glow:  'hsl(var(--brand-glow))',   // #F07830 — claw tips / warm accent
          ice:   'hsl(var(--brand-ice))',    // #E8F5FB — background hex grid
          dark:  'hsl(var(--brand-dark))',   // #1A2E44 — logotype text
        },
        // ── Semantic tokens ──
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
