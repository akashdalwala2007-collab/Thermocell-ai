import React from 'react';

interface VerdictBadgeProps {
  verdict: 'REUSE' | 'INVESTIGATE' | 'RETIRE' | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
  verdict,
  size = 'sm',
  showIcon = false,
}) => {
  const norm = (verdict || 'INVESTIGATE').toUpperCase();

  let colors = 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
  let iconName = 'verified_user';

  if (norm === 'INVESTIGATE') {
    colors = 'bg-amber-950/80 text-amber-400 border border-amber-500/40';
    iconName = 'warning';
  } else if (norm === 'RETIRE') {
    colors = 'bg-rose-950/80 text-rose-400 border border-rose-500/40';
    iconName = 'dangerous';
  }

  const sizeClasses =
    size === 'lg'
      ? 'px-3 py-1 text-sm font-bold tracking-wide'
      : size === 'md'
      ? 'px-2 py-0.5 text-xs font-semibold'
      : 'px-1.5 py-0.5 text-[10px] font-bold';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-mono uppercase tracking-wider ${sizeClasses} ${colors}`}
    >
      {showIcon && <span className="material-symbols-outlined text-[13px] leading-none">{iconName}</span>}
      <span>{norm}</span>
    </span>
  );
};

