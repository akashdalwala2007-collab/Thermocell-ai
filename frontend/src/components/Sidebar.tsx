import React from 'react';

export type NavTab =
  | 'dashboard'
  | 'live-monitoring'
  | 'diagnostics'
  | 'thermal-analysis'
  | 'ai-insights'
  | 'session-history'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isHardwareLinked?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isHardwareLinked = true,
}) => {
  const navItems: { id: NavTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'speed' },
    { id: 'live-monitoring', label: 'Live Monitoring', icon: 'monitoring' },
    { id: 'diagnostics', label: 'Diagnostics', icon: 'biotech' },
    { id: 'thermal-analysis', label: 'Thermal Analysis', icon: 'thermostat' },
    { id: 'ai-insights', label: 'AI Insights', icon: 'psychology' },
    { id: 'session-history', label: 'Session History', icon: 'history' },
    { id: 'settings', label: 'Settings', icon: 'tune' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-16 md:w-64 bg-[#090e1a] z-50 flex flex-col justify-between transition-all duration-200 select-none border-r border-[#142340]">
      <div className="flex flex-col">
        {/* Lab Branding Header */}
        <div className="h-16 px-4 flex items-center gap-3 bg-[#0d1527]/50 border-b border-[#142340]">
          <div className="w-10 h-10 rounded bg-[#06b6d4]/20 flex items-center justify-center shrink-0 border border-[#06b6d4]/40">
            <span className="material-symbols-outlined text-[#4cd7f6] text-[24px]">hexagon</span>
          </div>
          <div className="hidden md:flex flex-col min-w-0 overflow-hidden leading-tight">
            <span className="font-semibold text-base tracking-tight text-slate-100 truncate">
              ThermoCell-AI
            </span>
            <span className="font-mono text-[10px] text-slate-400 tracking-wider truncate uppercase">
              Battery Diagnostics Lab
            </span>
          </div>
        </div>

        {/* Navigation Link List */}
        <nav className="flex flex-col py-3 gap-1 px-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center h-10 px-3 rounded transition-all text-left ${
                  isActive
                    ? 'bg-[#15223c] text-[#4cd7f6] shadow-[inset_3px_0_0_0_#4cd7f6] font-medium'
                    : 'text-slate-400 hover:bg-[#0d1527] hover:text-slate-200'
                }`}
                title={item.label}
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] shrink-0 leading-none">
                  {item.icon}
                </span>
                <span className="hidden md:inline ml-3 text-sm truncate font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status Block */}
      <div className="p-3 bg-[#0d1527]/70 border-t border-[#142340]">
        <div className="hidden md:flex flex-col gap-1.5 bg-[#060a14] p-3 rounded border border-[#142340]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              System Status
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#4cd7f6] font-semibold">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isHardwareLinked ? 'bg-[#4cd7f6] animate-pulse' : 'bg-amber-400'
                }`}
              ></span>
              {isHardwareLinked ? 'LINKED' : 'STANDBY'}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-1 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase">Interface:</span>
              <span className="text-slate-200 font-semibold">ESP32-S3 HW</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase">Baud Rate:</span>
              <span className="text-slate-200">115200</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase">Profile:</span>
              <span className="text-[#7bd0ff] truncate max-w-[100px]" title="18650 Pulse Standard">
                18650 Pulse
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Minimal Pips */}
        <div className="md:hidden flex justify-center py-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isHardwareLinked ? 'bg-[#4cd7f6] animate-pulse' : 'bg-amber-400'
            }`}
            title="ESP32-S3 Link Active"
          ></span>
        </div>
      </div>
    </aside>
  );
};
