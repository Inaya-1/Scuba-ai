import { useRef, useState } from 'react'
import { MapPin, Upload, X } from 'lucide-react'

const CACHED_MAPS = [
  { id: 'reef-cove', label: 'Reef Cove', src: '/maps/reef-cove.jpg', desc: 'Shallow reef with 3 entry points' },
  { id: 'blue-hole', label: 'Blue Hole', src: '/maps/blue-hole.jpg', desc: 'Deep wall dive, max 40m' },
  { id: 'wreck-site', label: 'USS Liberty Wreck', src: '/maps/wreck-site.jpg', desc: 'Shore entry wreck dive' },
]

export default function DiveMapGallery({ onSelect, onUpload }) {
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      onUpload(base64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCachedSelect = async (map) => {
    try {
      const resp = await fetch(map.src)
      const blob = await resp.blob()
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        onSelect(base64, map)
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      console.error('Failed to load cached map:', err)
    }
  }

  if (!expanded) {
    return (
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-3.5 flex items-center justify-center gap-2 bg-navy-dark/80 backdrop-blur-md text-ice font-medium rounded-2xl border border-white/[0.08] active:bg-navy-dark transition-colors cursor-pointer"
        >
          <MapPin className="w-4 h-4 text-cyan-400" />
          Dive Maps
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-navy-deepest/95 backdrop-blur-xl rounded-t-3xl p-5 max-h-[60vh] overflow-y-auto border-t border-white/[0.08]"
      style={{ animation: 'slide-up 0.3s ease-out' }}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-ice font-semibold text-sm">Dive Site Maps</h3>
        <button
          onClick={() => setExpanded(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-navy-dark/60 text-steel hover:text-ice transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {CACHED_MAPS.map((map) => (
          <button
            key={map.id}
            onClick={() => { handleCachedSelect(map); setExpanded(false) }}
            className="w-full flex items-center gap-3 bg-navy-dark/40 border border-white/[0.05] rounded-xl p-3.5 text-left active:bg-navy-dark transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-ice text-sm font-medium">{map.label}</p>
              <p className="text-steel/60 text-xs">{map.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-3 flex items-center justify-center gap-2 bg-navy/60 border border-white/[0.08] text-ice rounded-xl text-sm active:bg-navy-dark transition-colors cursor-pointer"
      >
        <Upload className="w-4 h-4 text-steel" />
        Upload Custom Map
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  )
}
