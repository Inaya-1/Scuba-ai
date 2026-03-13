import React from 'react';
import { motion } from 'motion/react';
import { Compass, Thermometer, Clock, Wind, ArrowDown } from 'lucide-react';
import { DiveState } from '../types';

interface HUDProps {
  state: DiveState;
}

export const HUD: React.FC<HUDProps> = ({ state }) => {
  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="glass-panel px-4 py-2 flex items-center gap-6">
          <div className="flex flex-col">
            <span className="hud-text">Depth</span>
            <div className="flex items-baseline gap-1">
              <span className="hud-value">{state.depth.toFixed(1)}</span>
              <span className="text-[10px] text-dive-cyan/60 font-mono">M</span>
            </div>
          </div>
          <div className="w-[1px] h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="hud-text">Air</span>
            <div className="flex items-baseline gap-1">
              <span className={`hud-value ${state.airPressure < 50 ? 'text-dive-red' : 'text-dive-cyan'}`}>
                {state.airPressure}
              </span>
              <span className="text-[10px] text-dive-cyan/60 font-mono">BAR</span>
            </div>
          </div>
        </div>

        <div className="glass-panel px-4 py-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-dive-cyan" />
            <div className="flex flex-col">
              <span className="hud-text">Bottom Time</span>
              <span className="hud-value text-lg">{Math.floor(state.bottomTime / 60)}:{(state.bottomTime % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Compass */}
      <div className="absolute top-1/2 left-6 -translate-y-1/2 flex flex-col items-center gap-2">
        <div className="w-1 h-32 bg-white/10 relative rounded-full overflow-hidden">
          <motion.div 
            className="absolute w-full bg-dive-cyan"
            animate={{ height: `${(state.depth / 40) * 100}%` }}
            style={{ bottom: 0 }}
          />
        </div>
        <ArrowDown className="w-4 h-4 text-dive-cyan" />
        <span className="hud-text vertical-rl">Depth Gauge</span>
      </div>

      {/* Bottom Bar */}
      <div className="flex justify-between items-end">
        <div className="glass-panel px-4 py-3 flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-dive-cyan" />
            <div className="flex flex-col">
              <span className="hud-text">Heading</span>
              <span className="hud-value text-xl">{state.heading}°</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Thermometer className="w-5 h-5 text-dive-cyan" />
            <div className="flex flex-col">
              <span className="hud-text">Temp</span>
              <span className="hud-value text-xl">{state.waterTemp}°C</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${state.isListening ? 'bg-dive-cyan animate-pulse' : 'bg-white/20'}`} />
            <span className="hud-text">{state.isListening ? 'AI Listening' : 'AI Standby'}</span>
          </div>
          <div className="glass-panel p-2">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-1 h-4 rounded-full ${i < 4 ? 'bg-dive-cyan' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
