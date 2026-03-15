import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface RouteStep {
  heading: number;
  description: string;
  distance_m?: number;
}

interface HoloMapProps {
  routeSteps: RouteStep[];
  landmarks: string[];
  entryPoint: string;
  exitPoint: string;
  currentHeading: number;
  stepIndex: number;
  stepDistance: number;
  totalDistance: number;
}

// Convert heading (0°=N, 90°=E, 180°=S, 270°=W) to SVG angle
function headingToAngle(heading: number): number {
  // SVG: 0° = right, counter-clockwise positive
  // Compass: 0° = up (north), clockwise positive
  // Convert: SVG angle = 90 - heading (in radians)
  return ((90 - heading) * Math.PI) / 180;
}

function computeRoutePoints(steps: RouteStep[]): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const step of steps) {
    const prev = points[points.length - 1];
    const dist = step.distance_m || 20;
    const angle = headingToAngle(step.heading);
    points.push({
      x: prev.x + dist * Math.cos(angle),
      y: prev.y - dist * Math.sin(angle), // SVG y is inverted
    });
  }
  return points;
}

function normalizePoints(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  padding: number
): { x: number; y: number }[] {
  if (points.length === 0) return [];

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(
    (width - padding * 2) / rangeX,
    (height - padding * 2) / rangeY
  );

  const offsetX = (width - rangeX * scale) / 2;
  const offsetY = (height - rangeY * scale) / 2;

  return points.map((p) => ({
    x: (p.x - minX) * scale + offsetX,
    y: (p.y - minY) * scale + offsetY,
  }));
}

