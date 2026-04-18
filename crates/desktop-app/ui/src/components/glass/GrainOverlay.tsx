/**
 * Single fixed-position SVG noise layer over the entire window. Softens the
 * digital flatness of macOS vibrancy without being individually perceptible.
 * Mounted once at the root of AppShell.
 */
export function GrainOverlay() {
  return <div className="grain" aria-hidden />
}
