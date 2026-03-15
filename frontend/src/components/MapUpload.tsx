import { useState, useRef, ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, X, Loader2, MapPin, Navigation, CheckCircle } from 'lucide-react';

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
  analysis: MapAnalysis | null;
}

export function MapUpload({ onUpload, onClose, analysis }: MapUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setPreview(reader.result as string);
      setIsLoading(true);
      onUpload(base64);
      // Loading state will clear when analysis arrives via props
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // Clear loading when analysis arrives
  if (isLoading && analysis) {
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
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-dive-cyan animate-spin" />
                  <span className="hud-text">Analyzing map...</span>
                </div>
              )}
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
            {analysis.confidence != null && (
              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${analysis.confidence > 0.7 ? 'text-green-400' : analysis.confidence > 0.4 ? 'text-dive-orange' : 'text-dive-red'}`} />
                <span className="hud-text text-[9px]">Confidence: {Math.round(analysis.confidence * 100)}%</span>
              </div>
            )}

            {/* Re-upload button */}
            <button
              onClick={() => { setPreview(null); }}
              className="w-full py-2.5 glass-panel hover:border-dive-cyan/30 transition-colors hud-text text-xs"
            >
              Upload New Map
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
