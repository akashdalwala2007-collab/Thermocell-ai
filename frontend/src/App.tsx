import React from 'react';
import { BatteryCharging, ShieldAlert, Cpu, Activity } from 'lucide-react';

export const App: React.FC = () => {
  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <BatteryCharging className="w-8 h-8 text-emerald-400" />
            ThermoCell-AI
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Rapid 10-Second Second-Life Battery Diagnostics & Spatial Thermal Grading
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
            <Activity className="w-3.5 h-3.5" />
            System Operational
          </span>
        </div>
      </header>

      {/* Provenance Architecture Legend */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          Data Provenance Framework
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-blue-950/40 border border-blue-800/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                REAL
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Empirical NASA Ames Li-ion cycle aging telemetry, discharge capacities, and surface thermocouple rates.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-purple-950/40 border border-purple-800/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                SYNTHETIC
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Numerically modeled 10-second 3A pulse transients, ECM diffusion polarization, and 8×8 thermal frames.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                PREDICTED
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Machine learning second-life triage classifications (REUSE, RETIRE, INVESTIGATE) with calibrated probabilities.
            </p>
          </div>
        </div>
      </section>

      {/* Triage Decision Categories */}
      <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          Second-Life Triage Thresholds
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="border border-emerald-800/40 bg-emerald-950/20 rounded-lg p-4">
            <h3 className="text-emerald-400 font-bold mb-1">REUSE (Certified Second-Life)</h3>
            <p className="text-slate-400">Ground-truth SoH &ge; 80% with nominal internal resistance and thermal rise.</p>
          </div>
          <div className="border border-amber-800/40 bg-amber-950/20 rounded-lg p-4">
            <h3 className="text-amber-400 font-bold mb-1">INVESTIGATE (Anomaly Flag)</h3>
            <p className="text-slate-400">SoH 70%&ndash;80%, or thermal gradient anomaly requiring manual inspection.</p>
          </div>
          <div className="border border-red-800/40 bg-red-950/20 rounded-lg p-4">
            <h3 className="text-red-400 font-bold mb-1">RETIRE (Safety Lockout)</h3>
            <p className="text-slate-400">SoH &lt; 70%, excessive ohmic drop, or thermal tripwire excursion.</p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default App;

