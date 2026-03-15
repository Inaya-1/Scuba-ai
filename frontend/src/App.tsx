import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Mic, Map as MapIcon, Settings, Info } from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { CameraFeed } from './components/CameraFeed';
import { HUD } from './components/HUD';
import { ResponseOverlay } from './components/ResponseOverlay';
import { MapUpload } from './components/MapUpload';
import { RouteOverlay } from './components/RouteOverlay';
import { DiveState, AgentResponse } from './types';
import { scubaSocket } from './services/backendSocket';
import { geminiLive } from './services/liveApi';
import { AudioCapture } from './services/audioCapture';

const audioCapture = new AudioCapture();

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [diveState, setDiveState] = useState<DiveState>({
    depth: 12.4,
    airPressure: 185,
    bottomTime: 0,
    heading: 245,
    waterTemp: 24,
    isRecording: false,
    isListening: false,
  });
  const [responses, setResponses] = useState<AgentResponse[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [mapAnalysis, setMapAnalysis] = useState<{
    landmarks: string[];
    entry_point: string;
    exit_point: string;
    suggested_heading: number;
    confidence?: number;
    route_steps: { heading: number; description: string; distance_m?: number }[];
  } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [navDistance, setNavDistance] = useState<{ total: number; step: number; stepIndex: number }>({ total: 0, step: 0, stepIndex: 0 });
  const isListeningRef = useRef(false);
  const headingRef = useRef(245);
  // Once the backend sends real gauge data, stop overwriting with simulation
  const hasRealGaugeData = useRef(false);

  // ── Backend WebSocket: structured analysis + map uploads ──
  useEffect(() => {
    if (!isStarted) return;

    scubaSocket.connect({
      onResponse: (res) => {
        setResponses(prev => {
          // Nav responses replace the existing nav card instead of stacking
          if (res.agent === 'nav') {
            const withoutNav = prev.filter(r => r.agent !== 'nav');
            return [res, ...withoutNav].slice(0, 3);
          }
          return [res, ...prev].slice(0, 3);
        });

        // Capture nav map analysis metadata
        if (res.agent === 'nav' && res.metadata?.landmarks) {
          setMapAnalysis(res.metadata as typeof mapAnalysis);
          setMapError(null);
        }
        // Capture nav distance data from visual odometry
        if (res.agent === 'nav' && res.metadata?.total_distance_m != null) {
          setNavDistance({
            total: res.metadata.total_distance_m,
            step: res.metadata.step_distance_m ?? 0,
            stepIndex: res.metadata.current_step_index ?? 0,
          });
        }
        // Capture nav errors
        if (res.agent === 'nav' && res.content && !res.metadata?.landmarks) {
          if (res.content.toLowerCase().includes('could not') || res.content.toLowerCase().includes('unavailable') || res.content.toLowerCase().includes('error')) {
            setMapError(res.content);
          }
        }

        if (res.metadata) {
          const m = res.metadata!;
          const hasGauge = m.depth_m != null || m.depth_ft != null || m.psi != null || m.bar != null;
          if (hasGauge) hasRealGaugeData.current = true;

          setDiveState(prev => ({
            ...prev,
            ...(m.depth_m != null && { depth: m.depth_m }),
            ...(m.depth_ft != null && { depth: m.depth_ft * 0.3048 }),
            ...(m.psi != null && { airPressure: Math.round(m.psi / 14.5) }),
            ...(m.bar != null && { airPressure: m.bar }),
            ...(m.temp_c != null && { waterTemp: m.temp_c }),
            ...(m.dive_time_min != null && { bottomTime: m.dive_time_min * 60 }),
          }));
        }
      },
      onConnect: () => setBackendConnected(true),
      onDisconnect: () => setBackendConnected(false),
      onError: () => {},
    });

    return () => {
      scubaSocket.disconnect();
      setBackendConnected(false);
    };
  }, [isStarted]);

  // ── Gemini Live API: real-time audio/video stream ──
  useEffect(() => {
    if (!isStarted) return;

    geminiLive.connect({
      onTextResponse: (text) => {
        setResponses(prev => [{
          agent: 'manager',
          type: 'info',
          content: text,
          priority: 'medium',
        }, ...prev].slice(0, 3));
      },
      onAudioData: (pcmBase64) => {
        geminiLive.playAudioChunk(pcmBase64);
      },
      onError: (err) => {
        console.error("[App] Live API error:", err);
      },
      onConnect: () => setLiveConnected(true),
      onDisconnect: () => setLiveConnected(false),
    });

    return () => {
      geminiLive.disconnect();
      setLiveConnected(false);
    };
  }, [isStarted]);

  // ── Simulate dive metrics (stop depth/air drift once real gauge data arrives) ──
  useEffect(() => {
    if (!isStarted) return;

    const interval = setInterval(() => {
      setDiveState(prev => ({
        ...prev,
        bottomTime: prev.bottomTime + 1,
        // Only simulate depth drift when no real gauge data from backend
        ...(hasRealGaugeData.current ? {} : {
          depth: Math.max(0, prev.depth + (Math.random() - 0.5) * 0.1),
        }),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted]);

  // ── Device compass heading ──
  useEffect(() => {
    if (!isStarted) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const heading = (e as any).webkitCompassHeading ?? e.alpha ?? 0;
      const rounded = Math.round(heading);
      headingRef.current = rounded;
      setDiveState(prev => ({ ...prev, heading: rounded }));
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().then((state: string) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [isStarted]);

  // ── Frame handler: send to both backend (slow/structured) and Live API (fast/realtime) ──
  const frameCountRef = useRef(0);
  const handleFrame = useCallback((base64: string) => {
    frameCountRef.current += 1;

    // Every frame goes to Live API for real-time awareness (every 2s from CameraFeed)
    geminiLive.sendFrame(base64);

    // Every 3rd frame (6s) goes to backend for structured JSON analysis
    if (frameCountRef.current % 3 === 0) {
      scubaSocket.sendFrame(base64, headingRef.current);
    }
  }, []);

  // ── Push-to-talk: capture mic audio and stream to Live API ──
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    setDiveState(prev => ({ ...prev, isListening: true }));

    try {
      await audioCapture.start((pcmBase64) => {
        geminiLive.sendAudio(pcmBase64);
      });
    } catch (err) {
      console.error("Mic access failed:", err);
      isListeningRef.current = false;
      setDiveState(prev => ({ ...prev, isListening: false }));
    }
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setDiveState(prev => ({ ...prev, isListening: false }));
    audioCapture.stop();
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <AnimatePresence>
        {!isStarted && <LandingPage onStart={() => setIsStarted(true)} />}
      </AnimatePresence>

      {isStarted && (
        <>
          <CameraFeed onFrame={handleFrame} isStreaming={isStarted} />
          <HUD state={diveState} />
          <ResponseOverlay responses={responses} />

          {/* Connection indicators */}
          <div className="absolute top-6 left-6 z-30 flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-1 glass-panel rounded-full">
              <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-green-400 animate-pulse' : 'bg-dive-red'}`} />
              <span className="hud-text text-[8px]">BACKEND</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 glass-panel rounded-full">
              <div className={`w-2 h-2 rounded-full ${liveConnected ? 'bg-dive-cyan animate-pulse' : 'bg-dive-red'}`} />
              <span className="hud-text text-[8px]">LIVE AI</span>
            </div>
          </div>

          {/* Interaction Controls */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-6 pointer-events-auto">
            <button
              onClick={() => setShowMap(!showMap)}
              className={`p-4 rounded-full glass-panel transition-all active:scale-90 ${showMap ? 'text-dive-cyan border-dive-cyan/50' : 'text-white/60'}`}
            >
              <MapIcon className="w-6 h-6" />
            </button>

            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={`p-8 rounded-full shadow-2xl transition-all active:scale-95 ${
                diveState.isListening
                  ? 'bg-dive-cyan text-dive-bg shadow-[0_0_40px_rgba(0,242,255,0.6)]'
                  : 'glass-panel text-white/60'
              }`}
            >
              <Mic className={`w-8 h-8 ${diveState.isListening ? 'animate-pulse' : ''}`} />
            </button>

            <button className="p-4 rounded-full glass-panel text-white/60 active:scale-90">
              <Settings className="w-6 h-6" />
            </button>
          </div>

          {/* Map Upload Bottom Sheet */}
          <AnimatePresence>
            {showMap && (
              <MapUpload
                onUpload={(base64) => { setMapError(null); scubaSocket.sendMap(base64); }}
                onClose={() => setShowMap(false)}
                analysis={mapAnalysis}
                error={mapError}
              />
            )}
          </AnimatePresence>

          {/* Route Overlay (visible when map analyzed and sheet closed) */}
          {!showMap && mapAnalysis?.route_steps && mapAnalysis.route_steps.length > 0 && (
            <RouteOverlay
              routeSteps={mapAnalysis.route_steps}
              currentHeading={diveState.heading}
              totalDistance={navDistance.total}
              stepDistance={navDistance.step}
              activeStepIndex={navDistance.stepIndex}
            />
          )}

          {/* Status Indicators */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 glass-panel rounded-full">
              <div className="w-2 h-2 rounded-full bg-dive-cyan animate-pulse" />
              <span className="hud-text text-[8px]">REC {Math.floor(diveState.bottomTime / 60).toString().padStart(2, '0')}:{(diveState.bottomTime % 60).toString().padStart(2, '0')}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 glass-panel rounded-full">
              <Info className="w-3 h-3 text-dive-cyan" />
              <span className="hud-text text-[8px]">{liveConnected ? 'LIVE AI ACTIVE' : 'CONNECTING...'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
