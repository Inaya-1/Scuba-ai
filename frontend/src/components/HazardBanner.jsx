import { useEffect, useState } from 'react'

export default function HazardBanner({ message }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [message])

  if (!visible) return null

  return (
    <div
      className="absolute top-14 left-0 right-0 z-30 bg-alert-red/90 backdrop-blur-sm px-4 py-3"
      style={{ animation: 'slide-down 0.3s ease-out' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">⚠️</span>
        <p className="text-ice font-bold text-sm">{message}</p>
      </div>
    </div>
  )
}
