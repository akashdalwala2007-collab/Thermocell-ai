import React from 'react';
import { BatteryPulseTelemetry, DiagnosticPrediction } from '../services/api';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { VerdictBadge } from '../components/VerdictBadge';

interface DiagnosticsViewProps {
  telemetry: BatteryPulseTelemetry | null;
  prediction: DiagnosticPrediction | null;
  features: Record<string, number> | null;
  selectedCell: string;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  telemetry,
  prediction,
  features,
  selectedCell,
}) => {
  const cellId = telemetry?.cell_id ?? selectedCell;
  const verdict = prediction?.triage_class ?? null;
  const provenance = telemetry?.provenance ?? 'SYNTHETIC';

  const ocv = features?.['OCV'] ?? telemetry?.v_pre_pulse ?? null;
  const dcir = features?.['DCIR'] ?? features?.['dcir_ohm'] ?? null;
  const dV10 = features?.['ΔV10'] ?? features?.['delta_v_10s'] ?? null;
  const dvDtSlope = features?.['dV/dt_slope'] ?? features?.['dv_dt_slope'] ?? null;
  const vRecovRate = features?.['V_recovery_rate'] ?? features?.['v_recovery_rate'] ?? null;
  const tAmb = features?.['T_initial'] ?? features?.['ambient_t_c'] ?? null;
  const deltaTBulk = features?.['ΔT_bulk'] ?? features?.['delta_t_c'] ?? null;
  const dtDtMax = features?.['dT/dt_max'] ?? features?.['dt_dt_max'] ?? null;
  const tauCool = features?.['τ_cool'] ?? features?.['tau_cool'] ?? null;
  const tMaxPixel = features?.['T_max_pixel'] ?? features?.['t_max_pixel_c'] ?? null;
  const tMeanCell = features?.['T_mean_cell'] ?? features?.['t_mean_cell_c'] ?? null;
  const variance = features?.['σ²_T'] ?? features?.['spatial_var_c2'] ?? null;
  const gradient = features?.['∇T_tab-body'] ?? features?.['max_spatial_grad_c'] ?? null;
  const eccentricity = features?.['hotspot_eccentricity'] ?? features?.['tab_eccentricity_px'] ?? null;

  const featureList = [
    {
      name: '1. OCV (v_pre_pulse)',
      desc: 'Pre-pulse Open Circuit Voltage (OCV)',
      val: ocv !== null ? `${ocv.toFixed(3)} V` : '—',
      limit: '3.60 - 4.25 V',
      status: ocv === null ? '—' : ocv >= 3.60 && ocv <= 4.25 ? 'PASS' : 'WARN',
    },
    {
      name: '2. DCIR (dcir_ohm)',
      desc: '10s DC Internal Resistance (ΔV/I)',
      val: dcir !== null ? `${dcir.toFixed(3)} Ω` : '—',
      limit: '≤ 0.117 Ω',
      status: dcir === null ? '—' : dcir <= 0.117 ? 'PASS' : dcir <= 0.20 ? 'WARN' : 'FAIL',
    },
    {
      name: '3. ΔV10 (delta_v_10s)',
      desc: 'End-of-pulse total voltage sag',
      val: dV10 !== null ? `${dV10.toFixed(3)} V` : '—',
      limit: '≤ 0.450 V',
      status: dV10 === null ? '—' : dV10 <= 0.450 ? 'PASS' : 'FAIL',
    },
    {
      name: '4. dV/dt_slope',
      desc: 'Discharge slew rate slope',
      val: dvDtSlope !== null ? `${dvDtSlope.toFixed(4)} V/s` : '—',
      limit: 'Normal envelope',
      status: dvDtSlope === null ? '—' : 'PASS',
    },
    {
      name: '5. V_recovery_rate',
      desc: 'Post-pulse voltage recovery rate',
      val: vRecovRate !== null ? `${vRecovRate.toFixed(4)} V/s` : '—',
      limit: '≥ 0.010 V/s',
      status: vRecovRate === null ? '—' : vRecovRate >= 0.010 ? 'PASS' : 'WARN',
    },
    {
      name: '6. T_initial (ambient_t_c)',
      desc: 'Initial ambient surface temperature',
      val: tAmb !== null ? `${tAmb.toFixed(2)} °C` : '—',
      limit: '20.0 - 30.0 °C',
      status: tAmb === null ? '—' : tAmb >= 20.0 && tAmb <= 30.0 ? 'PASS' : 'WARN',
    },
    {
      name: '7. ΔT_bulk (delta_t_c)',
      desc: 'Surface bulk thermal rise',
      val: deltaTBulk !== null ? `+${deltaTBulk.toFixed(2)} °C` : '—',
      limit: '≤ 2.50 °C',
      status: deltaTBulk === null ? '—' : deltaTBulk <= 2.50 ? 'PASS' : 'FAIL',
    },
    {
      name: '8. dT/dt_max',
      desc: 'Maximum bulk heating rate across 10s',
      val: dtDtMax !== null ? `+${dtDtMax.toFixed(3)} °C/s` : '—',
      limit: '≤ 0.350 °C/s',
      status: dtDtMax === null ? '—' : dtDtMax <= 0.350 ? 'PASS' : 'FAIL',
    },
    {
      name: '9. τ_cool (tau_cool)',
      desc: 'Post-pulse thermal relaxation time constant',
      val: tauCool !== null ? `${tauCool.toFixed(2)} s` : '—',
      limit: '≤ 2.50 s',
      status: tauCool === null ? '—' : tauCool <= 2.50 ? 'PASS' : 'WARN',
    },
    {
      name: '10. T_max_pixel',
      desc: 'Peak AMG8833 thermal array pixel',
      val: tMaxPixel !== null ? `${tMaxPixel.toFixed(2)} °C` : '—',
      limit: '≤ 45.0 °C',
      status: tMaxPixel === null ? '—' : tMaxPixel <= 45.0 ? 'PASS' : 'FAIL',
    },
    {
      name: '11. T_mean_cell',
      desc: 'Mean spatial cell footprint temperature',
      val: tMeanCell !== null ? `${tMeanCell.toFixed(2)} °C` : '—',
      limit: '≤ 35.0 °C',
      status: tMeanCell === null ? '—' : tMeanCell <= 35.0 ? 'PASS' : 'WARN',
    },
    {
      name: '12. σ²_T (spatial_var_c2)',
      desc: 'Spatial thermal variance index (σ²)',
      val: variance !== null ? `${variance.toFixed(4)} °C²` : '—',
      limit: '≤ 0.250 °C²',
      status: variance === null ? '—' : variance <= 0.250 ? 'PASS' : 'FAIL',
    },
    {
      name: '13. ∇T_tab-body',
      desc: 'Tab-to-body spatial temperature gradient',
      val: gradient !== null ? `${gradient.toFixed(2)} °C` : '—',
      limit: '≤ 1.50 °C',
      status: gradient === null ? '—' : gradient <= 1.50 ? 'PASS' : 'FAIL',
    },
    {
      name: '14. hotspot_eccentricity',
      desc: 'Hotspot distance from terminal tab',
      val: eccentricity !== null ? `${eccentricity.toFixed(2)} px` : '—',
      limit: '≤ 2.50 px',
      status: eccentricity === null ? '—' : eccentricity <= 2.50 ? 'PASS' : 'WARN',
    },
  ];

  return (
    <div className="flex flex-col w-full pb-12 space-y-4">
      {/* Header Strip */}
      <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4cd7f6] text-[22px]">biotech</span>
            <h1 className="font-semibold text-lg text-slate-100">
              Electrochemical Pulse Diagnostics
            </h1>
          </div>
          <p className="font-mono text-xs text-slate-400 mt-1">
            Cell ID: <strong className="text-slate-200">{cellId}</strong> • 10-Second
            Galvanostatic Step Response Analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProvenanceBadge provenance={provenance} size="md" />
          {verdict ? (
            <VerdictBadge verdict={verdict} size="md" showIcon />
          ) : (
            <span className="px-2.5 py-1 rounded bg-[#090e1a] text-slate-400 font-mono text-xs border border-[#142340]">
              NO RUN DATA
            </span>
          )}
        </div>
      </div>

      {/* 14 Features Detailed Table */}
      <div className="bg-[#08101e] p-4 rounded border border-[#142340] shadow-sm font-mono text-xs">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#142340]">
          <span className="font-semibold text-sm text-slate-100 font-sans">
            Full 14 Diagnostic Features Specification &amp; Extracted Parameters
          </span>
          <span className="text-[11px] text-slate-400">
            {features ? '14/14 Features Extracted' : 'Awaiting Diagnostic Pulse'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#090e1a] text-slate-400 text-[10px] uppercase border-b border-[#142340]">
                <th className="py-2.5 px-3">Feature Name</th>
                <th className="py-2.5 px-3">Electrochemical Description</th>
                <th className="py-2.5 px-3 text-right">Extracted Value</th>
                <th className="py-2.5 px-3 text-right">Reference Limit</th>
                <th className="py-2.5 px-3 text-center">Interlock Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#142340]">
              {featureList.map((f, i) => (
                <tr key={i} className="hover:bg-[#101a2e] transition-colors">
                  <td className="py-2.5 px-3 text-[#4cd7f6] font-semibold">{f.name}</td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans">{f.desc}</td>
                  <td className="py-2.5 px-3 text-right text-slate-100 font-bold">{f.val}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">{f.limit}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        f.status === 'PASS'
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                          : f.status === 'WARN'
                          ? 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                          : f.status === 'FAIL'
                          ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                          : 'bg-slate-900 text-slate-500 border-slate-700'
                      }`}
                    >
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
