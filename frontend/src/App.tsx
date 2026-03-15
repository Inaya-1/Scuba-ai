import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Mic, Map as MapIcon, Power, Info, Fish, Upload, MessageSquare } from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { CameraFeed, CameraFeedHandle } from './components/CameraFeed';
import { HUD } from './components/HUD';
import { ResponseOverlay } from './components/ResponseOverlay';
import { MapUpload } from './components/MapUpload';
import { RouteOverlay } from './components/RouteOverlay';
import { HoloMap } from './components/HoloMap';
import { DiveState, AgentResponse } from './types';
import { scubaSocket } from './services/backendSocket';
import { geminiLive } from './services/liveApi';
import { AudioCapture } from './services/audioCapture';

const audioCapture = new AudioCapture();

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [backendConnected, setBackendConnected] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [compassAvailable, setCompassAvailable] = useState(true);
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
  const [showAgentCards, setShowAgentCards] = useState(false);
  const showAgentCardsRef = useRef(false);
  const [demoVideo, setDemoVideo] = useState<string | null>(null);
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
  const mapLockedRef = useRef(false);
  const isListeningRef = useRef(false);
  const headingRef = useRef(245);
  const accelRef = useRef(0);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<CameraFeedHandle>(null);
  // Once the backend sends real gauge data, stop overwriting with simulation
  const hasRealGaugeData = useRef(false);

  // Keep ref in sync with state for use inside WS callback closure
  useEffect(() => { showAgentCardsRef.current = showAgentCards; }, [showAgentCards]);

  // Clear agent cards when toggle is turned off
  useEffect(() => {
    if (!showAgentCards) {
      setResponses(prev => prev.filter(r => r.agent === 'safety' && (r.priority === 'critical' || r.priority === 'high')));
    }
  }, [showAgentCards]);

  // ── Backend WebSocket: structured analysis + map uploads ──
  useEffect(() => {
    if (!isStarted) return;

    scubaSocket.connect({
      onResponse: (res) => {
        // Forward all agent responses to Live API as context for unified narration
        const priorityNum = res.priority === 'critical' ? 9
          : res.priority === 'high' ? 6
          : res.priority === 'medium' ? 3 : 1;
        geminiLive.sendAgentReport({
          agent: res.agent,
          type: res.type,
          content: res.content,
          priority: priorityNum,
          metadata: res.metadata,
        });

        // Always show critical safety alerts as cards regardless of toggle
        const isCritical = res.agent === 'safety' && (res.priority === 'critical' || res.priority === 'high');

        if (showAgentCardsRef.current || isCritical) {
          setResponses(prev => {
            if (res.agent === 'safety') {
              const withoutSafety = prev.filter(r => r.agent !== 'safety');
              return [res, ...withoutSafety].slice(0, 3);
            }
            if (res.agent === 'nav') {
              const withoutNav = prev.filter(r => r.agent !== 'nav');
              return [res, ...withoutNav].slice(0, 3);
            }
            if (res.agent === 'bio') {
              const withoutBio = prev.filter(r => r.agent !== 'bio');
              return [res, ...withoutBio].slice(0, 3);
            }
            return [res, ...prev].slice(0, 3);
          });
        }

        // Capture nav map analysis metadata — only on first response with route_steps (from map upload)
        if (res.agent === 'nav' && res.metadata?.route_steps && !mapLockedRef.current) {
          setMapAnalysis(res.metadata as typeof mapAnalysis);
          setMapError(null);
          mapLockedRef.current = true;
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
          _ts: Date.now(),
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
    }, accessCode);

    return () => {
      geminiLive.disconnect();
      setLiveConnected(false);
    };
  }, [isStarted, accessCode]);

  // ── Auto-dismiss response cards after 6 seconds ──
  useEffect(() => {
    if (responses.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setResponses(prev => prev.filter(r => {
        const age = now - (r._ts ?? now);
        return age < 6000;
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [responses.length > 0]);

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
        } else {
          setCompassAvailable(false);
        }
      }).catch(() => {
        setCompassAvailable(false);
      });
    } else if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation);
      const timeout = setTimeout(() => {
        if (headingRef.current === 245) setCompassAvailable(false);
      }, 3000);
      return () => {
        clearTimeout(timeout);
        window.removeEventListener('deviceorientation', handleOrientation);
      };
    } else {
      setCompassAvailable(false);
    }

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [isStarted]);

  // ── Device motion for odometry (accelerometer) ──
  useEffect(() => {
    if (!isStarted) return;

    const handleMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (a && a.x != null && a.y != null && a.z != null) {
        accelRef.current = Math.round(Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2) * 100) / 100;
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isStarted]);

  // ── Frame handler: send to both backend and Live API ──
  const frameCountRef = useRef(0);
  const latestFrameRef = useRef('');
  const handleFrame = useCallback((base64: string) => {
    latestFrameRef.current = base64;
    frameCountRef.current += 1;

    // Every frame goes to Live API for real-time awareness (every 2s from CameraFeed)
    geminiLive.sendFrame(base64);

    // Every 3rd frame (6s) goes to backend for structured JSON analysis
    if (frameCountRef.current % 3 === 0) {
      scubaSocket.sendFrame(base64, headingRef.current, accelRef.current);
    }
  }, []);

  // ── Demo mode: upload video file ──
  const handleDemoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setDemoVideo(url);
    }
  }, []);

  // ── Marine ID: "What is this?" trigger ──
  const handleIdentify = useCallback(() => {
    const freshFrame = cameraRef.current?.captureFrame() || latestFrameRef.current;
    if (!freshFrame) return;

    setResponses(prev => [{
      agent: 'bio',
      type: 'info',
      content: 'Identifying species...',
      priority: 'low',
      _ts: Date.now(),
    }, ...prev].slice(0, 3));

    scubaSocket.sendIdentify(freshFrame, "What is this?");
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

  const endDive = useCallback(() => {
    audioCapture.stop();
    scubaSocket.disconnect();
    geminiLive.disconnect();
    setIsStarted(false);
    setBackendConnected(false);
    setLiveConnected(false);
    setResponses([]);
    setShowMap(false);
    setShowAgentCards(false);
    setDemoVideo(null);
    setMapAnalysis(null);
    setMapError(null);
    mapLockedRef.current = false;
    setNavDistance({ total: 0, step: 0, stepIndex: 0 });
    setDiveState({
      depth: 12.4, airPressure: 185, bottomTime: 0,
      heading: 245, waterTemp: 24, isRecording: false, isListening: false,
    });
    frameCountRef.current = 0;
    headingRef.current = 245;
    hasRealGaugeData.current = false;
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <AnimatePresence>
        {!isStarted && <LandingPage onStart={(code) => { setAccessCode(code); setIsStarted(true); }} />}
      </AnimatePresence>

      {isStarted && (
        <>
          <CameraFeed ref={cameraRef} onFrame={handleFrame} isStreaming={isStarted} demoVideoUrl={demoVideo} />
          <HUD state={diveState} compassAvailable={compassAvailable} />
          <ResponseOverlay responses={responses} />

          {/* Connection indicators — positioned below HUD top bar */}
          <div className="absolute top-20 left-6 z-30 flex flex-col gap-2">
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
              onClick={handleIdentify}
              className="p-4 rounded-full bg-dive-cyan/20 border border-dive-cyan/50 text-dive-cyan active:scale-90 active:bg-dive-cyan/40 transition-all shadow-[0_0_15px_rgba(0,242,255,0.2)]"
            >
              <Fish className="w-6 h-6" />
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

            <button
              onClick={() => demoInputRef.current?.click()}
              className={`p-4 rounded-full glass-panel transition-all active:scale-90 ${demoVideo ? 'text-dive-cyan border-dive-cyan/50' : 'text-white/60'}`}
            >
              <Upload className="w-6 h-6" />
            </button>
            <input
              ref={demoInputRef}
              type="file"
              accept="video/*"
              onChange={handleDemoUpload}
              className="hidden"
            />

            <button
              onClick={() => setShowAgentCards(!showAgentCards)}
              className={`p-4 rounded-full glass-panel transition-all active:scale-90 ${showAgentCards ? 'text-dive-cyan border-dive-cyan/50' : 'text-white/60'}`}
              title={showAgentCards ? 'Hide agent cards' : 'Show agent cards'}
            >
              <MessageSquare className="w-6 h-6" />
            </button>

            <button
              onClick={endDive}
              className="p-4 rounded-full glass-panel text-dive-red/80 active:scale-90 hover:bg-dive-red/10 transition-all"
              title="End Dive"
            >
              <Power className="w-6 h-6" />
            </button>
          </div>

          {/* Map Upload Bottom Sheet */}
          <AnimatePresence>
            {showMap && (
              <MapUpload
                onUpload={(base64) => { setMapError(null); setMapAnalysis(null); mapLockedRef.current = false; scubaSocket.sendMap(base64); }}
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

          {/* Holographic Map (visible when map analyzed and sheet closed) */}
          {!showMap && mapAnalysis?.route_steps && mapAnalysis.route_steps.length > 0 && (
            <HoloMap
              routeSteps={mapAnalysis.route_steps}
              landmarks={mapAnalysis.landmarks || []}
              entryPoint={mapAnalysis.entry_point || ''}
              exitPoint={mapAnalysis.exit_point || ''}
              currentHeading={diveState.heading}
              stepIndex={navDistance.stepIndex}
              stepDistance={navDistance.step}
              totalDistance={navDistance.total}
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
