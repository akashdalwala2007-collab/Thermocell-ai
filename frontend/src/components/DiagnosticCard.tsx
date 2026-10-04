import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldX, Sparkles, Activity } from 'lucide-react';
import { DiagnosticPrediction } from '../services/api';

interface DiagnosticCardProps {
  prediction: DiagnosticPrediction | null;
  isLoading?: boolean;
  selectedCellId?: string;
}

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({
  prediction,
  isLoading = false,
  selectedCellId,
}) => {
  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-center min-h-[160px] animate-pulse">
        <div className="flex items-center gap-2.5 text-indigo-400 font-semibold text-sm">
          <Activity className="w-5 h-5 animate-spin" />
          <span>Executing 10-Second Diagnostic Screening...</span>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          {selectedCellId
            ? `Acquiring pulse telemetry for Cell ${selectedCellId}, evaluating 8×8 spatial thermal frames, and computing ML triage.`
            : 'Acquiring pulse telemetry, evaluating spatial thermal gradients, and computing ML triage classification.'}
        </p>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500">
        Run diagnostic screening to generate second-life triage classification.
      </div>
    );
  }

  const { triage_class, confidence, class_probabilities, recommendation } = prediction;

  const isReuse = triage_class === 'REUSE';
  const isRetire = triage_class === 'RETIRE';

  const badgeConfig = isReuse
    ? {
        bg: 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300',
        badge: 'bg-emerald-500 text-slate-950',
        icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
        title: 'REUSE (Certified Second-Life)',
        subtitle: 'Optimal for low-stress stationary energy storage.',
      }
    : isRetire
    ? {
        bg: 'bg-rose-950/60 border-rose-600/60 text-rose-300',
        badge: 'bg-rose-500 text-slate-950',
        icon: <ShieldX className="w-6 h-6 text-rose-400" />,
        title: 'RETIRE (Safety Lockout)',
        subtitle: 'High internal impedance or runaway risk. Relegate to recycling.',
      }
    : {
        bg: 'bg-amber-950/60 border-amber-600/60 text-amber-300',
        badge: 'bg-amber-500 text-slate-950',
        icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
        title: 'INVESTIGATE (Anomaly Flag)',
        subtitle: 'Intermediate degradation or spatial non-uniformity detected.',
      };

  return (
    <div className={`border rounded-xl p-6 flex flex-col gap-5 ${badgeConfig.bg}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {badgeConfig.icon}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider opacity-80 block">
                Second-Life Screening Verdict
              </span>
              {(prediction.cell_id || selectedCellId) && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-950/70 border border-slate-700/60 text-slate-200">
                  Cell {prediction.cell_id || selectedCellId}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">{badgeConfig.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            PREDICTED
          </span>
          <span className="text-sm font-mono font-bold px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-100">
            {(confidence * 100).toFixed(1)}% Conf
          </span>
        </div>
      </div>

      {/* Probability Distribution Meters */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Calibrated Class Probability Distribution
        </span>
        <div className="flex flex-col gap-2">
          {/* REUSE */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 w-24">REUSE</span>
            <div className="flex-1 mx-3 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(class_probabilities.REUSE * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="font-mono text-emerald-400 w-12 text-right">
              {(class_probabilities.REUSE * 100).toFixed(1)}%
            </span>
          </div>

          {/* INVESTIGATE */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 w-24">INVESTIGATE</span>
            <div className="flex-1 mx-3 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${(class_probabilities.INVESTIGATE * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="font-mono text-amber-400 w-12 text-right">
              {(class_probabilities.INVESTIGATE * 100).toFixed(1)}%
            </span>
          </div>

          {/* RETIRE */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 w-24">RETIRE</span>
            <div className="flex-1 mx-3 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${(class_probabilities.RETIRE * 100).toFixed(1)}%` }}
              />
            </div>
            <span className="font-mono text-rose-400 w-12 text-right">
              {(class_probabilities.RETIRE * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 text-xs">
        <strong className="text-slate-200 block mb-1">Operator Action Recommendation:</strong>
        <p className="text-slate-300 leading-relaxed">{recommendation}</p>
      </div>

      {/* Scientific Disclaimer */}
      <p className="text-[10px] text-slate-400 leading-tight">
        * 10-Second Rapid Pulse Screening Verdict: High-throughput initial triage tool. Not a substitute for full laboratory EIS or multi-hour capacity cycling.
      </p>
    </div>
  );
};
