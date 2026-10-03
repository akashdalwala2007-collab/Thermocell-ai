import React, { useState, useEffect } from 'react';
import { BatteryCharging, Activity, Cpu, History, Lock, LogOut, ShieldCheck } from 'lucide-react';
import {
  simulatePulse,
  DiagnosticRunResponse,
  isAuthenticated,
  subscribeAuth,
  clearAuthToken,
} from './services/api';
import { ThermalGrid8x8 } from './components/ThermalGrid8x8';
import { PulseChart } from './components/PulseChart';
import { DiagnosticCard } from './components/DiagnosticCard';
import { ExplainabilityBreakdown } from './components/ExplainabilityBreakdown';
import { DemoControlBar } from './components/DemoControlBar';
import { SessionHistoryDrawer } from './components/SessionHistoryDrawer';
import { LoginModal } from './components/LoginModal';

export const App: React.FC = () => {
  const [profile, setProfile] = useState<'nominal' | 'marginal' | 'degraded'>('nominal');
  const [cellId, setCellId] = useState<string>('B0005');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [diagnosticRun, setDiagnosticRun] = useState<DiagnosticRunResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Security & Drawer State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(isAuthenticated());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeAuth((auth: boolean) => {
      setIsLoggedIn(auth);
      if (!auth) {
        setIsLoginModalOpen(true);
      }
    });
    return unsubscribe;
  }, []);

  const executeDiagnosticRun = async (selectedProf = profile, selectedCell = cellId) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await simulatePulse(selectedProf, selectedCell);
      setDiagnosticRun(data);
    } catch (err: any) {
      console.error('Diagnostic run failed:', err);
      if (err.message && err.message.includes('401')) {
        setIsLoginModalOpen(true);
        setErrorMsg('Authentication required. Please sign in with operator credentials.');
      } else {
        setErrorMsg(err.message || 'Failed to execute diagnostic run.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial baseline diagnostic pulse on mount only if authenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      setIsLoginModalOpen(true);
      return;
    }
    executeDiagnosticRun('nominal', 'B0005');
  }, []);

  const telemetry = diagnosticRun?.telemetry;
  const prediction = diagnosticRun?.prediction;
  const features = diagnosticRun?.features;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto flex flex-col gap-6 text-slate-100">
      {/* App Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <BatteryCharging className="w-8 h-8 text-emerald-400" />
            ThermoCell-AI
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Rapid 10-Second Second-Life Battery Grading & Spatial Thermal Triage
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* History Drawer Trigger */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            Session History
          </button>

          {/* Authentication Badge / Button */}
          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                Operator Auth Active
              </span>
              <button
                onClick={() => {
                  clearAuthToken();
                  setIsLoginModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
                title="Sign out operator"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-600/40 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              Sign In Operator
            </button>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
              <Activity className="w-3.5 h-3.5" />
              FastAPI Connected
            </span>
          </div>
        </div>
      </header>

      {/* Demo Control Bar */}
      <DemoControlBar
        selectedProfile={profile}
        onSelectProfile={(p) => {
          setProfile(p);
          executeDiagnosticRun(p, cellId);
        }}
        selectedCellId={cellId}
        onSelectCellId={(c) => {
          setCellId(c);
          executeDiagnosticRun(profile, c);
        }}
        onRunTest={() => executeDiagnosticRun(profile, cellId)}
        isLoading={isLoading}
      />

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <p className="text-sm font-medium">{errorMsg}</p>
          <button
            onClick={() => executeDiagnosticRun()}
            className="text-xs font-bold underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Diagnostic Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Spatial Thermal Matrix */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col">
            <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Spatial Thermal Response (8×8 Grid)
            </h2>
            <div className="flex-1 flex items-center justify-center min-h-[360px]">
              <ThermalGrid8x8
                frames={telemetry?.thermal_frames || []}
                provenance={telemetry?.provenance}
                sessionId={diagnosticRun?.session_id}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Electrical Telemetry & Diagnostics */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Top Right: Triage Classification Card */}
          <DiagnosticCard
            prediction={prediction || null}
          />

          {/* Middle Right: Dynamic Pulse Curve */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              10-Second Dynamic Pulse Profile
            </h2>
            <PulseChart
              timestamps={telemetry?.timestamps || []}
              voltage={telemetry?.voltage || []}
              bulkTemperature={telemetry?.bulk_temperature || []}
              vPrePulse={telemetry?.v_pre_pulse || 4.14}
            />
          </div>

          {/* Bottom Right: Explainability & Provenance Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <ExplainabilityBreakdown features={features || null} />
          </div>

          {/* Provenance Footer Guard */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 flex flex-col gap-2">
            <div className="font-semibold text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              Strict Data Provenance Standard Enforced:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-sky-400 block mb-0.5">REAL</span>
                <p className="text-slate-400 text-[10px] leading-tight">
                  NASA degradation cycles, empirical capacity, and initial resting voltage.
                </p>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-amber-400 block mb-0.5">SYNTHETIC</span>
                <p className="text-slate-400 text-[10px] leading-tight">
                  10s pulse discharge telemetry & AMG8833-resolution 8×8 thermal frames.
                </p>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-emerald-300 block mb-0.5">PREDICTED</span>
                <p className="text-slate-400 text-[10px] leading-tight">
                  ML triage verdict with calibrated posterior probabilities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Session History Drawer */}
      <SessionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSession={(run) => {
          setDiagnosticRun(run);
          if (run.telemetry?.cell_id) {
            setCellId(run.telemetry.cell_id);
          }
        }}
        currentSessionId={diagnosticRun?.session_id}
      />

      {/* Operator Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          executeDiagnosticRun(profile, cellId);
        }}
      />
    </main>
  );
};

export default App;
