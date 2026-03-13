import React from 'react';
import { motion } from 'motion/react';
import { Waves, Shield, Navigation, Fish, Play } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStart }) => {
  return (
    <div className="fixed inset-0 z-50 bg-dive-bg flex flex-col items-center justify-center p-6 text-center overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-dive-cyan blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-2xl"
      >
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-dive-cyan rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,242,255,0.4)]">
            <Waves className="text-dive-bg w-8 h-8" />
          </div>
          <h1 className="text-5xl font-display font-bold tracking-tighter">
            SCUBA<span className="text-dive-cyan">.AI</span>
          </h1>
        </div>

        <p className="text-xl text-white/60 mb-12 font-light leading-relaxed">
          The world's first multimodal AI dive buddy. Real-time safety monitoring, 
          marine identification, and navigation assistance for the modern diver.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <FeatureCard 
            icon={<Shield className="w-5 h-5" />} 
            title="Safety First" 
            desc="AI monitors depth, air, and ascent rates." 
          />
          <FeatureCard 
            icon={<Navigation className="w-5 h-5" />} 
            title="Smart Nav" 
            desc="Visual map routing and heading tracking." 
          />
          <FeatureCard 
            icon={<Fish className="w-5 h-5" />} 
            title="Bio ID" 
            desc="Instant identification of marine species." 
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="group relative px-12 py-4 bg-dive-cyan text-dive-bg font-display font-bold text-xl rounded-2xl shadow-[0_0_30px_rgba(0,242,255,0.3)] overflow-hidden transition-all hover:shadow-[0_0_50px_rgba(0,242,255,0.5)]"
        >
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 fill-current" />
            INITIALIZE DIVE MODE
          </div>
        </motion.button>

        <p className="mt-8 text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">
          System Ready // Firmware v2.4.0 // Gemini Multimodal Core
        </p>
      </motion.div>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="glass-panel p-4 text-left border-white/5 hover:border-dive-cyan/30 transition-colors">
    <div className="text-dive-cyan mb-2">{icon}</div>
    <h3 className="font-display font-bold text-sm mb-1">{title}</h3>
    <p className="text-xs text-white/40 leading-snug">{desc}</p>
  </div>
);
