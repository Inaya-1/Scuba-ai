import HazardBanner from './HazardBanner'

export default function ResponseOverlay({ response }) {
  if (!response) return null

  const isHazard = response.type === 'hazard'

  if (isHazard) {
    return <HazardBanner message={response.content} />
  }

  const borderColor = response.type === 'species'
    ? 'border-emerald-400/60'
    : response.type === 'navigation'
      ? 'border-cyan-400/60'
      : 'border-steel/40'

  return (
    <div
      className={`absolute bottom-24 left-4 right-4 z-10 bg-navy-deepest/85 backdrop-blur-xl rounded-2xl p-4 border-l-4 ${borderColor} border border-white/[0.06]`}
      style={{ animation: 'slide-up 0.3s ease-out' }}
    >
      {response.agent && (
        <span className="text-cyan-400/70 text-[10px] uppercase tracking-[0.15em] font-medium mb-1.5 block">
          {response.agent}
        </span>
      )}
      <p className="text-ice/90 text-sm leading-relaxed">{response.content}</p>
      {response.metadata && Object.keys(response.metadata).length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {Object.entries(response.metadata).map(([key, val]) => (
            <span key={key} className="text-steel/80 text-[11px] font-mono bg-navy-dark/60 border border-white/[0.05] px-2 py-1 rounded-md">
              {key}: {val}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
