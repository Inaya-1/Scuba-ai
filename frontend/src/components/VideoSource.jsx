import { useEffect, useRef, useState } from 'react'
import { Play, Link as LinkIcon, ArrowLeft, Film, Anchor, Moon } from 'lucide-react'

const DEMO_VIDEOS = [
  { id: 'reef', label: 'Coral Reef Dive', icon: Anchor, src: '/demo/reef-dive.mp4' },
  { id: 'wreck', label: 'Wreck Exploration', icon: Film, src: '/demo/wreck-dive.mp4' },
  { id: 'night', label: 'Night Dive', icon: Moon, src: '/demo/night-dive.mp4' },
]

export default function VideoSource({ onFrame, fps = 1 }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [customUrl, setCustomUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(null)

  const loadVideo = (src) => {
    setError(null)
    setSelectedVideo(src)
    setPlaying(false)
  }

  const handleCustomUrl = () => {
    if (!customUrl.trim()) return
    loadVideo(customUrl.trim())
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video || !selectedVideo) return

    video.src = selectedVideo
    video.load()

    const onCanPlay = () => {
      video.play().then(() => setPlaying(true)).catch(() => setError('Failed to play video.'))
    }
    const onError = () => setError('Could not load video. Check the URL or file path.')

    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onError)
    return () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }
  }, [selectedVideo])

  useEffect(() => {
    if (!onFrame || !playing) return

    const interval = setInterval(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.paused) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      const base64 = dataUrl.split(',')[1]
      onFrame(base64)
    }, 1000 / fps)

    return () => clearInterval(interval)
  }, [onFrame, fps, playing])

  if (!selectedVideo) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-deepest p-6 gap-8">
        <h2 className="text-ice text-lg font-semibold">Select Demo Footage</h2>

        <div className="flex flex-col gap-2.5 w-full max-w-sm">
          {DEMO_VIDEOS.map((v) => (
            <button
              key={v.id}
              onClick={() => loadVideo(v.src)}
              className="w-full flex items-center gap-3 py-3.5 px-4 bg-navy-dark/50 border border-white/[0.06] text-ice rounded-2xl text-sm hover:border-white/[0.12] active:bg-navy-dark transition-all cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center shrink-0">
                <v.icon className="w-4 h-4 text-cyan-400" />
              </div>
              {v.label}
            </button>
          ))}
        </div>

        <div className="w-full max-w-sm">
          <p className="text-steel/60 text-xs mb-2.5 text-center">Or paste a direct video URL</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-navy-dark/50 border border-white/[0.06] rounded-xl px-3 py-2.5 focus-within:border-cyan-500/40 transition-colors">
              <LinkIcon className="w-4 h-4 text-steel/40 shrink-0" />
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomUrl()}
                placeholder="https://example.com/dive.mp4"
                className="flex-1 bg-transparent text-ice text-sm outline-none placeholder:text-steel/30"
              />
            </div>
            <button
              onClick={handleCustomUrl}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl text-sm active:scale-95 transition-transform cursor-pointer"
            >
              Load
            </button>
          </div>
        </div>

        {error && <p className="text-alert-red text-sm text-center">{error}</p>}
      </div>
    )
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        loop
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-navy-deepest/90 z-10">
          <div className="text-center px-6">
            <p className="text-alert-red text-sm mb-4">{error}</p>
            <button
              onClick={() => { setSelectedVideo(null); setError(null) }}
              className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-navy-dark border border-white/[0.08] text-ice rounded-xl text-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Pick Another Video
            </button>
          </div>
        </div>
      )}
    </>
  )
}
