import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const GRIP_KEYS = ['top', 'mid', 'bot'] as const;

interface ResizeHandleProps {
  /** Current width of the panel being resized */
  panelWidth: number;
  /** Called with new width while dragging */
  onResize: (width: number) => void;
  /** Min panel width in px */
  min?: number;
  /** Max panel width in px */
  max?: number;
  /** Which side the resizable panel is on */
  side?: 'right';
}

export function ResizeHandle({ panelWidth, onResize, min = 200, max = 500, side = 'right' }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = panelWidth;
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [panelWidth],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      // Panel is on the right, so dragging left increases width
      const delta = side === 'right' ? startXRef.current - e.clientX : e.clientX - startXRef.current;
      const newWidth = Math.round(Math.min(max, Math.max(min, startWidthRef.current + delta)));
      onResize(newWidth);
    },
    [dragging, onResize, min, max, side],
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        'relative shrink-0 w-1 cursor-col-resize group z-10',
        'before:absolute before:inset-y-0 before:-left-1 before:-right-1',
      )}
    >
      {/* Visible line */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-px transition-colors duration-150',
          dragging
            ? 'bg-[hsl(var(--brand-cyan)/0.5)]'
            : 'bg-border/30 group-hover:bg-[hsl(var(--brand-cyan)/0.3)]',
        )}
      />
      {/* Center grip dots */}
      <div className={cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity duration-150',
        dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        {GRIP_KEYS.map((k) => (
          <span key={k} className="block w-[3px] h-[3px] rounded-full bg-[hsl(var(--brand-cyan)/0.5)]" />
        ))}
      </div>
    </div>
  );
}
