import React, { useState } from 'react';
import { loginOperator } from '../services/api';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [username, setUsername] = useState<string>('operator');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await loginOperator(username, password);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070c18]/80 backdrop-blur-sm">
      <div className="bg-[#08101e] border border-[#142340] rounded-xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close modal"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-[#06b6d4]/10 border border-[#06b6d4]/30 rounded-lg text-[#4cd7f6]">
            <span className="material-symbols-outlined text-[24px]">shield</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 font-sans">Operator Authentication</h2>
            <p className="text-xs text-slate-400 font-mono">
              Authenticate to execute diagnostic simulations and recall data
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-500/40 rounded text-rose-200 text-xs font-mono flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-rose-400 shrink-0 mt-0.5">
              error
            </span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase tracking-wider">
              Operator Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-[#060a14] border border-[#142340] rounded px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:border-[#4cd7f6] transition-colors"
                placeholder="operator"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5 uppercase tracking-wider">
              Operator Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-[#060a14] border border-[#142340] rounded px-3 py-2 font-mono text-sm text-slate-100 focus:outline-none focus:border-[#4cd7f6] transition-colors"
                placeholder="Enter operator password"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Demo default password:{' '}
              <code className="text-[#4cd7f6] font-bold">thermocell2026</code>
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 mt-2 pt-3 border-t border-[#142340]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-mono text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 font-mono text-xs font-bold uppercase rounded bg-[#06b6d4] hover:bg-[#4cd7f6] text-[#070c18] disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    sync
                  </span>
                  Verifying...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock_open</span>
                  Sign In
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
