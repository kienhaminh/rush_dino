/**
 * Single fixed-position SVG noise layer over the entire window. Softens the
 * digital flatness of macOS vibrancy without being individually perceptible.
 * Mounted once at the root of AppShell.
 */
const GRAIN_DATA_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"

export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1000] opacity-[0.03] mix-blend-overlay"
      style={{ backgroundImage: GRAIN_DATA_URL }}
    />
  )
}
