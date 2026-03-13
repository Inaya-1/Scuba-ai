import React from 'react';
import { motion } from 'motion/react';
import { Activity, Shield, Navigation, Fish, AlertTriangle } from 'lucide-react';
import { AgentResponse } from '../types';

interface ResponseOverlayProps {
  responses: AgentResponse[];
}

export const ResponseOverlay: React.FC<ResponseOverlayProps> = ({ responses }) => {
  return (
    <div className="absolute top-24 right-6 w-80 space-y-4 pointer-events-none">
      {responses.map((res, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.95 }}
          className={`glass-panel p-4 border-l-4 ${
            res.priority === 'critical' ? 'border-l-dive-red' : 
            res.priority === 'high' ? 'border-l-dive-orange' : 'border-l-dive-cyan'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {res.agent === 'safety' && <Shield className="w-4 h-4 text-dive-red" />}
            {res.agent === 'bio' && <Fish className="w-4 h-4 text-dive-cyan" />}
            {res.agent === 'nav' && <Navigation className="w-4 h-4 text-dive-orange" />}
            {res.agent === 'manager' && <Activity className="w-4 h-4 text-white" />}
            <span className="hud-text">{res.agent} agent</span>
          </div>
          <p className="text-sm font-medium leading-relaxed">
            {res.content}
          </p>
          {res.type === 'hazard' && (
            <div className="mt-2 flex items-center gap-1 text-dive-red font-bold text-[10px] uppercase">
              <AlertTriangle className="w-3 h-3" />
              Immediate Action Required
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
};
