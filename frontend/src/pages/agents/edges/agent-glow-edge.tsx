import { getBezierPath, type EdgeProps } from '@xyflow/react';

export interface GlowEdgeData {
  color?: string;
  [key: string]: unknown;
}

let edgeCounter = 0;

export function AgentGlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const color = (data as GlowEdgeData)?.color ?? 'rgba(99,102,241,1)';

  const [edgePath, , ] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const filterId = `glow-filter-${id}`;
  const glowGradId = `glow-grad-${id}`;
  const dashAnimClass = `dash-anim-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <>
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id={glowGradId}>
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="60%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>

        <style>{`
          @keyframes ${dashAnimClass} {
            from { stroke-dashoffset: 24; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      </defs>

      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeOpacity={0.06}
        filter={`url(#${filterId})`}
      />

      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.28}
      />

      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.55}
        strokeDasharray="6 18"
        style={{
          animation: `${dashAnimClass} 1.4s linear infinite`,
        }}
      />

      <circle r="3.5" fill={`url(#${glowGradId})`}>
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r="1.8" fill={color} fillOpacity="0.95">
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} />
      </circle>

      <circle r="2.8" fill={`url(#${glowGradId})`}>
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} begin="-0.6s" />
      </circle>
      <circle r="1.3" fill={color} fillOpacity="0.8">
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} begin="-0.6s" />
      </circle>

      <circle r="2.2" fill={`url(#${glowGradId})`}>
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} begin="-1.2s" />
      </circle>
      <circle r="1" fill={color} fillOpacity="0.65">
        <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} begin="-1.2s" />
      </circle>
    </>
  );
}
