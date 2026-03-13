import { useRef } from 'react'

export default function MapUpload({ onUpload }) {
  const inputRef = useRef(null)

  const handleChange = (e) => {
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

  return (
    <div className="absolute bottom-4 left-4 right-4 z-10">
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-3 bg-navy/80 backdrop-blur-sm text-ice font-medium rounded-xl border border-steel/30 active:bg-navy-dark transition-colors"
      >
        📷 Upload Dive Map
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}
