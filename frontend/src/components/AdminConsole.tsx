import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Thermometer, Gauge, ArrowUp, Clock, Zap, Play } from 'lucide-react';
import { AgentResponse } from '../types';

interface AdminConsoleProps {
  open: boolean;
  onClose: () => void;
  onInject: (res: AgentResponse) => void;
}

interface Metrics {
  bar: number;
  depth_m: number;
  temp_c: number;
  ndl_min: number;
  ascent_rate_mpm: number;
}

const SCENARIOS: { label: string; icon: typeof AlertTriangle; color: string; metrics: Partial<Metrics> }[] = [
  { label: 'Low Air', icon: Gauge, color: 'text-dive-orange', metrics: { bar: 65 } },
  { label: 'Critical Air', icon: AlertTriangle, color: 'text-dive-red', metrics: { bar: 30 } },
  { label: 'Rapid Ascent', icon: ArrowUp, color: 'text-dive-red', metrics: { depth_m: 15, ascent_rate_mpm: 20 } },
  { label: 'Deep Dive', icon: ArrowUp, color: 'text-dive-orange', metrics: { depth_m: 35 } },
  { label: 'Cold Water', icon: Thermometer, color: 'text-blue-400', metrics: { temp_c: 8 } },
  { label: 'NDL Critical', icon: Clock, color: 'text-dive-red', metrics: { ndl_min: 2, depth_m: 25 } },
  { label: 'O2 Toxicity', icon: Zap, color: 'text-dive-red', metrics: { cns_percent: 95, depth_m: 28 } as any },
  { label: 'All Normal', icon: Play, color: 'text-green-400', metrics: { bar: 180, depth_m: 12, temp_c: 24, ndl_min: 45 } },
];

async function sendSimulation(metrics: Record<string, number>): Promise<AgentResponse | null> {
  try {
    const resp = await fetch('/api/admin/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { ...data, _ts: Date.now() } as AgentResponse;
  } catch {
    return null;
  }
}

export function AdminConsole({ open, onClose, onInject }: AdminConsoleProps) {
  const [metrics, setMetrics] = useState<Metrics>({
    bar: 180,
    depth_m: 12,
    temp_c: 24,
    ndl_min: 45,
    ascent_rate_mpm: 0,
  });
  const [sending, setSending] = useState(false);

  const fire = async (overrides?: Partial<Metrics>) => {
    setSending(true);
    const payload = overrides ? { ...metrics, ...overrides } : metrics;
    const res = await sendSimulation(payload);
    if (res) onInject(res);
    setSending(false);
  };

  const slider = (
    label: string,
    key: keyof Metrics,
    min: number,
    max: number,
    step: number,
    unit: string,
    color: string,
  ) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="hud-text text-[9px] text-white/50">{label}</span>
        <span className={`font-mono text-xs ${color}`}>
          {metrics[key]} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={metrics[key]}
        onChange={(e) => setMetrics(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-dive-cyan cursor-pointer"
      />
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 right-0 bottom-0 w-80 z-50 glass-panel rounded-l-2xl border-l border-white/10 overflow-y-auto"
        >
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-sm text-dive-cyan">Admin Console</h2>
                <span className="hud-text text-[8px] text-white/30">DEMO METRICS SIMULATOR</span>
              </div>
              <button onClick={onClose} className="p-2 text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Scenarios */}
            <div>
              <span className="hud-text text-[9px] text-white/40 block mb-2">QUICK SCENARIOS</span>
              <div className="grid grid-cols-2 gap-2">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => fire(s.metrics)}
                    disabled={sending}
                    className={`flex items-center gap-2 p-2.5 glass-panel hover:border-white/20 transition-all active:scale-95 rounded-lg ${sending ? 'opacity-50' : ''}`}
                  >
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                    <span className="hud-text text-[9px]">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Sliders */}
            <div className="space-y-4">
              <span className="hud-text text-[9px] text-white/40 block">MANUAL CONTROL</span>
              {slider('Air Pressure', 'bar', 0, 250, 5, 'bar',
                metrics.bar < 35 ? 'text-dive-red' : metrics.bar < 70 ? 'text-dive-orange' : 'text-dive-cyan')}
              {slider('Depth', 'depth_m', 0, 60, 1, 'm',
                metrics.depth_m > 30 ? 'text-dive-red' : metrics.depth_m > 18 ? 'text-dive-orange' : 'text-dive-cyan')}
              {slider('Temperature', 'temp_c', 0, 35, 1, '°C',
                metrics.temp_c < 10 ? 'text-dive-red' : metrics.temp_c < 20 ? 'text-blue-400' : 'text-dive-cyan')}
              {slider('NDL', 'ndl_min', 0, 60, 1, 'min',
                metrics.ndl_min <= 0 ? 'text-dive-red' : metrics.ndl_min < 10 ? 'text-dive-orange' : 'text-dive-cyan')}
              {slider('Ascent Rate', 'ascent_rate_mpm', 0, 30, 1, 'm/min',
                metrics.ascent_rate_mpm > 18 ? 'text-dive-red' : metrics.ascent_rate_mpm > 10 ? 'text-dive-orange' : 'text-dive-cyan')}
            </div>

            {/* Fire Button */}
            <button
              onClick={() => fire()}
              disabled={sending}
              className={`w-full py-3 rounded-xl font-display font-bold text-sm transition-all active:scale-95 ${
                sending
                  ? 'bg-white/10 text-white/30'
                  : 'bg-dive-cyan/20 border border-dive-cyan/50 text-dive-cyan hover:bg-dive-cyan/30'
              }`}
            >
              {sending ? 'Sending...' : 'Send Metrics'}
            </button>

            <p className="text-[8px] text-white/20 text-center hud-text">
              Metrics bypass Gemini and trigger safety thresholds directly. TTS will speak critical alerts.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
