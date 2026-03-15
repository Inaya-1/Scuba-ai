import { motion } from 'motion/react';
import { Navigation, ChevronRight } from 'lucide-react';

interface RouteStep {
  heading: number;
  description: string;
  distance_m?: number;
}

interface RouteOverlayProps {
  routeSteps: RouteStep[];
  currentHeading: number;
}

function headingDiff(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}

function getActiveStepIndex(heading: number, steps: RouteStep[]): number {
  if (steps.length === 0) return 0;
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < steps.length; i++) {
    const diff = Math.abs(headingDiff(heading, steps[i].heading));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function RouteOverlay({ routeSteps, currentHeading }: RouteOverlayProps) {
  if (!routeSteps || routeSteps.length === 0) return null;

  const activeIndex = getActiveStepIndex(currentHeading, routeSteps);
  const activeStep = routeSteps[activeIndex];
  const diff = headingDiff(currentHeading, activeStep.heading);
  const arrowRotation = diff;

  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-56"
    >
      {/* Compass arrow */}
      <div className="glass-panel p-3 mb-2 flex items-center gap-3">
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-dive-cyan/30" />
          <Navigation
            className="w-5 h-5 text-dive-cyan transition-transform duration-300"
            style={{ transform: `rotate(${arrowRotation}deg)` }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className="hud-text text-[9px] text-white/40 block">Next waypoint</span>
          <span className="font-display font-bold text-dive-cyan text-sm">{activeStep.heading}°</span>
          {Math.abs(diff) > 30 && (
            <span className="block text-[10px] text-dive-red font-mono mt-0.5">
              Turn {diff > 0 ? 'right' : 'left'} {Math.abs(Math.round(diff))}°
            </span>
          )}
        </div>
      </div>

      {/* Route steps list */}
      <div className="glass-panel p-2 space-y-0.5 max-h-48 overflow-y-auto">
        {routeSteps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
              i === activeIndex ? 'bg-dive-cyan/10 border border-dive-cyan/20' : ''
            } ${i < activeIndex ? 'opacity-40' : ''}`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i === activeIndex ? 'bg-dive-cyan text-black' : 'bg-white/10 text-white/40'
            }`}>
              {i + 1}
            </div>
            <p className={`text-[10px] flex-1 ${i === activeIndex ? 'text-white' : 'text-white/50'}`}>
              {step.description}
            </p>
            {i === activeIndex && <ChevronRight className="w-3 h-3 text-dive-cyan flex-shrink-0" />}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
