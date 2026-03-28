import { getBezierPath, type EdgeProps } from '@xyflow/react';

export interface WorkflowFlowEdgeData {
  accentColor?: string;
  [key: string]: unknown;
}

export function WorkflowFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const accentColor = (data as WorkflowFlowEdgeData)?.accentColor ?? 'hsl(185 80% 47%)';

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const filterId = `wf-glow-${id}`;
  const gradientId = `wf-grad-${id}`;

  return (
    <>
      <defs>
        {/* Soft glow filter */}
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Radial gradient for particle glow */}
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.9" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Wide ambient glow track */}
      <path
        d={edgePath}
        fill="none"
        stroke={accentColor}
        strokeWidth={8}
        strokeOpacity={0.05}
        filter={`url(#${filterId})`}
      />

      {/* Dashed base line */}
      <path
        d={edgePath}
        fill="none"
        stroke={accentColor}
        strokeWidth={1.5}
        strokeOpacity={0.35}
        strokeDasharray="5 5"
      />

      {/* Leading particle */}
      <circle r="4" fill={`url(#${gradientId})`}>
        <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r="1.8" fill={accentColor} fillOpacity="0.9">
        <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Trailing particle (offset by half duration) */}
      <circle r="3" fill={`url(#${gradientId})`}>
        <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} begin="-0.8s" />
      </circle>
      <circle r="1.2" fill={accentColor} fillOpacity="0.65">
        <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} begin="-0.8s" />
      </circle>
    </>
  );
}
