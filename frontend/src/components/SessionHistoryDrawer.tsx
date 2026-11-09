import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Clock, CheckCircle2, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';
import { fetchRecentSessions, fetchSession, SessionSummary, DiagnosticRunResponse } from '../services/api';

interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (run: DiagnosticRunResponse) => void;
  currentSessionId?: string;
}

export const SessionHistoryDrawer: React.FC<SessionHistoryDrawerProps> = ({
  isOpen,
  onClose,
  onSelectSession,
  currentSessionId,
}) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRecentSessions(30);
      setSessions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load session history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const handleSessionClick = async (sessionId: string) => {
    setLoadingSessionId(sessionId);
    try {
      const fullRun = await fetchSession(sessionId);
      onSelectSession(fullRun);
      onClose();
    } catch (err: any) {
      setError(`Failed to recall session ${sessionId}: ${err.message}`);
    } finally {
      setLoadingSessionId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">Diagnostic Session History</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSessions}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
              title="Refresh sessions"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="Close history"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {isLoading && sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span className="text-xs">Loading sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No diagnostic sessions found in database.
              <br />
              Run a pulse test to generate session history.
            </div>
          ) : (
            sessions.map((s) => {
              const isSelected = s.session_id === currentSessionId;
              const isLoadingThis = s.session_id === loadingSessionId;
              const dateStr = new Date(s.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              let badgeBg = 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
              let Icon = CheckCircle2;
              if (s.triage_class === 'RETIRE') {
                badgeBg = 'bg-rose-950/80 text-rose-300 border-rose-800';
                Icon = ShieldAlert;
              } else if (s.triage_class === 'INVESTIGATE') {
                badgeBg = 'bg-amber-950/80 text-amber-300 border-amber-800';
                Icon = AlertTriangle;
              }

              const provBg =
                s.provenance === 'REAL'
                  ? 'bg-blue-950 text-blue-300 border-blue-800'
                  : s.provenance === 'SYNTHETIC'
                  ? 'bg-purple-950 text-purple-300 border-purple-800'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-800';

              return (
                <div
                  key={s.session_id}
                  onClick={() => !isLoadingThis && handleSessionClick(s.session_id)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-indigo-950/30 border-indigo-500 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">{s.cell_id}</span>
                      {s.cycle_index !== undefined && s.cycle_index !== null && (
                        <span className="text-[11px] font-mono text-slate-400">
                          (Cyc {s.cycle_index})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">{dateStr}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeBg}`}>
                        <Icon className="w-3 h-3" />
                        {s.triage_class}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${provBg}`}>
                        {s.provenance}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-medium text-slate-300">
                        {(s.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {isLoadingThis && (
                    <div className="text-[11px] text-indigo-400 flex items-center gap-1 pt-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Recalling full session...
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-slate-400" /> Persistent Session Layer
          </span>
          <span>{sessions.length} sessions</span>
        </div>
      </div>
    </div>
  );
};
