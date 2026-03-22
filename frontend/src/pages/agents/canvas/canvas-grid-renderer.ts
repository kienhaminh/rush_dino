import type { CanvasRenderer } from './use-canvas-animation';

interface GridRendererOptions {
  spacing?: number;
  color?: string;
  baseAlpha?: number;
}

export function createGridRenderer(options: GridRendererOptions = {}): CanvasRenderer {
  const spacing = options.spacing ?? 32;
  const color = options.color ?? '99,102,241';
  const baseAlpha = options.baseAlpha ?? 0.18;

  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;

  return {
    resize(w, h) {
      width = w;
      height = h;
      centerX = w / 2;
      centerY = h / 2;
    },

    render(ctx, time) {
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let row = 0; row < rows; row++) {
        const y = row * spacing;
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;

          // Distance from center for wave effect
          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Pulse wave: radius oscillates based on distance from center
          const wave = Math.sin(time * 1.5 - dist * 0.008) * 0.5 + 0.5;
          const radius = 0.8 + wave * 0.6;
          const alpha = baseAlpha + wave * 0.08;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color},${alpha})`;
          ctx.fill();
        }
      }
    },
  };
}
