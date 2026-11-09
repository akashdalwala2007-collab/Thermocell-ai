import React, { useState } from 'react';

interface SettingsViewProps {
  onOpenLoginModal: () => void;
  isAuthenticated: boolean;
  operatorId?: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenLoginModal,
  isAuthenticated,
  operatorId = 'OP-4482',
}) => {
  const [selectedPort, setSelectedPort] = useState<string>('COM3');
  const [baudRate, setBaudRate] = useState<string>('115200');
  const [burstFreq, setBurstFreq] = useState<string>('250');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingLatency, setPingLatency] = useState<string>('ACK: RTT 1.42ms');

  const [isInterlockEngaged, setIsInterlockEngaged] = useState<boolean>(true);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Stepper values
  const [currentA, setCurrentA] = useState<number>(3.0);
  const [durationS, setDurationS] = useState<number>(10.0);
  const [relaxS, setRelaxS] = useState<number>(2.0);
  const [settleMs, setSettleMs] = useState<number>(50);

  const handlePingTest = () => {
    setIsPinging(true);
    setTimeout(() => {
      const lat = (1.2 + Math.random() * 0.5).toFixed(2);
      setPingLatency(`ACK: RTT ${lat}ms`);
      setIsPinging(false);
    }, 400);
  };

  const handleSaveProfile = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="flex flex-col w-full pb-12 space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Hardware DAQ Comms & Operator Session (XL: 5 cols) */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          {/* Card 1: Hardware DAQ & Serial Comms */}
          <div className="flex flex-col bg-[#08101e] rounded border border-[#142340] shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-[#060a14] rounded-t border-b border-[#142340]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">router</span>
                <span className="font-semibold text-sm text-slate-100">
                  Hardware DAQ &amp; Comms
                </span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#101a2e] font-mono text-[10px] text-[#4cd7f6] border border-[#142340]">
                REAL PHYSICAL
              </span>
            </div>

            <div className="p-4 flex flex-col gap-3 font-mono text-xs">
              {/* Port Select */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                  <span>Serial Transceiver Interface</span>
                  <span className="text-[#4cd7f6]">CONNECTED (UART/USB)</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    className="w-full bg-[#060a14] text-slate-200 px-3 py-2 rounded border border-[#142340] focus:border-[#4cd7f6] outline-none cursor-pointer appearance-none"
                  >
                    <option value="COM3">COM3 (FTDI FT232R Industrial Isolated Bridge) — [ACTIVE]</option>
                    <option value="ttyUSB0">/dev/ttyUSB0 (ESP32-S3 Dual-Core Xtensa LX7 @ 240MHz)</option>
                    <option value="ttyACM0">/dev/ttyACM0 (USB JTAG / Secondary Debug Ring)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-[18px]">expand_more</span>
                  </div>
                </div>
              </div>

              {/* Parameter Lattices */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <span className="text-[10px] text-slate-400 uppercase">Baud Rate Standard</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(e.target.value)}
                      className="bg-transparent text-base text-slate-100 font-bold outline-none cursor-pointer"
                    >
                      <option value="115200" className="bg-[#060a14]">115,200</option>
                      <option value="230400" className="bg-[#060a14]">230,400</option>
                      <option value="921600" className="bg-[#060a14]">921,600</option>
                    </select>
                    <span className="text-slate-400 text-[10px]">bps</span>
                  </div>
                  <span className="mt-1 text-[10px] text-slate-400">Lockout: 8-N-1 Hardware</span>
                </div>
                <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <span className="text-[10px] text-slate-400 uppercase">Burst DAQ Frequency</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <select
                      value={burstFreq}
                      onChange={(e) => setBurstFreq(e.target.value)}
                      className="bg-transparent text-base text-[#4cd7f6] font-bold outline-none cursor-pointer"
                    >
                      <option value="250" className="bg-[#060a14]">250.00</option>
                      <option value="500" className="bg-[#060a14]">500.00</option>
                      <option value="1000" className="bg-[#060a14]">1000.00</option>
                    </select>
                    <span className="text-slate-400 text-[10px]">SPS</span>
                  </div>
                  <span className="mt-1 text-[10px] text-[#4cd7f6]">DMA Buffer: 100% OK</span>
                </div>
              </div>

              {/* Status Matrix */}
              <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30] gap-1 text-[11px]">
                <div className="flex items-center justify-between pb-1 border-b border-[#142340]">
                  <span className="text-slate-400">Silicon Board Revision</span>
                  <span className="text-slate-200 font-semibold">ESP32-S3 v4.2-REV-B</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#142340]">
                  <span className="text-slate-400">Transport Packet Jitter</span>
                  <span className="text-[#7bd0ff]">±0.08 ms</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#142340]">
                  <span className="text-slate-400">Dropped Frames (24h)</span>
                  <span className="text-slate-200">0 frames (0.00%)</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Thermal Sensor Bus</span>
                  <span className="text-[#4cd7f6]">I2C FastMode+ @ 1MHz</span>
                </div>
              </div>

              {/* Hardware Echo Test */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePingTest}
                    disabled={isPinging}
                    type="button"
                    className="inline-flex items-center gap-1.5 bg-[#06b6d4] hover:bg-[#4cd7f6] text-[#070c18] px-3 py-1.5 rounded text-xs font-bold uppercase transition-all shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                    <span>{isPinging ? 'Pinging...' : 'Test Link / Send Echo Ping'}</span>
                  </button>
                  <span className="text-slate-400 text-[11px]">{pingLatency}</span>
                </div>

                <div className="w-full h-8 bg-[#060a14] rounded p-1 flex items-center justify-between border border-[#0f1a30] overflow-hidden">
                  <svg className="w-full h-full text-[#4cd7f6]" preserveAspectRatio="none" viewBox="0 0 200 40">
                    <path
                      d="M0,20 L40,20 L45,5 L50,35 L55,20 L95,20 L100,2 L105,38 L110,20 L150,20 L155,8 L160,32 L165,20 L200,20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Operator Session & HSM Audit */}
          <div className="flex flex-col bg-[#08101e] rounded border border-[#142340] shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-[#060a14] rounded-t border-b border-[#142340]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#7bd0ff] text-[20px]">badge</span>
                <span className="font-semibold text-sm text-slate-100">
                  Operator Session &amp; HSM Audit
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#7bd0ff]">TIER-2 ISO ACCESS</span>
            </div>

            <div className="p-4 flex flex-col gap-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 bg-[#060a14] rounded border border-[#0f1a30]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-[#101a2e] flex items-center justify-center text-[#4cd7f6] font-bold text-base border border-[#142340]">
                    44
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-100 text-sm">Badge #{operatorId}</span>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Diagnostics Lead Technician
                    </span>
                  </div>
                </div>
                <button
                  onClick={onOpenLoginModal}
                  type="button"
                  className="inline-flex items-center gap-1.5 bg-[#101a2e] hover:bg-[#15223c] text-slate-200 px-3 py-1.5 rounded transition-colors border border-[#142340]"
                >
                  <span className="material-symbols-outlined text-[16px] text-rose-400">lock</span>
                  <span>{isAuthenticated ? 'LOCK NOW' : 'SIGN IN'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <span className="text-[10px] text-slate-400 uppercase">Current Token ID</span>
                  <span className="text-[#4cd7f6] mt-1 truncate">tk_lab_op_9824f1</span>
                  <span className="text-[10px] text-slate-400 mt-1">Expires in: 07h 41m</span>
                </div>
                <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <span className="text-[10px] text-slate-400 uppercase">Auto-Lock Inactivity</span>
                  <span className="text-slate-100 mt-1">15 MINUTES</span>
                  <span className="text-[10px] text-slate-400 mt-1">NIST 800-53 Enforced</span>
                </div>
              </div>

              <div className="flex flex-col bg-[#060a14] p-2.5 rounded border border-[#0f1a30] gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase">Hardware HSM Signing</span>
                  <span className="inline-flex items-center gap-1 text-[#4cd7f6] text-[11px]">
                    <span className="material-symbols-outlined text-[14px]">shield</span> ACTIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                  Every 10-second pulse diagnostic verdict is cryptographically hashed in-silicon with an onboard SHA-256 secure element certificate.
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] bg-[#090e1a] p-1.5 rounded border border-[#142340]">
                  <span className="text-slate-400">KEY_FINGERPRINT:</span>
                  <span className="text-slate-200">9F:8B:2A:41:00:E7:62:CC</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Safety Thresholds Calibration & Diagnostic Profile (XL: 7 cols) */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          {/* Card 3: Safety Thresholds Calibration Panel */}
          <div className="flex flex-col bg-[#08101e] rounded border border-[#142340] shadow-sm">
            <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-[#060a14] rounded-t border-b border-[#142340] gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">tune</span>
                <span className="font-semibold text-sm text-slate-100">
                  Safety Thresholds Calibration Panel
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400 uppercase">INTERLOCK</span>
                <button
                  onClick={() => setIsInterlockEngaged(!isInterlockEngaged)}
                  type="button"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-mono text-xs font-bold transition-all ${
                    isInterlockEngaged
                      ? 'bg-[#06b6d4] text-[#070c18]'
                      : 'bg-[#101a2e] text-slate-400 border border-[#142340]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">lock</span>
                  <span>{isInterlockEngaged ? 'ENGAGED' : 'DISENGAGED'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-3 font-mono text-xs">
              {/* Critical Lockout Warning Banner */}
              <div className="flex items-start gap-2.5 p-3 rounded bg-rose-950/30 border border-rose-500/40 text-rose-300">
                <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">warning</span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    DETERMINISTIC INTERRUPT ACTIVE
                  </span>
                  <p className="text-[11px] text-rose-300/90 font-sans mt-0.5">
                    Safety lockout rules execute deterministically within the ESP32 hardware interrupt loop (ISR) and strictly override any ML model inferences or remote operator commands.
                  </p>
                </div>
              </div>

              {/* Thresholds Table */}
              <div className="overflow-x-auto rounded bg-[#060a14] border border-[#0f1a30]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#090e1a] text-[10px] text-slate-400 uppercase border-b border-[#142340]">
                      <th className="py-2 px-3">Safety Metric / Vector</th>
                      <th className="py-2 px-3 text-right">Hard Lockout Limit</th>
                      <th className="py-2 px-3 text-right">Nominal Baseline</th>
                      <th className="py-2 px-3 text-center">HW Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#142340] text-xs">
                    <tr className="hover:bg-[#101a2e] transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">DCIR Hard Lockout</span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          Internal Resistance Spike Threshold
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">0.150 Ω</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 0.117 Ω</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#101a2e] transition-colors bg-[#08101e]/40">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">
                          10s Active Voltage Sag (ΔV₁₀)
                        </span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          Dynamic transient drop limit
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">0.450 V</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 0.267 V</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#101a2e] transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">
                          Bulk Temp Rise (ΔT_bulk)
                        </span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          Surface thermocouple rise
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">10.0 °C</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 2.50 °C</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#101a2e] transition-colors bg-[#08101e]/40">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">
                          Localized Hotspot (ΔT_hotspot)
                        </span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          Peak optical IR cell delta
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">3.00 °C</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 1.50 °C</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#101a2e] transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">
                          Tab Gradient (∇T_tab-body)
                        </span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          Tab eccentricity spatial derivative
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">0.80 °C/mm</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 0.74 °C/mm</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#101a2e] transition-colors bg-[#08101e]/40">
                      <td className="py-2.5 px-3">
                        <span className="text-slate-100 font-semibold block">
                          Spatial Variance (σ²_T)
                        </span>
                        <span className="text-slate-400 text-[10px] font-sans">
                          64-pixel variance index
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-bold">1.50 °C²</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">≤ 0.12 °C²</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                          PASS : CAL
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Card 4: Diagnostic Test Profile Parameters */}
          <div className="flex flex-col bg-[#08101e] rounded border border-[#142340] shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-[#060a14] rounded-t border-b border-[#142340]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  electric_bolt
                </span>
                <span className="font-semibold text-sm text-slate-100">
                  Diagnostic Test Profile Parameters
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">ISO-12405 STANDARD</span>
            </div>

            <div className="p-4 flex flex-col gap-3 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Discharge Current (I_pulse)
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10.0"
                      value={currentA}
                      onChange={(e) => setCurrentA(Number(e.target.value))}
                      className="w-24 bg-transparent text-slate-100 font-bold text-base outline-none"
                    />
                    <span className="text-slate-400">Amperes (A)</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Pulse Duration (t_pulse)
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      step="0.5"
                      min="1.0"
                      max="30.0"
                      value={durationS}
                      onChange={(e) => setDurationS(Number(e.target.value))}
                      className="w-24 bg-transparent text-slate-100 font-bold text-base outline-none"
                    />
                    <span className="text-slate-400">Seconds (s)</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Relaxation Phase (t_relax)
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="10.0"
                      value={relaxS}
                      onChange={(e) => setRelaxS(Number(e.target.value))}
                      className="w-24 bg-transparent text-slate-100 font-bold text-base outline-none"
                    />
                    <span className="text-slate-400">Seconds (s)</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
                  <label className="text-[10px] text-slate-400 uppercase">
                    Pre-Pulse Settle Delay
                  </label>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      step="10"
                      min="10"
                      max="500"
                      value={settleMs}
                      onChange={(e) => setSettleMs(Number(e.target.value))}
                      className="w-24 bg-transparent text-slate-100 font-bold text-base outline-none"
                    />
                    <span className="text-slate-400">Milliseconds (ms)</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-sans">
                  Profile will sync to ESP32 onboard NVRAM on commit.
                </span>
                <button
                  onClick={handleSaveProfile}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs font-bold uppercase transition-all shadow-sm ${
                    isSaved
                      ? 'bg-emerald-500 text-[#070c18]'
                      : 'bg-[#06b6d4] hover:bg-[#4cd7f6] text-[#070c18]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isSaved ? 'check' : 'save'}
                  </span>
                  <span>{isSaved ? 'COMMITTED TO NVRAM' : 'SAVE & COMMIT PROFILE'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
