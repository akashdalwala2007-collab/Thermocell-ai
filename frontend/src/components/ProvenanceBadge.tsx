import React from 'react';

interface ProvenanceBadgeProps {
  provenance: 'REAL' | 'SYNTHETIC' | 'PREDICTED' | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  size = 'sm',
  showIcon = true,
}) => {
  const norm = (provenance || 'PREDICTED').toUpperCase();

  if (norm === 'REAL') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-bold rounded uppercase tracking-wider ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        } bg-[#38bdf8] text-[#070c18]`}
        title="Hardware Sensor Ground Truth"
      >
        {showIcon && <span className="material-symbols-outlined text-[12px] leading-none">sensors</span>}
        <span>REAL</span>
      </span>
    );
  }

  if (norm === 'SYNTHETIC') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono font-bold rounded uppercase tracking-wider ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        } bg-[#a78bfa] text-[#070c18]`}
        title="Hardware-in-the-Loop Simulation"
      >
        {showIcon && <span className="material-symbols-outlined text-[12px] leading-none">science</span>}
        <span>SYNTHETIC</span>
      </span>
    );
  }

  // Default: PREDICTED
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-bold rounded uppercase tracking-wider border border-dashed border-[#06b6d4] text-[#06b6d4] bg-[#06b6d4]/10 ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
      title="Electrochemical ML Model Inference"
    >
      {showIcon && <span className="material-symbols-outlined text-[12px] leading-none">memory</span>}
      <span>PREDICTED</span>
    </span>
  );
};

