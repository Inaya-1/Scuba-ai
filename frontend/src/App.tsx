import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Mic, Map as MapIcon, Settings, Info, X, Navigation, Fish, Upload } from 'lucide-react';
import { LandingPage } from './components/LandingPage';
import { CameraFeed, CameraFeedHandle } from './components/CameraFeed';
import { HUD } from './components/HUD';
import { ResponseOverlay } from './components/ResponseOverlay';
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
  const [demoVideo, setDemoVideo] = useState<string | null>(null);
  const isListeningRef = useRef(false);
  const demoInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<CameraFeedHandle>(null);

  // ── Backend WebSocket: structured analysis + map uploads ──
  useEffect(() => {
    if (!isStarted) return;

    scubaSocket.connect({
      onResponse: (res) => {
        setResponses(prev => {
          // Replace any "Identifying species..." loading cards when a real bio response arrives
          const filtered = res.agent === 'bio'
            ? prev.filter(r => !(r.agent === 'bio' && r.content === 'Identifying species...'))
            : prev;
          return [res, ...filtered].slice(0, 3);
        });

        if (res.metadata) {
          setDiveState(prev => ({
            ...prev,
            ...(res.metadata!.depth_m != null && { depth: res.metadata!.depth_m }),
            ...(res.metadata!.depth_ft != null && { depth: res.metadata!.depth_ft * 0.3048 }),
            ...(res.metadata!.psi != null && { airPressure: Math.round(res.metadata!.psi / 14.5) }),
            ...(res.metadata!.bar != null && { airPressure: res.metadata!.bar }),
            ...(res.metadata!.temp_c != null && { waterTemp: res.metadata!.temp_c }),
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

  // ── Gemini Live API: disabled to conserve free-tier quota ──
  // The Live API connection itself consumes gemini-2.0-flash quota on connect.
  // All identification now goes through the backend (gemini-2.5-flash).
  // Re-enable this when you have a paid API key or fresh quota.

  // ── Auto-dismiss response cards after 8 seconds ──
  useEffect(() => {
    if (responses.length === 0) return;
    const timer = setTimeout(() => {
      setResponses(prev => prev.slice(0, -1));
    }, 8000);
    return () => clearTimeout(timer);
  }, [responses]);

  // ── Simulate dive metrics ──
  useEffect(() => {
    if (!isStarted) return;

    const interval = setInterval(() => {
      setDiveState(prev => ({
        ...prev,
        bottomTime: prev.bottomTime + 1,
        depth: Math.max(0, prev.depth + (Math.random() - 0.5) * 0.1),
        heading: (prev.heading + Math.floor((Math.random() - 0.5) * 2) + 360) % 360,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted]);

  // ── Frame handler: send to both backend (slow/structured) and Live API (fast/realtime) ──
  const frameCountRef = useRef(0);
  const latestFrameRef = useRef('');
  const handleFrame = useCallback((base64: string) => {
    latestFrameRef.current = base64;
    frameCountRef.current += 1;

    // Frame streaming to Live API disabled to conserve quota.
    // Frames are cached in latestFrameRef for on-demand identification via Fish button.
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
    // Capture a fresh frame right now instead of using the cached one (up to 2s stale)
    const freshFrame = cameraRef.current?.captureFrame() || latestFrameRef.current;
    if (!freshFrame) return;

    // Immediate loading feedback
    setResponses(prev => [{
      agent: 'bio',
      type: 'info',
      content: 'Identifying species...',
      priority: 'low',
    }, ...prev].slice(0, 3));

    // Use backend (gemini-2.5-flash with thinking disabled) — reliable quota
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

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <AnimatePresence>
        {!isStarted && <LandingPage onStart={() => setIsStarted(true)} />}
      </AnimatePresence>

      {isStarted && (
        <>
          <CameraFeed ref={cameraRef} onFrame={handleFrame} onTap={handleIdentify} isStreaming={isStarted} demoVideoUrl={demoVideo} />
          <HUD state={diveState} />
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
              onClick={handleIdentify}
              className="p-4 rounded-full bg-dive-cyan/20 border border-dive-cyan/50 text-dive-cyan active:scale-90 active:bg-dive-cyan/40 transition-all shadow-[0_0_15px_rgba(0,242,255,0.2)]"
            >
              <Fish className="w-6 h-6" />
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
          </div>

          {/* Map Overlay */}
          <AnimatePresence>
            {showMap && (
              <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <div className="relative glass-panel w-full max-w-4xl aspect-video p-2 border-dive-cyan/20">
                  <button
                    onClick={() => setShowMap(false)}
                    className="absolute top-4 right-4 p-2 glass-panel text-white/60 hover:text-white z-10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <img
                    src="https://picsum.photos/seed/divemap/1200/800"
                    alt="Dive Map"
                    className="w-full h-full object-cover rounded-xl opacity-80"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-8 left-8 glass-panel p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Navigation className="w-4 h-4 text-dive-cyan" />
                      <span className="hud-text">Current Location</span>
                    </div>
                    <p className="font-display font-bold">REEF COVE - SECTOR 4</p>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

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
