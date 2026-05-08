/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Use the new "selector" / "variant" strategy so [data-theme=dark] flips dark:* utilities.
  // tailwindcss 3.4.1+ supports this exact array form.
  darkMode: ['variant', ['&:where([data-theme=dark] *)', '&:where([data-theme=dark])']],
  theme: {
    extend: {
      colors: {
        // Surfaces
        'bg-base':     'var(--ds-bg-base)',
        'bg-side':     'var(--ds-bg-side)',
        'bg-main':     'var(--ds-bg-main)',
        'bg-surface':  'var(--ds-bg-surface)',
        'bg-card':     'var(--ds-bg-card)',
        'bg-panel':    'var(--ds-bg-panel)',
        'bg-elevated': 'var(--ds-bg-elevated)',
        'bg-overlay':  'var(--ds-bg-overlay)',
        'bg-input':    'var(--ds-bg-input)',
        // Text
        'text-primary':   'var(--ds-text-primary)',
        'text-secondary': 'var(--ds-text-secondary)',
        'text-muted':     'var(--ds-text-muted)',
        'text-dim':       'var(--ds-text-dim)',
        'text-faint':     'var(--ds-text-faint)',
        // Borders
        'border-subtle': 'var(--ds-border-subtle)',
        'border-base':   'var(--ds-border-base)',
        'border-strong': 'var(--ds-border-strong)',
        'border-line':   'var(--ds-border-line)',
        // Teal scale (override default Tailwind teal — these are the project's brand teals)
        teal: {
          200:  'var(--ds-teal-200)',
          300:  'var(--ds-teal-300)',
          400:  'var(--ds-teal-400)',
          600:  'var(--ds-teal-600)',
          800:  'var(--ds-teal-800)',
          950:  'var(--ds-teal-950)',
          soft: 'var(--ds-teal-soft)',
          line: 'var(--ds-teal-line)',
        },
        // Semantic
        success: 'var(--ds-success)',
        warning: 'var(--ds-warning)',
        error:   'var(--ds-error)',
        info:    'var(--ds-info)',
        violet:  'var(--ds-violet)',
        // Brand (logo extraction)
        brand: {
          navy:  'var(--brand-navy)',
          ocean: 'var(--brand-ocean)',
          teal:  'var(--brand-teal)',
          cyan:  'var(--brand-cyan)',
          mint:  'var(--brand-mint)',
          lime:  'var(--brand-lime)',
          amber: 'var(--brand-amber)',
          glow:  'var(--brand-glow)',
          ice:   'var(--brand-ice)',
          dark:  'var(--brand-dark)',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--ds-radius-md)',
        sm:   'var(--ds-radius-sm)',
        md:   'var(--ds-radius-md)',
        lg:   'var(--ds-radius-lg)',
        xl:   'var(--ds-radius-xl)',
        '2xl':'var(--ds-radius-2xl)',
        pill: 'var(--ds-radius-pill)',
      },
      boxShadow: {
        'glow-teal':  'var(--ds-glow-teal)',
        'glow-amber': 'var(--ds-glow-amber)',
      },
      transitionTimingFunction: {
        'ease-cubic':     'var(--ease-cubic)',
        'ease-overshoot': 'var(--ease-overshoot)',
      },
      keyframes: {
        // Topbar "running" dot — opacity + scale pulse, kept in sync with the
        // legacy `@keyframes pulse` definition that lived in chat.css.
        'rd-dot-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.85)' },
          '50%':      { opacity: '1',   transform: 'scale(1)' },
        },
      },
      animation: {
        'rd-dot-pulse': 'rd-dot-pulse 1.2s ease-in-out infinite',
      },
      fontFamily: {
        // Token-driven sans/mono; legacy display kept for back-compat.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
