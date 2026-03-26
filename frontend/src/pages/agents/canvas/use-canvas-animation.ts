import { useEffect, useRef } from 'react';

export interface CanvasRenderer {
  resize?(width: number, height: number): void;
  render(ctx: CanvasRenderingContext2D, time: number, dt: number): void;
}

interface UseCanvasAnimationOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  renderers: CanvasRenderer[];
  enabled?: boolean;
}

/**
 * Drives a requestAnimationFrame loop over a list of CanvasRenderers.
 * Handles DPR scaling, ResizeObserver, and prefers-reduced-motion.
 */
export function useCanvasAnimation({ canvasRef, renderers, enabled = true }: UseCanvasAnimationOptions) {
  const renderersRef = useRef(renderers);
  renderersRef.current = renderers;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let prevTime = 0;

    function resizeCanvas() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const r of renderersRef.current) {
        r.resize?.(rect.width, rect.height);
      }
    }

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);
    resizeCanvas();

    function frame(timestamp: number) {
      if (!ctx || !canvas) return;
      const time = timestamp / 1000;
      const dt = prevTime ? time - prevTime : 0.016;
      prevTime = time;

      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      for (const r of renderersRef.current) {
        r.render(ctx, time, dt);
      }

      if (enabled && !reducedMotion) {
        rafId = requestAnimationFrame(frame);
      }
    }

    // Always render at least one frame
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [canvasRef, enabled]);
}
