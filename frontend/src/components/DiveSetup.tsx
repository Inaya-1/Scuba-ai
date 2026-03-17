import React, { useState, useRef, useCallback, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Waves, Microscope, Map as MapIcon, Upload, Camera, Play,
  Navigation, CheckCircle, AlertTriangle, RefreshCw, Check, Loader2, MapPin, X, Mic, MicOff
} from 'lucide-react';
import { UIMode } from '../types';
import { useVoiceCommands } from '../hooks/useVoiceCommands';

interface RouteStep {
  heading: number;
  description: string;
  distance_m?: number;
}

interface MapAnalysis {
  landmarks: string[];
  entry_point: string;
  exit_point: string;
  suggested_heading: number;
  confidence?: number;
  route_steps: RouteStep[];
}

interface DiveSetupProps {
  onStartDive: (config: DiveConfig) => void;
  backendConnected: boolean;
}

export interface DiveConfig {
  uiMode: UIMode;
  demoVideoUrl: string | null;
  mapAnalysis: MapAnalysis | null;
}

const LOADING_STEPS = [
  { label: 'Uploading image...', delay: 0 },
  { label: 'Sending to Gemini Vision...', delay: 1500 },
  { label: 'Extracting landmarks...', delay: 4000 },
  { label: 'Building route...', delay: 7000 },
];

