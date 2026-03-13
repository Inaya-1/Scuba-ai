import { Circle } from 'lucide-react'

export default function StatusBar({ status, connected }) {
  const dotColor = connected ? 'bg-safe-green' : 'bg-alert-red'
  const label = !connected
    ? 'Connecting...'
    : status === 'analyzing'
      ? 'Analyzing...'
      : 'Watching...'

  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-navy-deepest/80 backdrop-blur-md border-b border-white/[0.05]">
      <div className="flex items-center gap-2.5">
        <span
          className={`w-2.5 h-2.5 rounded-full ${dotColor}`}
          style={{ animation: connected ? 'pulse-dot 2s ease-in-out infinite' : 'none' }}
        />
        <span className="text-ice/80 text-sm font-medium">{label}</span>
      </div>
      <span className="text-steel/60 text-xs font-mono tracking-wider">scuba.ai</span>
    </div>
  )
}
