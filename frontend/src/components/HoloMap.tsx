import { useState, useMemo } from 'react';
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

const SIZE = 200;
const PAD = 28;

// Heading to math angle: 0°N = up, 90°E = right
function headingToXY(heading: number, dist: number): { dx: number; dy: number } {
  const rad = ((heading - 90) * Math.PI) / 180;
  return {
    dx: dist * Math.cos(rad) * -1, // east is +x
    dy: dist * Math.sin(rad) * -1, // north is -y in SVG
  };
  // Simpler: heading 0 (N) → dy=-dist, heading 90 (E) → dx=+dist
}

function buildRoute(steps: RouteStep[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const step of steps) {
    const prev = pts[pts.length - 1];
    const dist = step.distance_m && step.distance_m > 0 ? step.distance_m : 25;
    // Compass heading: 0=N(up), 90=E(right), 180=S(down), 270=W(left)
    const rad = (step.heading * Math.PI) / 180;
    pts.push({
      x: prev.x + dist * Math.sin(rad),  // sin for E/W component
      y: prev.y - dist * Math.cos(rad),  // -cos for N/S (SVG y inverted)
    });
  }
  return pts;
}

function fitToViewport(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 2) return [{ x: SIZE / 2, y: SIZE / 2 }];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  let rangeX = maxX - minX;
  let rangeY = maxY - minY;

  // Prevent collapse: ensure minimum range on both axes
  if (rangeX < 1) { rangeX = 100; minX -= 50; }
  if (rangeY < 1) { rangeY = 100; minY -= 50; }

  const usable = SIZE - PAD * 2;
  const scale = Math.min(usable / rangeX, usable / rangeY);

  // Center in viewport
  const scaledW = rangeX * scale;
  const scaledH = rangeY * scale;
  const offX = (SIZE - scaledW) / 2;
  const offY = (SIZE - scaledH) / 2;

  return pts.map((p) => ({
    x: (p.x - minX) * scale + offX,
    y: (p.y - minY) * scale + offY,
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

  const { points, diverPos, polylineStr, landmarkPositions, totalRouteDist } = useMemo(() => {
    if (!routeSteps || routeSteps.length === 0) {
      return { points: [], diverPos: { x: 100, y: 100 }, polylineStr: '', landmarkPositions: [], totalRouteDist: 0 };
    }

    const raw = buildRoute(routeSteps);
    const norm = fitToViewport(raw);

    // Diver: interpolate between step nodes
    const safeIndex = Math.max(0, Math.min(stepIndex, norm.length - 2));
    const step = routeSteps[safeIndex];
    const stepDist = step?.distance_m && step.distance_m > 0 ? step.distance_m : 25;
    const t = Math.min(Math.max(stepDistance / stepDist, 0), 1);

    const a = norm[safeIndex];
    const b = norm[safeIndex + 1] || a;
    const diver = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };

    const poly = norm.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Spread landmarks evenly across waypoints
    const lmPos = landmarks.slice(0, Math.max(norm.length, 1)).map((name, i) => {
      const idx = landmarks.length <= 1 ? 0 : Math.round((i / (landmarks.length - 1)) * (norm.length - 1));
      const pt = norm[idx] || norm[0];
      return { name, x: pt.x, y: pt.y };
    });

    const totalDist = routeSteps.reduce((s, r) => s + (r.distance_m || 0), 0);

    return { points: norm, diverPos: diver, polylineStr: poly, landmarkPositions: lmPos, totalRouteDist: totalDist };
  }, [routeSteps, landmarks, stepIndex, stepDistance]);

  if (!routeSteps || routeSteps.length === 0) return null;

  const clampedIndex = Math.max(0, Math.min(stepIndex, points.length - 2));

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
        {collapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
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
            <div className="holo-scanline" />

            {/* Title */}
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="hud-text text-[7px] text-dive-cyan/80">HOLO·MAP</span>
              <span className="hud-text text-[7px] text-white/30">
                {totalDistance.toFixed(0)}m{totalRouteDist > 0 ? ` / ${totalRouteDist}m` : ''}
              </span>
            </div>

            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="holo-map-svg">
              <defs>
                <pattern id="holoGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,242,255,0.06)" strokeWidth="0.5" />
                </pattern>
                <filter id="glowCyan">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="glowStrong">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <rect width={SIZE} height={SIZE} fill="url(#holoGrid)" />

              {/* Route glow */}
              <polyline points={polylineStr} fill="none" stroke="rgba(0,242,255,0.15)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" filter="url(#glowCyan)" />

              {/* Route dashed line */}
              <polyline points={polylineStr} fill="none" stroke="rgba(0,242,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />

              {/* Completed segment */}
              {clampedIndex > 0 && (
                <polyline
                  points={points.slice(0, clampedIndex + 1).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                  fill="none" stroke="rgba(0,242,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                />
              )}

              {/* Waypoints */}
              {points.map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x} cy={pt.y}
                    r={i === 0 || i === points.length - 1 ? 6 : 4}
                    fill={
                      i === 0 ? 'rgba(74,222,128,0.8)'
                      : i === points.length - 1 ? 'rgba(255,59,59,0.8)'
                      : i <= clampedIndex ? 'rgba(0,242,255,0.7)'
                      : 'rgba(255,255,255,0.15)'
                    }
                    stroke={
                      i === 0 ? 'rgba(74,222,128,0.4)'
                      : i === points.length - 1 ? 'rgba(255,59,59,0.4)'
                      : 'rgba(0,242,255,0.2)'
                    }
                    strokeWidth="1"
                  />
                  <text x={pt.x} y={pt.y + 0.5} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="5" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    {i === 0 ? '▶' : i === points.length - 1 ? '■' : i}
                  </text>
                </g>
              ))}

              {/* Landmark labels */}
              {landmarkPositions.map((lm, i) => (
                <text key={i} x={lm.x} y={lm.y - 12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="5" fontFamily="JetBrains Mono, monospace">
                  {lm.name.length > 14 ? lm.name.slice(0, 14) + '…' : lm.name}
                </text>
              ))}

              {/* Entry / Exit labels */}
              {points.length >= 2 && (
                <>
                  <text x={points[0].x} y={points[0].y + 14} textAnchor="middle" fontSize="5.5" fill="rgba(74,222,128,0.7)" fontFamily="JetBrains Mono, monospace">ENTRY</text>
                  <text x={points[points.length - 1].x} y={points[points.length - 1].y + 14} textAnchor="middle" fontSize="5.5" fill="rgba(255,59,59,0.7)" fontFamily="JetBrains Mono, monospace">EXIT</text>
                </>
              )}

              {/* Diver glow */}
              <circle cx={diverPos.x} cy={diverPos.y} r="8" fill="rgba(0,242,255,0.1)" filter="url(#glowStrong)">
                <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={diverPos.x} cy={diverPos.y} r="5" fill="rgba(0,242,255,0.25)" filter="url(#glowCyan)">
                <animate attributeName="opacity" values="0.25;0.7;0.25" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={diverPos.x} cy={diverPos.y} r="3" fill="#00f2ff" />

              {/* Heading arrow */}
              {(() => {
                const rad = (currentHeading * Math.PI) / 180;
                return (
                  <line
                    x1={diverPos.x} y1={diverPos.y}
                    x2={diverPos.x + 12 * Math.sin(rad)} y2={diverPos.y - 12 * Math.cos(rad)}
                    stroke="#00f2ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"
                  />
                );
              })()}

              {/* Compass rose */}
              <g transform={`translate(${SIZE - 18}, 18)`}>
                <circle r="12" fill="rgba(0,0,0,0.5)" stroke="rgba(0,242,255,0.2)" strokeWidth="0.5" />
                <text y="-4" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#00f2ff" fontFamily="JetBrains Mono, monospace">N</text>
                <text y="8" textAnchor="middle" fontSize="4.5" fill="rgba(255,255,255,0.3)" fontFamily="JetBrains Mono, monospace">S</text>
                <text x="-5" y="2.5" textAnchor="middle" fontSize="4.5" fill="rgba(255,255,255,0.3)" fontFamily="JetBrains Mono, monospace">W</text>
                <text x="5" y="2.5" textAnchor="middle" fontSize="4.5" fill="rgba(255,255,255,0.3)" fontFamily="JetBrains Mono, monospace">E</text>
              </g>
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed */}
      {collapsed && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
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