export function HoloMap({
  routeSteps,
  landmarks,
  entryPoint,
  exitPoint,
  currentHeading,
  stepIndex,
  stepDistance,
  totalDistance,
}: HoloMapProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!routeSteps || routeSteps.length === 0) return null;

  const SIZE = 200;
  const PAD = 24;
  const rawPoints = computeRoutePoints(routeSteps);
  const points = normalizePoints(rawPoints, SIZE, SIZE, PAD);

  // Diver position: interpolate between current step node and next
  const clampedIndex = Math.min(stepIndex, points.length - 2);
  const currentStep = routeSteps[clampedIndex];
  const stepTotalDist = currentStep?.distance_m || 20;
  const progress = Math.min(stepDistance / stepTotalDist, 1);

  const diverX =
    points[clampedIndex].x +
    (points[clampedIndex + 1].x - points[clampedIndex].x) * progress;
  const diverY =
    points[clampedIndex].y +
    (points[clampedIndex + 1].y - points[clampedIndex].y) * progress;

  // Build polyline string
  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Assign landmarks to nearest waypoint (spread evenly if more landmarks than points)
  const landmarkPositions = landmarks.slice(0, points.length).map((name, i) => {
    const ptIndex = Math.round((i / Math.max(landmarks.length - 1, 1)) * (points.length - 1));
    const pt = points[ptIndex] || points[0];
    return { name, x: pt.x, y: pt.y };
  });

  // Total route distance
  const totalRouteDist = routeSteps.reduce((s, r) => s + (r.distance_m || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute bottom-32 right-4 z-20"
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -top-3 -right-3 z-30 p-1.5 rounded-full glass-panel text-dive-cyan hover:bg-dive-cyan/10 transition-all"
      >
        {collapsed ? (
          <Maximize2 className="w-3 h-3" />
        ) : (
          <Minimize2 className="w-3 h-3" />
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="holo-map-container glass-panel p-2 relative overflow-hidden"
            style={{ width: SIZE + 16, height: SIZE + 48 }}
          >
            {/* Holographic scan line */}
            <div className="holo-scanline" />

            {/* Title bar */}
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="hud-text text-[7px] text-dive-cyan/80">HOLO·MAP</span>
              <span className="hud-text text-[7px] text-white/30">
                {totalDistance.toFixed(0)}m{totalRouteDist > 0 ? ` / ${totalRouteDist}m` : ''}
              </span>
            </div>

            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="holo-map-svg"
            >
              {/* Grid background */}
              <defs>
                <pattern id="holoGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,242,255,0.06)" strokeWidth="0.5" />
                </pattern>
                <filter id="glowCyan">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="glowStrong">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect width={SIZE} height={SIZE} fill="url(#holoGrid)" />

              {/* Route path — shadow */}
              <polyline
                points={polylineStr}
                fill="none"
                stroke="rgba(0,242,255,0.15)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glowCyan)"
              />

              {/* Route path — main */}
              <polyline
                points={polylineStr}
                fill="none"
                stroke="rgba(0,242,255,0.6)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 3"
              />

              {/* Completed route highlight */}
              {clampedIndex > 0 && (
                <polyline
                  points={points.slice(0, clampedIndex + 1).map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(0,242,255,0.9)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Waypoint nodes */}
              {points.map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={i === 0 || i === points.length - 1 ? 5 : 3.5}
                    fill={
                      i === 0
                        ? 'rgba(74,222,128,0.8)' // entry green
                        : i === points.length - 1
                        ? 'rgba(255,59,59,0.8)' // exit red
                        : i <= clampedIndex
                        ? 'rgba(0,242,255,0.7)' // completed
                        : 'rgba(255,255,255,0.15)' // upcoming
                    }
                    stroke={
                      i === 0
                        ? 'rgba(74,222,128,0.4)'
                        : i === points.length - 1
                        ? 'rgba(255,59,59,0.4)'
                        : 'rgba(0,242,255,0.2)'
                    }
                    strokeWidth="1"
                  />
                  {/* Step number */}
                  <text
                    x={pt.x}
                    y={pt.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-white"
                    fontSize="5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {i === 0 ? '▶' : i === points.length - 1 ? '■' : i}
                  </text>
                </g>
              ))}

              {/* Landmark labels */}
              {landmarkPositions.map((lm, i) => (
                <text
                  key={i}
                  x={lm.x}
                  y={lm.y - 10}
                  textAnchor="middle"
                  className="fill-white/40"
                  fontSize="5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {lm.name.length > 12 ? lm.name.slice(0, 12) + '…' : lm.name}
                </text>
              ))}

              {/* Entry/Exit labels */}
              <text x={points[0].x} y={points[0].y + 12} textAnchor="middle" fontSize="5" className="fill-green-400/70" fontFamily="JetBrains Mono, monospace">
                ENTRY
              </text>
              <text x={points[points.length - 1].x} y={points[points.length - 1].y + 12} textAnchor="middle" fontSize="5" className="fill-dive-red/70" fontFamily="JetBrains Mono, monospace">
                EXIT
              </text>

              {/* Diver position */}
              <circle cx={diverX} cy={diverY} r="6" fill="rgba(0,242,255,0.15)" filter="url(#glowStrong)">
                <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={diverX} cy={diverY} r="4" fill="rgba(0,242,255,0.3)" filter="url(#glowCyan)">
                <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={diverX} cy={diverY} r="2.5" fill="#00f2ff" />

              {/* Diver heading indicator */}
              {(() => {
                const angle = headingToAngle(currentHeading);
                const tipX = diverX + 10 * Math.cos(angle);
                const tipY = diverY - 10 * Math.sin(angle);
                return (
                  <line
                    x1={diverX}
                    y1={diverY}
                    x2={tipX}
                    y2={tipY}
                    stroke="#00f2ff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                );
              })()}

              {/* Compass rose */}
              <g transform={`translate(${SIZE - 16}, 16)`}>
                <circle r="10" fill="rgba(0,0,0,0.4)" stroke="rgba(0,242,255,0.2)" strokeWidth="0.5" />
                <text y="-3" textAnchor="middle" fontSize="5" fontWeight="bold" className="fill-dive-cyan" fontFamily="JetBrains Mono, monospace">N</text>
                <text y="7" textAnchor="middle" fontSize="4" className="fill-white/30" fontFamily="JetBrains Mono, monospace">S</text>
                <text x="-1" y="2" textAnchor="end" fontSize="4" className="fill-white/30" fontFamily="JetBrains Mono, monospace">W</text>
                <text x="1" y="2" textAnchor="start" fontSize="4" className="fill-white/30" fontFamily="JetBrains Mono, monospace">E</text>
              </g>
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed mini indicator */}
      {collapsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel p-2 flex items-center gap-2 cursor-pointer"
          onClick={() => setCollapsed(false)}
        >
          <div className="w-2 h-2 rounded-full bg-dive-cyan holo-diver-pulse" />
          <span className="hud-text text-[8px]">MAP</span>
          <span className="text-[9px] text-dive-cyan font-mono">{totalDistance.toFixed(0)}m</span>
        </motion.div>
      )}
    </motion.div>
  );
}
