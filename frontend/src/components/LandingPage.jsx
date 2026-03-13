import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Compass,
  Fish,
  Gauge,
  ShieldAlert,
  Camera,
  Play,
  ChevronDown,
  Waves,
  Eye,
  Mic,
  Map,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Compass,
    title: 'Navigation',
    desc: 'Upload a hand-drawn dive site map and get real-time compass-correlated route guidance underwater.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    iconColor: 'text-cyan-400',
  },
  {
    icon: Fish,
    title: 'Marine ID',
    desc: 'Point your camera at any creature — get instant species identification, safety level, and fun facts.',
    gradient: 'from-emerald-500/20 to-green-500/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Gauge,
    title: 'Gauge Reading',
    desc: 'AI reads your analog SPG and depth gauge in real-time, alerting you when it\'s time to turn around.',
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-400',
  },
  {
    icon: ShieldAlert,
    title: 'Hazard Alerts',
    desc: 'Continuous monitoring for rapid depth changes, low visibility, currents, and entanglement risks.',
    gradient: 'from-red-500/20 to-rose-500/20',
    iconColor: 'text-red-400',
  },
]

const STEPS = [
  { icon: Camera, text: 'Choose live camera or load demo dive footage' },
  { icon: Map, text: 'Upload or select a dive site map for navigation' },
  { icon: Eye, text: 'The AI watches your feed and reads gauges in real-time' },
  { icon: Mic, text: 'Ask questions by voice — get instant spoken answers' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
}

export default function LandingPage({ onStartLive, onStartDemo }) {
  const [entering, setEntering] = useState(false)

  const handleStart = (cb) => {
    setEntering(true)
    setTimeout(() => cb(), 400)
  }

  return (
    <div className={`min-h-dvh bg-navy-deepest text-ice overflow-y-auto transition-opacity duration-400 ${entering ? 'opacity-0' : 'opacity-100'}`}>
      <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 sm:px-6">
        {/* ── Hero ── */}
        <section className="relative w-full max-w-3xl overflow-hidden pb-14 pt-16 text-center">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/8 blur-3xl" />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/30 to-blue-600/30 backdrop-blur-sm">
              <Waves className="h-10 w-10 text-cyan-400" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-3 text-5xl font-bold tracking-tight"
          >
            scuba<span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">.ai</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-steel"
          >
            Your multimodal AI dive buddy. Real-time vision analysis, voice alerts, and safety monitoring — powered by Gemini.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          >
            <button
              onClick={() => handleStart(onStartLive)}
              className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all duration-200 hover:shadow-cyan-500/40 active:scale-[0.97] cursor-pointer"
            >
              <Camera className="h-5 w-5 transition-transform group-hover:scale-110" />
              Start Live Dive
            </button>
            <button
              onClick={() => handleStart(onStartDemo)}
              className="group flex flex-1 items-center justify-center gap-2.5 rounded-2xl border border-steel/25 bg-navy-dark/80 px-6 py-4 text-base font-medium text-ice transition-all duration-200 hover:border-steel/40 hover:bg-navy-dark active:scale-[0.97] cursor-pointer"
            >
              <Play className="h-5 w-5 transition-transform group-hover:scale-110" />
              Demo Mode
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-10"
          >
            <ChevronDown className="mx-auto h-5 w-5 animate-bounce text-steel/40" />
          </motion.div>
        </section>

        {/* ── Features ── */}
        <section className="w-full pb-14">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={fadeUp}
            custom={0}
            className="mb-8 text-center text-xs font-medium uppercase tracking-[0.2em] text-steel/70"
          >
            Core Capabilities
          </motion.h2>
          <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-30px' }}
                variants={fadeUp}
                custom={i + 1}
                className={`group relative flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-br p-5 transition-colors duration-300 hover:border-white/[0.12] ${f.gradient}`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-navy-deepest/60 ${f.iconColor}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-ice">{f.title}</h3>
                <p className="text-sm leading-relaxed text-steel/80">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="w-full pb-14">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={fadeUp}
            custom={0}
            className="mb-8 text-center text-xs font-medium uppercase tracking-[0.2em] text-steel/70"
          >
            How It Works
          </motion.h2>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-20px' }}
                variants={fadeUp}
                custom={i + 1}
                className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-navy-dark/40 px-5 py-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20">
                  <s.icon className="h-4.5 w-4.5 text-cyan-400" />
                </div>
                <p className="text-sm leading-snug text-ice/90">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="w-full pb-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={1}
            className="mx-auto w-full max-w-2xl rounded-2xl border border-cyan-400/10 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 p-6 text-center"
          >
            <p className="mb-4 text-sm text-ice/90">Ready to dive in?</p>
            <div className="mx-auto flex w-full max-w-xl gap-3">
              <button
                onClick={() => handleStart(onStartLive)}
                className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.97] cursor-pointer"
              >
                Live Dive
              </button>
              <button
                onClick={() => handleStart(onStartDemo)}
                className="flex-1 rounded-xl border border-steel/25 bg-navy-dark/80 py-3 text-sm font-medium text-ice transition-all active:scale-[0.97] cursor-pointer"
              >
                Demo Mode
              </button>
            </div>
          </motion.div>
        </section>

        {/* ── Footer ── */}
        <footer className="w-full pb-10 pt-4 text-center">
          <p className="text-xs text-steel/40">
            Powered by Gemini &middot; Built for Google AI Hackathon 2026
          </p>
        </footer>
      </main>
    </div>
  )
}
