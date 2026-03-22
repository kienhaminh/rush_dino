import type { CanvasRenderer } from './use-canvas-animation';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

interface ParticleRendererOptions {
  count?: number;
  color?: string;
}

export function createParticleRenderer(options: ParticleRendererOptions = {}): CanvasRenderer {
  const count = options.count ?? 25;
  const color = options.color ?? '99,102,241';

  let width = 0;
  let height = 0;
  let particles: Particle[] = [];

  function initParticles() {
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: 0.8 + Math.random() * 1.2,
      alpha: 0.08 + Math.random() * 0.18,
    }));
  }

  return {
    resize(w, h) {
      width = w;
      height = h;
      if (particles.length === 0) initParticles();
    },

    render(ctx, _time, dt) {
      const speed = dt * 60; // normalize to ~60fps

      for (const p of particles) {
        p.x += p.vx * speed;
        p.y += p.vy * speed;

        // Wrap around edges
        if (p.x < -2) p.x = width + 2;
        if (p.x > width + 2) p.x = -2;
        if (p.y < -2) p.y = height + 2;
        if (p.y > height + 2) p.y = -2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.alpha})`;
        ctx.fill();
      }
    },
  };
}
