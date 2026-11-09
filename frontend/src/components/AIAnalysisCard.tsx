import React from 'react';
import { Brain, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

interface AIAnalysisCardProps {
  sohEstimate?: number;
  healthConfidence?: number;
  healthStatus?: string;
  degradationTrend?: string;
  degradationConfidence?: number;
  degradationStatus?: string;
}

export const AIAnalysisCard: React.FC<AIAnalysisCardProps> = ({
  sohEstimate = 84,
  healthConfidence = 92,
  healthStatus = 'Stable',
  degradationTrend = 'Low',
  degradationConfidence = 87,
  degradationStatus = 'Normal',
}) => {
  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-[#142340]">
        <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Brain className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-slate-200">AI Analysis</h3>
      </div>

      {/* Two Model Sub-Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 my-2">
        {/* Model 1: Health Prediction */}
        <div className="bg-[#060a14] border border-[#121f38] rounded-xl p-3.5 flex flex-col justify-between hover:border-cyan-500/30 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200">
                Model 1: <span className="text-cyan-400 font-normal">Health Prediction</span>
              </span>
              <Brain className="w-4 h-4 text-cyan-400/80" />
            </div>

            <div className="mt-2.5">
              <span className="text-[10px] text-slate-400 block">SoH Estimate</span>
              <span className="text-xl font-black text-white font-mono leading-tight">
                {sohEstimate}%
              </span>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#0e1a2e] rounded-full mt-1.5 overflow-hidden border border-[#142340]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sohEstimate}%` }}
                  transition={{ duration: 1 }}
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#121f38] text-[10px]">
            <span className="text-slate-400">
              Confidence <span className="text-white font-mono font-bold">{healthConfidence}%</span>
            </span>
            <div className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rotate-45 bg-emerald-400 rounded-[0.5px] inline-block shadow-[0_0_4px_#34d399]" />
              <span>{healthStatus}</span>
            </div>
          </div>
        </div>

        {/* Model 2: Degradation Pattern */}
        <div className="bg-[#060a14] border border-[#121f38] rounded-xl p-3.5 flex flex-col justify-between hover:border-cyan-500/30 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200">
                Model 2: <span className="text-cyan-400 font-normal">Degradation Pattern</span>
              </span>
              <Activity className="w-4 h-4 text-cyan-400/80" />
            </div>

            <div className="mt-2.5">
              <span className="text-[10px] text-slate-400 block">Degradation Trend</span>
              <span className="text-xl font-black text-white font-mono leading-tight">
                {degradationTrend}
              </span>

              {/* Mini wave preview */}
              <div className="w-full h-1.5 mt-1.5 flex items-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-emerald-500/20 via-emerald-400 to-cyan-400 rounded" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#121f38] text-[10px]">
            <span className="text-slate-400">
              Confidence <span className="text-white font-mono font-bold">{degradationConfidence}%</span>
            </span>
            <div className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rotate-45 bg-emerald-400 rounded-[0.5px] inline-block shadow-[0_0_4px_#34d399]" />
              <span>{degradationStatus}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] flex items-center justify-between">
        <span>Ensemble Model Architecture</span>
        <span className="text-emerald-400/90 font-mono">Calibrated Posterior Valid</span>
      </div>
    </div>
  );
};
