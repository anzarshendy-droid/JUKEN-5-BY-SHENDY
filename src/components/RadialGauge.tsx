import React from 'react';

interface RadialGaugeProps {
  value: number;
  min: number;
  max: number;
  peakValue?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  label: string;
  unit: string;
  decimals: number;
  accentColor: string;
  compact?: boolean;
}

export const RadialGauge: React.FC<RadialGaugeProps> = ({
  value,
  min,
  max,
  peakValue,
  warningThreshold,
  criticalThreshold,
  label,
  unit,
  decimals,
  accentColor,
  compact = false,
}) => {
  const size = compact ? 156 : 196;
  const strokeWidth = compact ? 12 : 14;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - strokeWidth - 8;

  // Sweep from 135 deg to 405 deg (270 degree arc)
  const startAngle = 135;
  const sweepAngle = 270;

  const clampRatio = (v: number) => Math.max(0, Math.min(1, (v - min) / Math.max(0.0001, max - min)));
  const ratio = clampRatio(value);
  const peakRatio = peakValue !== undefined ? clampRatio(peakValue) : null;

  const polarToCartesian = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const describeArc = (startDeg: number, endDeg: number, r: number) => {
    // SVG arc sweep needs clockwise adjustment: 0 deg at top
    const start = polarToCartesian(startDeg + 90, r);
    const end = polarToCartesian(endDeg + 90, r);
    const largeArc = endDeg - startDeg <= 180 ? '0' : '1';
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const currentAngle = startAngle + ratio * sweepAngle;

  let activeColor = accentColor;
  if (criticalThreshold !== undefined && value >= criticalThreshold) {
    activeColor = '#EF4444';
  } else if (warningThreshold !== undefined && value >= warningThreshold) {
    activeColor = '#F59E0B';
  }

  // Generate 7 major tick marks
  const ticks = Array.from({ length: 7 }, (_, i) => {
    const tRatio = i / 6;
    const deg = startAngle + tRatio * sweepAngle;
    const p1 = polarToCartesian(deg + 90, radius - strokeWidth / 2 - 3);
    const p2 = polarToCartesian(deg + 90, radius - strokeWidth / 2 - 9);
    const isRed = criticalThreshold !== undefined && min + tRatio * (max - min) >= criticalThreshold;
    return { p1, p2, isRed };
  });

  const formattedValue = value.toFixed(decimals);

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        width={size}
        height={size * 0.86}
        viewBox={`0 0 ${size} ${size * 0.9}`}
        className="overflow-visible"
        aria-label={`${label}: ${formattedValue} ${unit}`}
      >
        {/* Background track arc */}
        <path
          d={describeArc(startAngle, startAngle + sweepAngle, radius)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Optional redline arc segment */}
        {criticalThreshold !== undefined && criticalThreshold < max && (
          <path
            d={describeArc(
              startAngle + clampRatio(criticalThreshold) * sweepAngle,
              startAngle + sweepAngle,
              radius
            )}
            fill="none"
            stroke="rgba(239,68,68,0.32)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Active value arc */}
        {ratio > 0.005 && (
          <path
            d={describeArc(startAngle, currentAngle, radius)}
            fill="none"
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: 'stroke 150ms ease-out' }}
          />
        )}

        {/* Tick marks */}
        {ticks.map((t, idx) => (
          <line
            key={idx}
            x1={t.p1.x}
            y1={t.p1.y}
            x2={t.p2.x}
            y2={t.p2.y}
            stroke={t.isRed ? 'rgba(239,68,68,0.75)' : 'rgba(148,163,184,0.35)'}
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        ))}

        {/* Peak-hold marker dot */}
        {peakRatio !== null && peakRatio > 0.02 && (
          (() => {
            const pDeg = startAngle + peakRatio * sweepAngle;
            const pos = polarToCartesian(pDeg + 90, radius);
            return (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={3.5}
                fill="#F8FAFC"
                stroke="#0A0D12"
                strokeWidth={1.5}
              />
            );
          })()
        )}

        {/* Center numeric readout */}
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          className="fill-slate-100 font-mono font-bold tabular-nums"
          style={{ fontSize: compact ? '24px' : '30px' }}
        >
          {formattedValue}
        </text>
        <text
          x={cx}
          y={cy + (compact ? 22 : 26)}
          textAnchor="middle"
          className="fill-slate-400 font-sans font-medium"
          style={{ fontSize: '11px' }}
        >
          {unit}
        </text>
      </svg>
    </div>
  );
};
