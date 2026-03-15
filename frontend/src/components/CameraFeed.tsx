import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Camera, CameraOff } from 'lucide-react';

interface CameraFeedProps {
  onFrame: (base64: string) => void;
  onTap?: () => void;
  isStreaming: boolean;
  demoVideoUrl?: string | null;
}

export interface CameraFeedHandle {
  captureFrame: () => string | null;
}

export const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(({ onFrame, onTap, isStreaming, demoVideoUrl }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Expose captureFrame for on-demand fresh frame capture
  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return null;
      const context = canvas.getContext('2d');
      if (!context) return null;
      const scale = Math.min(640 / video.videoWidth, 360 / video.videoHeight, 1);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    },
  }));
  const [error, setError] = useState<string | null>(null);

  // Camera mode
  useEffect(() => {
    if (demoVideoUrl) return; // Skip camera when in demo mode
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError("Camera access denied. Please check permissions.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [demoVideoUrl]);

  // Demo video mode
  useEffect(() => {
    if (!demoVideoUrl || !videoRef.current) return;
    videoRef.current.srcObject = null;
    videoRef.current.src = demoVideoUrl;
    videoRef.current.loop = true;
    videoRef.current.play().catch(console.error);
  }, [demoVideoUrl]);

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.videoWidth) {
          // Downscale to 640x360 for faster upload and API processing
          const scale = Math.min(640 / video.videoWidth, 360 / video.videoHeight, 1);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
          onFrame(base64);
        }
      }
    }, 2000); // Send frame every 2 seconds for analysis

    return () => clearInterval(interval);
  }, [isStreaming, onFrame]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden" onClick={() => onTap?.()}>
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-dive-red p-6 text-center">
          <CameraOff className="w-12 h-12 mb-4" />
          <p className="font-display font-bold">{error}</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover opacity-80"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* HUD Vignette */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_40%,rgba(0,0,0,0.4)_100%)]" />
          
          {/* Scanline */}
          <div className="scanline" />
          
        </>
      )}
    </div>
  );
});