export function DiveSetup({ onStartDive, backendConnected }: DiveSetupProps) {
  const [uiMode, setUiMode] = useState<UIMode>('marine-biologist');
  const [demoVideo, setDemoVideo] = useState<string | null>(null);
  const [demoFileName, setDemoFileName] = useState<string | null>(null);

  // Map state
  const [mapPreview, setMapPreview] = useState<string | null>(null);
  const [mapAnalysis, setMapAnalysis] = useState<MapAnalysis | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState('');

  const videoInputRef = useRef<HTMLInputElement>(null);
  const mapFileRef = useRef<HTMLInputElement>(null);
  const mapCaptureRef = useRef<HTMLInputElement>(null);

  // Voice commands
  const voice = useVoiceCommands({
    onUploadMap: useCallback(() => mapFileRef.current?.click(), []),
    onSetDiverMode: useCallback(() => setUiMode('diver'), []),
    onSetMarineMode: useCallback(() => setUiMode('marine-biologist'), []),
    onUploadVideo: useCallback(() => videoInputRef.current?.click(), []),
    onStartDive: useCallback(() => onStartDive({ uiMode, demoVideoUrl: demoVideo, mapAnalysis }), [uiMode, demoVideo, mapAnalysis, onStartDive]),
  });

  const handleVideoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDemoVideo(URL.createObjectURL(file));
      setDemoFileName(file.name);
    }
  };

  const handleMapFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setMapPreview(reader.result as string);
      setMapLoading(true);
      setMapError(null);
      setMapAnalysis(null);
      setLoadingStep(0);

      // Animate loading steps
      const timers = LOADING_STEPS.slice(1).map((step, i) =>
        setTimeout(() => setLoadingStep(i + 1), step.delay)
      );

      // Send to backend via REST
      fetch('/api/admin/simulate', { method: 'POST' }); // warmup
      sendMapToBackend(base64).then(result => {
        timers.forEach(clearTimeout);
        setMapLoading(false);
        if (result.error) {
          setMapError(result.error);
        } else if (result.metadata?.route_steps) {
          setMapAnalysis(result.metadata as MapAnalysis);
        } else {
          setMapError('Could not extract route from map. Try a clearer image.');
        }
      }).catch(() => {
        timers.forEach(clearTimeout);
        setMapLoading(false);
        setMapError('Failed to analyze map. Check backend connection.');
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRefine = async (feedback: string) => {
    setMapLoading(true);
    setMapAnalysis(null);
    setMapError(null);
    setLoadingStep(0);

    const timers = LOADING_STEPS.slice(1).map((step, i) =>
      setTimeout(() => setLoadingStep(i + 1), step.delay)
    );

    try {
      const resp = await fetch('/ws-map-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      // For now, refinement goes through WebSocket — we'll handle it post-dive-start
      timers.forEach(clearTimeout);
      setMapLoading(false);
      setMapError('Refinement will be available during the dive. Start the dive first.');
    } catch {
      timers.forEach(clearTimeout);
      setMapLoading(false);
      setMapError('Refinement failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-dive-bg flex flex-col items-center overflow-y-auto p-6">
      {/* Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-dive-cyan blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg space-y-6 py-4"
      >
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 bg-dive-cyan rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,242,255,0.3)]">
              <Waves className="text-dive-bg w-5 h-5" />
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tighter">
              DIVE <span className="text-dive-cyan">SETUP</span>
            </h1>
          </div>
          <p className="text-xs text-white/40 hud-text">CONFIGURE YOUR DIVE BEFORE STARTING</p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 glass-panel rounded-full w-fit mx-auto">
          <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-green-400 animate-pulse' : 'bg-dive-red'}`} />
          <span className="hud-text text-[8px]">{backendConnected ? 'BACKEND CONNECTED' : 'CONNECTING...'}</span>
        </div>

        {/* Browser warning for non-Chrome */}
        {!voice.isSupported && (
          <div className="flex items-center gap-2 px-4 py-3 glass-panel border-dive-orange/30 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-dive-orange flex-shrink-0" />
            <p className="text-[10px] text-white/70">
              Voice commands require <span className="text-dive-orange font-bold">Google Chrome</span>. Switch browsers for the full Scoobi experience.
            </p>
          </div>
        )}

        {/* Voice Command Button */}
        {voice.isSupported && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={voice.toggleListening}
              className={`relative p-4 rounded-full transition-all active:scale-90 ${
                voice.listening
                  ? 'bg-dive-cyan/20 border-2 border-dive-cyan shadow-[0_0_25px_rgba(0,242,255,0.4)]'
                  : 'glass-panel hover:border-white/20'
              }`}
            >
              {voice.listening ? (
                <Mic className="w-6 h-6 text-dive-cyan animate-pulse" />
              ) : (
                <MicOff className="w-6 h-6 text-white/40" />
              )}
              {voice.listening && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-dive-cyan rounded-full animate-ping" />
              )}
            </button>
            <span className="hud-text text-[8px] text-white/40">
              {voice.listening ? 'LISTENING...' : 'TAP TO TALK TO SCOOBI'}
            </span>
            <AnimatePresence>
              {voice.transcript && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-2 glass-panel rounded-lg max-w-xs text-center"
                >
                  <p className="text-[10px] text-white/70 italic">"{voice.transcript}"</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 1. Dive Mode Selection */}
        <div className="glass-panel p-4 rounded-xl space-y-3">
          <span className="hud-text text-[9px] text-white/40">DIVE MODE</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setUiMode('diver')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all active:scale-95 ${
                uiMode === 'diver'
                  ? 'bg-dive-cyan/20 border border-dive-cyan/50'
                  : 'glass-panel hover:border-white/20'
              }`}
            >
              <Waves className={`w-6 h-6 ${uiMode === 'diver' ? 'text-dive-cyan' : 'text-white/40'}`} />
              <span className="hud-text text-[10px]">Diver Mode</span>
              <span className="text-[8px] text-white/30 text-center">Safety-focused HUD</span>
            </button>
            <button
              onClick={() => setUiMode('marine-biologist')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all active:scale-95 ${
                uiMode === 'marine-biologist'
                  ? 'bg-dive-cyan/20 border border-dive-cyan/50'
                  : 'glass-panel hover:border-white/20'
              }`}
            >
              <Microscope className={`w-6 h-6 ${uiMode === 'marine-biologist' ? 'text-dive-cyan' : 'text-white/40'}`} />
              <span className="hud-text text-[10px]">Bio Mode</span>
              <span className="text-[8px] text-white/30 text-center">Full analysis & species ID</span>
            </button>
          </div>
        </div>

        {/* 2. Demo Video Upload */}
        <div className="glass-panel p-4 rounded-xl space-y-3">
          <span className="hud-text text-[9px] text-white/40">DEMO VIDEO (OPTIONAL)</span>
          <p className="text-[10px] text-white/30">Upload a POV dive video to simulate a real dive.</p>
          <button
            onClick={() => videoInputRef.current?.click()}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all active:scale-95 ${
              demoVideo
                ? 'bg-dive-cyan/10 border border-dive-cyan/30'
                : 'glass-panel hover:border-white/20'
            }`}
          >
            <Upload className={`w-5 h-5 ${demoVideo ? 'text-dive-cyan' : 'text-white/40'}`} />
            <span className="hud-text text-[10px] flex-1 text-left">
              {demoFileName || 'Choose video file...'}
            </span>
            {demoVideo && <CheckCircle className="w-4 h-4 text-green-400" />}
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
        </div>

        {/* 3. Map Upload */}
        <div className="glass-panel p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="hud-text text-[9px] text-white/40">DIVE SITE MAP (OPTIONAL)</span>
            {mapAnalysis && (
              <span className="flex items-center gap-1 text-green-400 text-[9px] hud-text">
                <CheckCircle className="w-3 h-3" /> Route ready
              </span>
            )}
          </div>
          <p className="text-[10px] text-white/30">Upload a hand-drawn or printed dive site map for navigation.</p>

          {/* Upload buttons (show when no map preview) */}
          {!mapPreview && !mapAnalysis && (
            <div className="flex gap-3">
              <button
                onClick={() => mapCaptureRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2 py-4 glass-panel hover:border-dive-cyan/30 transition-colors cursor-pointer rounded-lg active:scale-95"
              >
                <Camera className="w-6 h-6 text-dive-cyan" />
                <span className="hud-text text-[9px]">Take Photo</span>
              </button>
              <button
                onClick={() => mapFileRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2 py-4 glass-panel hover:border-dive-cyan/30 transition-colors cursor-pointer rounded-lg active:scale-95"
              >
                <MapIcon className="w-6 h-6 text-dive-cyan" />
                <span className="hud-text text-[9px]">Choose File</span>
              </button>
              <input ref={mapCaptureRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMapFile(f); }} className="hidden" />
              <input ref={mapFileRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMapFile(f); }} className="hidden" />
            </div>
          )}

          {/* Map preview + loading */}
          {mapPreview && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={mapPreview} alt="Dive map" className="w-full h-40 object-cover" />
              {mapLoading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 p-4">
                  <Loader2 className="w-6 h-6 text-dive-cyan animate-spin" />
                  <div className="space-y-1.5 w-full max-w-[180px]">
                    {LOADING_STEPS.map((step, i) => (
                      <div key={i} className={`flex items-center gap-2 transition-opacity duration-300 ${i <= loadingStep ? 'opacity-100' : 'opacity-30'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${i < loadingStep ? 'bg-green-400' : i === loadingStep ? 'bg-dive-cyan animate-pulse' : 'bg-white/20'}`} />
                        <span className="hud-text text-[8px]">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {mapError && !mapLoading && (
            <div className="flex items-start gap-2 p-3 glass-panel border-dive-red/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-dive-red flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-white/80">{mapError}</p>
                <button onClick={() => { setMapPreview(null); setMapError(null); }} className="mt-1 text-[9px] text-dive-cyan hover:underline">Try again</button>
              </div>
            </div>
          )}

          {/* Analysis results */}
          {mapAnalysis && (
            <div className="space-y-3">
              {/* Landmarks */}
              {mapAnalysis.landmarks?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mapAnalysis.landmarks.map((lm, i) => (
                    <span key={i} className="px-2 py-0.5 glass-panel text-[9px] font-mono text-dive-cyan rounded-full">
                      <MapPin className="w-2.5 h-2.5 inline mr-1" />{lm}
                    </span>
                  ))}
                </div>
              )}

              {/* Route steps (condensed) */}
              {mapAnalysis.route_steps?.length > 0 && (
                <div className="space-y-1">
                  {mapAnalysis.route_steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-[9px]">
                      <span className="w-5 h-5 rounded-full bg-dive-cyan/20 flex items-center justify-center text-dive-cyan font-bold flex-shrink-0">{i + 1}</span>
                      <span className="text-white/70 flex-1">{step.description}</span>
                      <span className="hud-text text-white/40">{step.heading}°</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Confidence */}
              {mapAnalysis.confidence != null && (
                <div className="flex items-center gap-2">
                  <CheckCircle className={`w-3.5 h-3.5 ${mapAnalysis.confidence > 0.7 ? 'text-green-400' : mapAnalysis.confidence > 0.4 ? 'text-dive-orange' : 'text-dive-red'}`} />
                  <span className="hud-text text-[9px]">Confidence: {Math.round(mapAnalysis.confidence * 100)}%</span>
                </div>
              )}

              {/* Refine + re-upload */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRefine(!showRefine)}
                  className={`flex-1 py-2 glass-panel rounded-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 hud-text text-[9px] ${showRefine ? 'border-dive-orange/50 text-dive-orange' : ''}`}
                >
                  <RefreshCw className="w-3 h-3" /> Refine
                </button>
                <button
                  onClick={() => { setMapPreview(null); setMapAnalysis(null); setMapError(null); }}
                  className="flex-1 py-2 glass-panel rounded-lg active:scale-95 transition-all hud-text text-[9px] text-white/40"
                >
                  Re-upload
                </button>
              </div>
              {showRefine && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder="e.g. There's a wreck near the entry..."
                    className="flex-1 px-3 py-2 glass-panel text-[10px] text-white placeholder-white/30 bg-transparent outline-none rounded-lg"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && refineText.trim()) {
                        handleRefine(refineText.trim());
                        setRefineText('');
                        setShowRefine(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Start Dive Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onStartDive({ uiMode, demoVideoUrl: demoVideo, mapAnalysis })}
          className="w-full py-4 bg-dive-cyan text-dive-bg font-display font-bold text-lg rounded-2xl shadow-[0_0_30px_rgba(0,242,255,0.3)] hover:shadow-[0_0_50px_rgba(0,242,255,0.5)] transition-all flex items-center justify-center gap-3"
        >
          <Play className="w-6 h-6 fill-current" />
          START DIVE
        </motion.button>

        <p className="text-[8px] text-white/20 text-center hud-text">
          You can change settings during the dive via the gear icon
        </p>
      </motion.div>
    </div>
  );
}

/** Send map to backend WebSocket for analysis */
async function sendMapToBackend(base64: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 30000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'map_upload',
        payload: base64,
        metadata: { timestamp: Date.now() },
      }));
    };
    ws.onmessage = (e) => {
      clearTimeout(timeout);
      try {
        const data = JSON.parse(e.data);
        resolve(data);
      } catch {
        resolve({ error: 'Invalid response from server' });
      }
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket error')); };
  });
}
