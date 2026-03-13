import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import LandingPage from './components/LandingPage'
import CameraFeed from './components/CameraFeed'
import VideoSource from './components/VideoSource'
import StatusBar from './components/StatusBar'
import ResponseOverlay from './components/ResponseOverlay'
import DiveMapGallery from './components/DiveMapGallery'
import './index.css'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export default function App() {
  const [page, setPage] = useState('landing') // 'landing' | 'dive'
  const [source, setSource] = useState('camera') // 'camera' | 'video'
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('idle')
  const [response, setResponse] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setConnected(true)
      setStatus('watching')
      console.log('[WS] Connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setResponse(data)
        setStatus('watching')
      } catch (err) {
        console.error('[WS] Parse error:', err)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      setStatus('idle')
      console.log('[WS] Disconnected, reconnecting in 3s...')
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
      ws.close()
    }

    wsRef.current = ws
  }, [])

  // Toggle scroll lock based on page
  useEffect(() => {
    if (page === 'dive') {
      document.body.classList.add('dive-mode')
    } else {
      document.body.classList.remove('dive-mode')
    }
  }, [page])

  // Only connect WebSocket when entering dive mode
  useEffect(() => {
    if (page !== 'dive') return
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [page, connect])

  const sendFrame = useCallback((base64) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    setStatus('analyzing')
    wsRef.current.send(JSON.stringify({
      type: 'frame',
      payload: base64,
      metadata: { timestamp: Date.now() },
    }))
  }, [])

  const sendMap = useCallback((base64) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    setStatus('analyzing')
    wsRef.current.send(JSON.stringify({
      type: 'map_upload',
      payload: base64,
      metadata: { timestamp: Date.now() },
    }))
  }, [])

  const startLive = () => { setSource('camera'); setPage('dive') }
  const startDemo = () => { setSource('video'); setPage('dive') }
  const backToLanding = () => { setPage('landing'); setResponse(null); setStatus('idle') }

  if (page === 'landing') {
    return <LandingPage onStartLive={startLive} onStartDemo={startDemo} />
  }

  return (
    <div className="relative w-full h-full">
      {source === 'camera'
        ? <CameraFeed onFrame={sendFrame} fps={1} />
        : <VideoSource onFrame={sendFrame} fps={1} />
      }
      <StatusBar status={status} connected={connected} />
      <ResponseOverlay response={response} />
      <DiveMapGallery onSelect={sendMap} onUpload={sendMap} />

      {/* Back button */}
      <button
        onClick={backToLanding}
        className="absolute top-3 left-14 z-30 flex items-center gap-1.5 text-steel/60 text-xs bg-navy-deepest/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/[0.05] hover:text-ice hover:border-white/[0.1] active:bg-navy-dark transition-all cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>
    </div>
  )
}