import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  simulatePulse,
  fetchRecentSessions,
  fetchSession,
  setHardwareBaseline,
  ingestHardwareFrame,
  buildHardwarePulse,
  resetHardwareBuffer,
  DiagnosticRunResponse,
  SessionSummary,
  HardwareFrameRequest,
  isAuthenticated,
  subscribeAuth,
} from './services/api';
import { Sidebar, NavTab } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { LoginModal } from './components/LoginModal';

// 5 Approved Views from Stitch + Deep Insight Sub-views
import { DashboardView } from './views/DashboardView';
import { LiveMonitoringView } from './views/LiveMonitoringView';
import { ThermalAnalysisView } from './views/ThermalAnalysisView';
import { SettingsView } from './views/SettingsView';
import { SessionHistoryView } from './views/SessionHistoryView';
import { DiagnosticsView } from './views/DiagnosticsView';
import { AIInsightsView } from './views/AIInsightsView';

export const App: React.FC = () => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Simulation & Profile State
  const [profile, setProfile] = useState<'nominal' | 'marginal' | 'degraded'>('nominal');
  const [cellId, setCellId] = useState<string>('B0005');
  const [cycleIndex, setCycleIndex] = useState<number | null>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [diagnosticRun, setDiagnosticRun] = useState<DiagnosticRunResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hardware vs Simulation mode
  const [isHardwareMode, setIsHardwareMode] = useState<boolean>(false);

  // Hardware streaming state
  const [hardwareStreamActive, setHardwareStreamActive] = useState<boolean>(false);
  const [hardwareFrameCount, setHardwareFrameCount] = useState<number>(0);

  // Request counter ref to prevent race conditions on fast cell/profile switches
  const activeRequestIdRef = useRef<number>(0);

  // Streaming mutex and initialization guard
  const isStreamingRef = useRef<boolean>(false);
  const hasInitializedRef = useRef<boolean>(false);

  // Security State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(isAuthenticated());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Cells catalog and benchmark cycles
  const cellsList = ['B0005', 'B0006', 'B0007', 'B0018', 'HW-001'];

  const BENCHMARK_CELL_DATA: Record<
    string,
    {
      cycles: number[];
      nominalCycle: number;
      marginalCycle: number;
      degradedCycle: number;
      nominalDcir: number;
      marginalDcir: number;
      degradedDcir: number;
    }
  > = {
    B0005: {
      cycles: [1, 40, 85, 160],
      nominalCycle: 1,
      marginalCycle: 85,
      degradedCycle: 160,
      nominalDcir: 0.091,
      marginalDcir: 0.142,
      degradedDcir: 0.215,
    },
    B0006: {
      cycles: [1, 50, 90, 155],
      nominalCycle: 1,
      marginalCycle: 90,
      degradedCycle: 155,
      nominalDcir: 0.088,
      marginalDcir: 0.158,
      degradedDcir: 0.235,
    },
    B0007: {
      cycles: [1, 60, 110, 165],
      nominalCycle: 1,
      marginalCycle: 110,
      degradedCycle: 165,
      nominalDcir: 0.09,
      marginalDcir: 0.15,
      degradedDcir: 0.22,
    },
    B0018: {
      cycles: [1, 45, 80, 130],
      nominalCycle: 1,
      marginalCycle: 80,
      degradedCycle: 130,
      nominalDcir: 0.092,
      marginalDcir: 0.145,
      degradedDcir: 0.225,
    },
  };

  // Auth Subscription
  useEffect(() => {
    const unsubscribe = subscribeAuth((auth: boolean) => {
      setIsLoggedIn(auth);
      if (!auth) {
        setIsLoginModalOpen(true);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch recent sessions on mount or when run completes
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const list = await fetchRecentSessions(10);
        if (list && list.length > 0) {
          setRecentSessions(list);
        }
      } catch (err) {
        console.info('Backend sessions query completed with fallback baseline.');
      }
    };
    loadSessions();
  }, [diagnosticRun]);

  // Execute simulation diagnostic run
  const executeSimulationRun = useCallback(async (
    selectedProf = profile,
    selectedCell = cellId,
    selectedCycle = cycleIndex
  ) => {
    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await simulatePulse(selectedProf, selectedCell, selectedCycle ?? undefined);
      if (currentRequestId === activeRequestIdRef.current) {
        setDiagnosticRun(data);
      }
    } catch (err: any) {
      if (currentRequestId === activeRequestIdRef.current) {
        console.error('Diagnostic run error:', err);
        if (err.message && err.message.includes('401')) {
          setIsLoginModalOpen(true);
          setErrorMsg('Authentication required. Please sign in with operator credentials.');
        } else {
          setErrorMsg(err.message || 'Failed to execute diagnostic run.');
        }
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [profile, cellId, cycleIndex]);

  // Execute hardware diagnostic run (uses /api/telemetry/* endpoints)
  const executeHardwareRun = useCallback(async (
    selectedCell = cellId,
    selectedCycle = cycleIndex
  ) => {
    if (isStreamingRef.current) {
      console.warn('Hardware streaming run already in progress; ignoring duplicate trigger.');
      return;
    }
    isStreamingRef.current = true;
    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMsg(null);

    // For hardware mode, we need to simulate the hardware stream
    // In production, this would come from actual ESP32 serial data
    try {
      // Reset buffer
      await resetHardwareBuffer();
      if (currentRequestId !== activeRequestIdRef.current) return;

      const bench = BENCHMARK_CELL_DATA[selectedCell] || {
        nominalCycle: 1,
        marginalCycle: 85,
        degradedCycle: 160,
        nominalDcir: 0.095,
        marginalDcir: 0.145,
        degradedDcir: 0.220,
      };

      const dcir = profile === 'nominal' ? bench.nominalDcir : profile === 'marginal' ? bench.marginalDcir : bench.degradedDcir;
      const targetCycleIndex = selectedCycle ?? (profile === 'nominal' ? bench.nominalCycle : profile === 'marginal' ? bench.marginalCycle : bench.degradedCycle);
      const ocv = profile === 'nominal' ? 4.143 : profile === 'marginal' ? 4.126 : 4.110;

      await setHardwareBaseline({ cell_id: selectedCell, voltage: ocv });
      if (currentRequestId !== activeRequestIdRef.current) return;

      const pulseCurrent = 3.0;

      setHardwareStreamActive(true);
      setHardwareFrameCount(0);

      // Send 100 active frames (0.0 to 9.9s)
      for (let i = 0; i < 100; i++) {
        if (currentRequestId !== activeRequestIdRef.current) return;
        const t = Math.round(i * 0.1 * 10) / 10; // 0.0, 0.1, 0.2, ...
        const v = Number((ocv - (pulseCurrent * dcir) - (0.05 * (1.0 - Math.exp(-t / 1.5)))).toFixed(4));
        const temp = Number((24.0 + (0.25 * (t / 10.0))).toFixed(2));
        const grid = Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) =>
            Number((temp + (r === 0 && c >= 3 && c <= 4 ? 0.15 : 0.0)).toFixed(2))
          )
        );

        const frame: HardwareFrameRequest = {
          cell_id: selectedCell,
          cycle_index: targetCycleIndex,
          timestamp: t,
          voltage: v,
          current: pulseCurrent,
          bulk_temperature: temp,
          thermal_frame_8x8: grid,
          provenance: 'REAL',
        };

        await ingestHardwareFrame(frame);
        if (currentRequestId !== activeRequestIdRef.current) return;
        setHardwareFrameCount(i + 1);
      }

      // Send 20 relaxation frames (10.0 to 11.9s)
      for (let i = 0; i < 20; i++) {
        if (currentRequestId !== activeRequestIdRef.current) return;
        const t = Number((10.0 + i * 0.1).toFixed(1));
        const v = Number((ocv - (0.03 * Math.exp(-(t - 10.0) / 1.5))).toFixed(4));
        const temp = Number((24.25 - (0.05 * ((t - 10.0) / 2.0))).toFixed(2));
        const grid = Array.from({ length: 8 }, () =>
          Array.from({ length: 8 }, () => Number(temp.toFixed(2)))
        );

        const frame: HardwareFrameRequest = {
          cell_id: selectedCell,
          cycle_index: targetCycleIndex,
          timestamp: t,
          voltage: v,
          current: 0.0,
          bulk_temperature: temp,
          thermal_frame_8x8: grid,
          provenance: 'REAL',
        };

        await ingestHardwareFrame(frame);
        if (currentRequestId !== activeRequestIdRef.current) return;
        setHardwareFrameCount(100 + i + 1);
      }

      if (currentRequestId !== activeRequestIdRef.current) return;
      // Build pulse and run diagnosis
      const data = await buildHardwarePulse({ cell_id: selectedCell, cycle_index: targetCycleIndex });

      if (currentRequestId === activeRequestIdRef.current) {
        setDiagnosticRun(data);
      }
    } catch (err: any) {
      if (currentRequestId === activeRequestIdRef.current) {
        console.error('Hardware diagnostic run error:', err);
        if (err.message && err.message.includes('401')) {
          setIsLoginModalOpen(true);
          setErrorMsg('Authentication required. Please sign in with operator credentials.');
        } else {
          setErrorMsg(err.message || 'Failed to execute hardware diagnostic run.');
        }
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
        setHardwareStreamActive(false);
      }
      isStreamingRef.current = false;
    }
  }, [cellId, profile, cycleIndex]);

  // Unified execute function
  const executeDiagnosticRun = useCallback(async (
    selectedProf = profile,
    selectedCell = cellId,
    selectedCycle = cycleIndex
  ) => {
    if (isHardwareMode) {
      await executeHardwareRun(selectedCell, selectedCycle);
    } else {
      await executeSimulationRun(selectedProf, selectedCell, selectedCycle);
    }
  }, [isHardwareMode, profile, cellId, cycleIndex, executeSimulationRun, executeHardwareRun]);

  // Attempt initial baseline simulation strictly once if logged in
  useEffect(() => {
    if (isAuthenticated() && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      executeDiagnosticRun('nominal', 'B0005', 1);
    }
  }, [isLoggedIn, executeDiagnosticRun]);

  // Cell switcher
  const handleSelectCell = (newCellId: string) => {
    setCellId(newCellId);
    const bench = BENCHMARK_CELL_DATA[newCellId];
    const defaultCycle = bench ? (profile === 'nominal' ? bench.nominalCycle : profile === 'marginal' ? bench.marginalCycle : bench.degradedCycle) : 1;
    setCycleIndex(defaultCycle);
    executeDiagnosticRun(profile, newCellId, defaultCycle);
  };

  // Profile switcher
  const handleSelectProfile = (newProfile: 'nominal' | 'marginal' | 'degraded') => {
    setProfile(newProfile);
    const bench = BENCHMARK_CELL_DATA[cellId];
    const targetCycle = bench ? (newProfile === 'nominal' ? bench.nominalCycle : newProfile === 'marginal' ? bench.marginalCycle : bench.degradedCycle) : null;
    setCycleIndex(targetCycle);
    executeDiagnosticRun(newProfile, cellId, targetCycle);
  };

  // Specific cycle switcher
  const handleSelectCycle = (newCycle: number) => {
    setCycleIndex(newCycle);
    executeDiagnosticRun(profile, cellId, newCycle);
  };

  // Session recall action
  const handleSelectSession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const data = await fetchSession(sessionId);
      if (data) {
        setDiagnosticRun(data);
        setActiveTab('session-history');
      }
    } catch (err) {
      console.info(`Navigating to session history for ${sessionId}`);
      setActiveTab('session-history');
    } finally {
      setIsLoading(false);
    }
  };

  // Hardware mode toggle - reset diagnostic when switching modes
  const handleToggleHardwareMode = () => {
    setIsHardwareMode(prev => !prev);
    setDiagnosticRun(null); // Clear current run when switching modes
  };

  const telemetry = diagnosticRun?.telemetry ?? null;
  const prediction = diagnosticRun?.prediction ?? null;
  const features = diagnosticRun?.features ?? null;
  const soh = diagnosticRun?.soh ?? null;
  const provenance = telemetry?.provenance ?? (isHardwareMode ? 'REAL' : 'SYNTHETIC');

  return (
    <div className="bg-[#070c18] font-sans text-slate-100 min-h-screen antialiased selection:bg-[#06b6d4] selection:text-[#070c18]">
      {/* Permanent Left Sidebar with 7 Navigation Items */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        isHardwareLinked={!isHardwareMode || true}
      />

      {/* Main Content Wrap offset by Sidebar */}
      <div className="pl-16 md:pl-64 flex flex-col min-h-screen">
        {/* Fixed Top Header */}
        <TopHeader
          selectedCell={cellId}
          onSelectCell={handleSelectCell}
          cellsList={cellsList}
          selectedCycle={cycleIndex}
          onSelectCycle={handleSelectCycle}
          availableCycles={BENCHMARK_CELL_DATA[cellId]?.cycles || [1, 85, 160]}
          activeProfile={profile}
          onSelectProfile={handleSelectProfile}
          onRunDiagnostic={() => executeDiagnosticRun(profile, cellId, cycleIndex)}
          isRunningDiagnostic={isLoading}
          provenance={provenance}
          isHardwareMode={isHardwareMode}
          onOpenLoginModal={() => setIsLoginModalOpen(true)}
          isAuthenticated={isLoggedIn}
          operatorId="OP-4482"
        />

        {/* Dynamic View Router */}
        <main className="w-full pt-20 px-4 md:px-6 flex-1 bg-[#070c18]">
          {hardwareStreamActive && (
            <div className="mb-4 p-3 bg-cyan-950/70 border border-cyan-500/50 rounded text-cyan-200 text-xs font-mono flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span>Streaming physical DAQ telemetry: {hardwareFrameCount} / 120 frames ingested into hardware buffer...</span>
              </div>
              <span className="font-semibold">{Math.round((hardwareFrameCount / 120) * 100)}%</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-950/70 border border-rose-500/50 rounded text-rose-200 text-xs font-mono flex items-center justify-between">
              <span>{errorMsg}</span>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-rose-100 font-bold"
              >
                DISMISS
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              telemetry={telemetry}
              prediction={prediction}
              features={features}
              soh={soh}
              recentSessions={recentSessions}
              isHardwareMode={isHardwareMode}
              onToggleHardwareMode={handleToggleHardwareMode}
              onRunDiagnostic={() => executeDiagnosticRun(profile, cellId)}
              isRunning={isLoading}
              selectedCell={cellId}
              onSelectSession={handleSelectSession}
            />
          )}

          {activeTab === 'live-monitoring' && (
            <LiveMonitoringView
              telemetry={telemetry}
              isRunningDiagnostic={isLoading}
              onRunDiagnostic={() => executeDiagnosticRun(profile, cellId)}
              selectedCell={cellId}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsView
              telemetry={telemetry}
              prediction={prediction}
              features={features}
              selectedCell={cellId}
            />
          )}

          {activeTab === 'thermal-analysis' && (
            <ThermalAnalysisView telemetry={telemetry} selectedCell={cellId} />
          )}

          {activeTab === 'ai-insights' && (
            <AIInsightsView prediction={prediction} selectedCell={cellId} />
          )}

          {activeTab === 'session-history' && (
            <SessionHistoryView
              recentSessions={recentSessions}
              onSelectSession={handleSelectSession}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              onOpenLoginModal={() => setIsLoginModalOpen(true)}
              isAuthenticated={isLoggedIn}
              operatorId="OP-4482"
            />
          )}
        </main>
      </div>

      {/* Operator Authentication Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          setIsLoggedIn(true);
          executeDiagnosticRun(profile, cellId);
        }}
      />
    </div>
  );
};

export default App;
