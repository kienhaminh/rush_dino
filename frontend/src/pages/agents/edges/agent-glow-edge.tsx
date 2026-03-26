import { getBezierPath, type EdgeProps } from '@xyflow/react';

export interface GlowEdgeData {
  color?: string;
  [key: string]: unknown;
}

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

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const filterId = `glow-${id}`;
  const gradientId = `particle-gradient-${id}`;

  return (
    <>
      <defs>
        {/* Glow filter */}
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Particle gradient for the traveling dot */}
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer glow stroke */}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeOpacity={0.08}
        filter={`url(#${filterId})`}
      />

      {/* Base line */}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeOpacity={0.35}
        strokeDasharray="4 3"
      />

      {/* Animated particle dot traveling along edge */}
      <circle r="3" fill={`url(#${gradientId})`}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r="1.5" fill={color} fillOpacity="0.8">
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Second particle with offset */}
      <circle r="2.5" fill={`url(#${gradientId})`}>
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="-1.25s" />
      </circle>
      <circle r="1" fill={color} fillOpacity="0.6">
        <animateMotion dur="2.5s" repeatCount="indefinite" path={edgePath} begin="-1.25s" />
      </circle>
    </>
  );
}
