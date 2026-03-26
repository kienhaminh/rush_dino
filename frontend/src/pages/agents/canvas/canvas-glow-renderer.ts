import type { CanvasRenderer } from './use-canvas-animation';

interface GlowRendererOptions {
  color?: string;
  pingColor?: string;
}

export function createGlowRenderer(options: GlowRendererOptions = {}): CanvasRenderer {
  const color = options.color ?? '99,102,241';
  const pingColor = options.pingColor ?? '16,185,129';

  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;

  // Ping ripple state
  let rippleAge = 0;
  const rippleCycle = 3.5; // seconds between ripples

  return {
    resize(w, h) {
      width = w;
      height = h;
      centerX = w / 2;
      centerY = h / 2;
    },

    render(ctx, time, dt) {
      // ── Core ambient glow ──
      const pulseRadius = 160 + Math.sin(time * 0.8) * 30;
      const pulseAlpha = 0.08 + Math.sin(time * 0.8) * 0.03;

      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseRadius);
      gradient.addColorStop(0, `rgba(${color},${pulseAlpha + 0.04})`);
      gradient.addColorStop(0.6, `rgba(${color},${pulseAlpha * 0.5})`);
      gradient.addColorStop(1, `rgba(${color},0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // ── Ping ripple ──
      rippleAge += dt;
      if (rippleAge > rippleCycle) rippleAge -= rippleCycle;

      const rippleProgress = rippleAge / rippleCycle;
      if (rippleProgress < 0.6) {
        const t = rippleProgress / 0.6; // normalize to 0-1
        const rippleRadius = t * 120;
        const rippleAlpha = (1 - t) * 0.15;

        ctx.beginPath();
        ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${pingColor},${rippleAlpha})`;
        ctx.lineWidth = 1.5 - t;
        ctx.stroke();
      }
    },
  };
}
