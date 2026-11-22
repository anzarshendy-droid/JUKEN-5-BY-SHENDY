export type SensorKey =
  | 'rpm'
  | 'afr'
  | 'tps'
  | 'map'
  | 'ect'
  | 'iat'
  | 'battery'
  | 'ignTiming'
  | 'injWidth'
  | 'speed';

export interface TelemetryFrame {
  timestamp: number; // ms epoch
  elapsedMs: number; // ms since session/stream start
  rpm: number;
  afr: number;
  tps: number;
  map: number;
  ect: number;
  iat: number;
  battery: number;
  ignTiming: number;
  injWidth: number;
  speed: number;
}

export interface SensorMeta {
  key: SensorKey;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  color: string;
  description: string;
}

export const SENSOR_CATALOG: Record<SensorKey, SensorMeta> = {
  rpm: {
    key: 'rpm',
    label: 'Putaran Mesin (RPM)',
    shortLabel: 'RPM',
    unit: 'RPM',
    min: 0,
    max: 14000,
    decimals: 0,
    color: '#F97316',
    description: 'Kecepatan putaran poros engkol mesin per menit',
  },
  afr: {
    key: 'afr',
    label: 'Air-Fuel Ratio (AFR)',
    shortLabel: 'AFR',
    unit: ':1',
    min: 10.0,
    max: 18.0,
    decimals: 1,
    color: '#10B981',
    description: 'Rasio campuran udara dan bahan bakar aktual dari sensor O2/Wideband',
  },
  tps: {
    key: 'tps',
    label: 'Throttle Position (TPS)',
    shortLabel: 'TPS',
    unit: '%',
    min: 0,
    max: 100,
    decimals: 1,
    color: '#38BDF8',
    description: 'Persentase bukaan katup throttle body',
  },
  map: {
    key: 'map',
    label: 'Manifold Pressure (MAP)',
    shortLabel: 'MAP',
    unit: 'kPa',
    min: 15,
    max: 110,
    decimals: 0,
    color: '#A78BFA',
    description: 'Tekanan vakum / absolut di intake manifold',
  },
  ect: {
    key: 'ect',
    label: 'Suhu Mesin (ECT/EOT)',
    shortLabel: 'Suhu Mesin',
    unit: '°C',
    min: 20,
    max: 130,
    decimals: 0,
    color: '#F59E0B',
    description: 'Temperatur blok mesin / cairan pendingin',
  },
  iat: {
    key: 'iat',
    label: 'Suhu Udara Masuk (IAT)',
    shortLabel: 'IAT',
    unit: '°C',
    min: 15,
    max: 80,
    decimals: 0,
    color: '#2DD4BF',
    description: 'Temperatur udara yang masuk ke throttle body',
  },
  battery: {
    key: 'battery',
    label: 'Tegangan Aki',
    shortLabel: 'Aki',
    unit: 'V',
    min: 10.0,
    max: 15.5,
    decimals: 1,
    color: '#60A5FA',
    description: 'Voltase sistem pengisian dan aki motor',
  },
  ignTiming: {
    key: 'ignTiming',
    label: 'Ignition Timing',
    shortLabel: 'Timing',
    unit: '°BTDC',
    min: 0,
    max: 45,
    decimals: 1,
    color: '#FB7185',
    description: 'Sudut pengapian sebelum titik mati atas',
  },
  injWidth: {
    key: 'injWidth',
    label: 'Durasi Injektor',
    shortLabel: 'Injektor',
    unit: 'ms',
    min: 0,
    max: 16,
    decimals: 2,
    color: '#C084FC',
    description: 'Lebar pulsa penyemprotan bahan bakar injektor',
  },
  speed: {
    key: 'speed',
    label: 'Kecepatan',
    shortLabel: 'Speed',
    unit: 'km/h',
    min: 0,
    max: 200,
    decimals: 0,
    color: '#E2E8F0',
    description: 'Kecepatan roda kendaraan dari sensor VSS',
  },
};

export type WidgetStyle = 'gauge' | 'numeric' | 'bar' | 'sparkline';
export type WidgetSize = 'half' | 'wide';

export interface WidgetConfig {
  id: string;
  sensor: SensorKey;
  style: WidgetStyle;
  size: WidgetSize;
}

export interface DashboardPreset {
  id: string;
  name: string;
  widgets: WidgetConfig[];
}

export interface AlertThresholds {
  shiftRpm: number;
  limiterRpm: number;
  afrLeanWarning: number;
  afrRichWarning: number;
  ectHighWarning: number;
  batteryLowWarning: number;
}

export type ConnectionMode = 'disconnected' | 'bluetooth' | 'serial' | 'simulator';
export type SimulatorScenario = 'dyno' | 'touring' | 'idle' | 'manual';

export type PacketProtocol = 'auto' | 'juken_binary' | 'csv' | 'key_value';

export interface BluetoothConfig {
  serviceUuid: string;
  rxCharacteristicUuid: string;
  txCharacteristicUuid: string;
  protocol: PacketProtocol;
  pollCommandHex: string;
  pollIntervalMs: number;
}

export interface RawPacketLog {
  id: string;
  timestamp: number;
  direction: 'rx' | 'tx' | 'info';
  hex: string;
  ascii: string;
}

export interface LogSession {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  sampleRateHz: number;
  source: 'bluetooth' | 'serial' | 'simulator' | 'imported';
  isSample?: boolean;
  notes?: string;
  frames: TelemetryFrame[];
}

export type ActiveTab = 'dashboard' | 'analytics' | 'logs' | 'connection';
