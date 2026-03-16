import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, X, Loader2, MapPin, Navigation, CheckCircle, AlertTriangle, RefreshCw, Check } from 'lucide-react';

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

interface MapUploadProps {
  onUpload: (base64: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onRefine: (feedback: string) => void;
  analysis: MapAnalysis | null;
  error: string | null;
}

const LOADING_STEPS = [
  { label: 'Uploading image...', delay: 0 },
  { label: 'Sending to Gemini Vision...', delay: 1500 },
  { label: 'Extracting landmarks...', delay: 4000 },
  { label: 'Building route...', delay: 7000 },
];

export function MapUpload({ onUpload, onClose, onConfirm, onRefine, analysis, error }: MapUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  // Animate through loading steps
  useEffect(() => {
    if (!isLoading) { setLoadingStep(0); return; }
    const timers = LOADING_STEPS.slice(1).map((step, i) =>
      setTimeout(() => setLoadingStep(i + 1), step.delay)
    );
    // Timeout after 30s
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 30000);
    return () => { timers.forEach(clearTimeout); clearTimeout(timeout); };
  }, [isLoading]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      setIsLoading(true);
      onUpload(base64);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // Clear loading when analysis or error arrives
  if (isLoading && (analysis || error)) {
    setIsLoading(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-lg glass-panel rounded-b-none p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-dive-cyan" />
            <h2 className="font-display font-bold text-lg">Dive Map</h2>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload buttons */}
        {!preview && !analysis && (
          <div className="flex gap-3 mb-5">
            <button
              onClick={() => captureInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-6 glass-panel hover:border-dive-cyan/30 transition-colors cursor-pointer"
            >
              <Camera className="w-8 h-8 text-dive-cyan" />
              <span className="hud-text text-xs">Take Photo</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 py-6 glass-panel hover:border-dive-cyan/30 transition-colors cursor-pointer"
            >
              <Upload className="w-8 h-8 text-dive-cyan" />
              <span className="hud-text text-xs">Choose File</span>
            </button>
            <input
              ref={captureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFileChange}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* Preview + Loading */}
        {preview && (
          <div className="mb-5">
            <div className="relative rounded-xl overflow-hidden">
              <img src={preview} alt="Dive map" className="w-full h-48 object-cover" />
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 p-4">
                  <Loader2 className="w-8 h-8 text-dive-cyan animate-spin" />
                  <div className="space-y-1.5 w-full max-w-[200px]">
                    {LOADING_STEPS.map((step, i) => (
                      <div key={i} className={`flex items-center gap-2 transition-opacity duration-300 ${i <= loadingStep ? 'opacity-100' : 'opacity-30'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${i < loadingStep ? 'bg-green-400' : i === loadingStep ? 'bg-dive-cyan animate-pulse' : 'bg-white/20'}`} />
                        <span className="hud-text text-[9px]">{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="mb-5 glass-panel border-dive-red/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-dive-red flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-white/80">{error}</p>
                <button
                  onClick={() => setPreview(null)}
                  className="mt-2 text-xs text-dive-cyan hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Analysis results */}
        {analysis && (
          <div className="space-y-4 max-h-60 overflow-y-auto">
            {/* Landmarks */}
            {analysis.landmarks?.length > 0 && (
              <div>
                <span className="hud-text text-[9px] text-white/40 block mb-2">Landmarks</span>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.landmarks.map((lm, i) => (
                    <span key={i} className="px-2.5 py-1 glass-panel text-xs font-mono text-dive-cyan rounded-full">
                      <MapPin className="w-3 h-3 inline mr-1" />{lm}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Entry/Exit */}
            <div className="grid grid-cols-2 gap-2">
              <div className="glass-panel p-3">
                <span className="hud-text text-[9px] text-white/40 block mb-1">Entry</span>
                <p className="text-xs text-white/80">{analysis.entry_point}</p>
              </div>
              <div className="glass-panel p-3">
                <span className="hud-text text-[9px] text-white/40 block mb-1">Exit</span>
                <p className="text-xs text-white/80">{analysis.exit_point}</p>
              </div>
            </div>

            {/* Route Steps */}
            {analysis.route_steps?.length > 0 && (
              <div>
                <span className="hud-text text-[9px] text-white/40 block mb-2">Route</span>
                <div className="space-y-1.5">
                  {analysis.route_steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3 glass-panel p-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-dive-cyan/20 flex items-center justify-center">
                        <span className="text-dive-cyan text-xs font-bold">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80">{step.description}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="hud-text text-[9px]">{step.heading}°</span>
                          {step.distance_m && <span className="hud-text text-[9px]">{step.distance_m}m</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confidence */}
            <div className="flex items-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 text-dive-cyan animate-spin" />
                  <span className="hud-text text-[9px] text-white/50">Computing confidence...</span>
                </>
              ) : analysis.confidence != null ? (
                <>
                  <CheckCircle className={`w-4 h-4 ${analysis.confidence > 0.7 ? 'text-green-400' : analysis.confidence > 0.4 ? 'text-dive-orange' : 'text-dive-red'}`} />
                  <span className="hud-text text-[9px]">Confidence: {Math.round(analysis.confidence * 100)}%</span>
                </>
              ) : null}
            </div>

            {/* Refine input */}
            {showRefine && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  placeholder="e.g. There's a wreck near the entry point..."
                  className="flex-1 px-3 py-2 glass-panel text-xs text-white placeholder-white/30 bg-transparent border-white/10 focus:border-dive-cyan/50 outline-none rounded"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && refineText.trim()) {
                      onRefine(refineText.trim());
                      setRefineText('');
                      setShowRefine(false);
                      setIsLoading(true);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (refineText.trim()) {
                      onRefine(refineText.trim());
                      setRefineText('');
                      setShowRefine(false);
                      setIsLoading(true);
                    }
                  }}
                  className="px-3 py-2 bg-dive-cyan/20 border border-dive-cyan/50 text-dive-cyan text-xs rounded active:scale-95 transition-all"
                >
                  Send
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex-1 py-2.5 bg-dive-cyan/20 border border-dive-cyan/50 text-dive-cyan rounded transition-all active:scale-95 flex items-center justify-center gap-2 hud-text text-xs"
              >
                <Check className="w-4 h-4" />
                Confirm Route
              </button>
              <button
                onClick={() => setShowRefine(!showRefine)}
                className={`flex-1 py-2.5 glass-panel transition-all active:scale-95 flex items-center justify-center gap-2 hud-text text-xs ${showRefine ? 'border-dive-orange/50 text-dive-orange' : 'hover:border-dive-cyan/30'}`}
              >
                <RefreshCw className="w-4 h-4" />
                Refine
              </button>
            </div>

            {/* Re-upload button */}
            <button
              onClick={() => { setPreview(null); setShowRefine(false); setRefineText(''); }}
              className="w-full py-2 glass-panel hover:border-white/20 transition-colors hud-text text-[10px] text-white/40"
            >
              Upload New Map
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
