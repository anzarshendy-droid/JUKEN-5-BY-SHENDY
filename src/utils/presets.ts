import { AlertThresholds, DashboardPreset, SENSOR_CATALOG, SensorKey, TelemetryFrame } from '../types/telemetry';

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  shiftRpm: 9800,
  limiterRpm: 11800,
  afrLeanWarning: 14.8,
  afrRichWarning: 11.4,
  ectHighWarning: 105,
  batteryLowWarning: 11.9,
};

export const DEFAULT_PRESETS: DashboardPreset[] = [
  {
    id: 'preset-balap',
    name: 'Mode Balap',
    widgets: [
      { id: 'w-rpm', sensor: 'rpm', style: 'gauge', size: 'wide' },
      { id: 'w-afr', sensor: 'afr', style: 'gauge', size: 'half' },
      { id: 'w-tps', sensor: 'tps', style: 'bar', size: 'half' },
      { id: 'w-ign', sensor: 'ignTiming', style: 'numeric', size: 'half' },
      { id: 'w-ect', sensor: 'ect', style: 'numeric', size: 'half' },
      { id: 'w-inj', sensor: 'injWidth', style: 'sparkline', size: 'wide' },
    ],
  },
  {
    id: 'preset-dyno',
    name: 'Dyno Tuning',
    widgets: [
      { id: 'w-rpm', sensor: 'rpm', style: 'gauge', size: 'half' },
      { id: 'w-afr', sensor: 'afr', style: 'sparkline', size: 'half' },
      { id: 'w-tps', sensor: 'tps', style: 'bar', size: 'half' },
      { id: 'w-map', sensor: 'map', style: 'numeric', size: 'half' },
      { id: 'w-ign', sensor: 'ignTiming', style: 'sparkline', size: 'half' },
      { id: 'w-inj', sensor: 'injWidth', style: 'numeric', size: 'half' },
      { id: 'w-ect', sensor: 'ect', style: 'bar', size: 'half' },
      { id: 'w-bat', sensor: 'battery', style: 'numeric', size: 'half' },
    ],
  },
  {
    id: 'preset-harian',
    name: 'Touring Harian',
    widgets: [
      { id: 'w-speed', sensor: 'speed', style: 'gauge', size: 'half' },
      { id: 'w-rpm', sensor: 'rpm', style: 'bar', size: 'half' },
      { id: 'w-afr', sensor: 'afr', style: 'numeric', size: 'half' },
      { id: 'w-ect', sensor: 'ect', style: 'numeric', size: 'half' },
      { id: 'w-bat', sensor: 'battery', style: 'numeric', size: 'half' },
      { id: 'w-iat', sensor: 'iat', style: 'numeric', size: 'half' },
    ],
  },
];

export type SensorStatus = {
  level: 'normal' | 'warning' | 'critical';
  label: string;
};

export function evaluateSensorStatus(
  sensor: SensorKey,
  value: number,
  frame: TelemetryFrame,
  thresholds: AlertThresholds
): SensorStatus {
  if (sensor === 'rpm') {
    if (value >= thresholds.limiterRpm) {
      return { level: 'critical', label: 'Limiter' };
    }
    if (value >= thresholds.shiftRpm) {
      return { level: 'warning', label: 'Shift RPM' };
    }
    return { level: 'normal', label: 'Normal' };
  }

  if (sensor === 'afr') {
    // Ignore decel fuel cut overrun when TPS < 3%
    if (frame.tps >= 5 && value >= thresholds.afrLeanWarning) {
      return { level: 'critical', label: 'Terlalu Kering (Lean)' };
    }
    if (value <= thresholds.afrRichWarning) {
      return { level: 'warning', label: 'Terlalu Basah (Rich)' };
    }
    if (value >= 12.2 && value <= 13.4 && frame.tps > 60) {
      return { level: 'normal', label: 'Optimal Tenaga' };
    }
    if (value >= 13.5 && value <= 14.7) {
      return { level: 'normal', label: 'Stoikiometri' };
    }
    return { level: 'normal', label: 'Normal' };
  }

  if (sensor === 'ect') {
    if (value >= thresholds.ectHighWarning) {
      return { level: 'critical', label: 'Panas Berlebih' };
    }
    if (value >= thresholds.ectHighWarning - 8) {
      return { level: 'warning', label: 'Suhu Tinggi' };
    }
    if (value < 55) {
      return { level: 'normal', label: 'Pemanasan' };
    }
    return { level: 'normal', label: 'Suhu Ideal' };
  }

  if (sensor === 'battery') {
    if (value <= thresholds.batteryLowWarning) {
      return { level: 'critical', label: 'Tegangan Rendah' };
    }
    if (value >= 14.8) {
      return { level: 'warning', label: 'Overcharge' };
    }
    return { level: 'normal', label: 'Pengisian Baik' };
  }

  const meta = SENSOR_CATALOG[sensor];
  const pct = (value - meta.min) / Math.max(1, meta.max - meta.min);
  if (sensor === 'tps' && pct > 0.9) {
    return { level: 'normal', label: 'Gas Penuh (WOT)' };
  }
  return { level: 'normal', label: 'Aktif' };
}
