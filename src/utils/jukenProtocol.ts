import { BluetoothConfig, PacketProtocol, RawPacketLog, TelemetryFrame } from '../types/telemetry';

export const BLE_PROFILES: Record<
  string,
  { name: string; serviceUuid: string; rxUuid: string; txUuid: string; note: string }
> = {
  nordic_uart: {
    name: 'Nordic UART (BLE Dongle Modern / ESP32)',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    rxUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    txUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    note: 'Umum dipakai modul Bluetooth BLE Juken 5+ generasi baru & ESP32 bridge',
  },
  hm10_ffe0: {
    name: 'HM-10 / JDY-08 / AT-09 (FFE0 Serial)',
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    rxUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    txUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    note: 'Adaptor Bluetooth UART standar (HC-08 / HM-10 / JDY)',
  },
  microchip: {
    name: 'Microchip Transparent UART (RN4870 / BM70)',
    serviceUuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    rxUuid: '49535343-1e4d-4bd9-ba61-23c647249616',
    txUuid: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    note: 'Digunakan pada beberapa modul BLE industri',
  },
};

export const DEFAULT_BLE_CONFIG: BluetoothConfig = {
  serviceUuid: BLE_PROFILES.nordic_uart.serviceUuid,
  rxCharacteristicUuid: BLE_PROFILES.nordic_uart.rxUuid,
  txCharacteristicUuid: BLE_PROFILES.nordic_uart.txUuid,
  protocol: 'auto',
  pollCommandHex: 'AA 55 01 00 55',
  pollIntervalMs: 100,
  serialBaudRate: 38400,
};

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  const len = Math.floor(cleaned.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToPrintableAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('');
}

/**
 * Parses a raw telemetry packet from Juken 5+ BLE bridge into a partial or complete TelemetryFrame.
 * Supports:
 * 1) Juken Binary Frame: [0xAA, 0x55, rpmHi, rpmLo, afrX10, tpsX2, map, ect+40, iat+40, batX10, ignX2, injHi, injLo, speed, ...]
 * 2) CSV line: "8500,12.8,88.5,98,84,34,14.1,28.5,7.42,112"
 * 3) Key-Value ASCII: "RPM:8500 AFR:12.8 TPS:88.5 MAP:98 ECT:84 IAT:34 BAT:14.1 IGN:28.5 INJ:7.42 SPD:112"
 */
export function parseJukenPacket(
  bytes: Uint8Array,
  protocol: PacketProtocol,
  startTime: number,
  prevFrame: TelemetryFrame
): TelemetryFrame | null {
  const now = Date.now();
  const elapsedMs = now - startTime;

  // 1. Try binary frame (header 0xAA 0x55 or 0x55 0xAA, min 12 bytes)
  if ((protocol === 'auto' || protocol === 'juken_binary') && bytes.length >= 12) {
    for (let i = 0; i <= bytes.length - 12; i++) {
      const isHeader =
        (bytes[i] === 0xaa && bytes[i + 1] === 0x55) ||
        (bytes[i] === 0x55 && bytes[i + 1] === 0xaa);
      if (isHeader) {
        const rpm = (bytes[i + 2] << 8) | bytes[i + 3];
        const afr = bytes[i + 4] / 10;
        const tps = Math.min(100, Math.max(0, bytes[i + 5] / 2));
        const map = bytes[i + 6];
        const ect = bytes[i + 7] - 40;
        const iat = bytes[i + 8] - 40;
        const battery = bytes[i + 9] / 10;
        const ignTiming = bytes[i + 10] / 2;
        const injWidth =
          bytes.length >= i + 13 ? ((bytes[i + 11] << 8) | bytes[i + 12]) / 100 : prevFrame.injWidth;
        const speed = bytes.length >= i + 14 ? bytes[i + 13] : prevFrame.speed;

        if (rpm <= 20000 && afr >= 5 && afr <= 25) {
          return {
            timestamp: now,
            elapsedMs,
            rpm,
            afr: Number(afr.toFixed(1)),
            tps: Number(tps.toFixed(1)),
            map,
            ect,
            iat,
            battery: Number(battery.toFixed(1)),
            ignTiming: Number(ignTiming.toFixed(1)),
            injWidth: Number(injWidth.toFixed(2)),
            speed,
          };
        }
      }
    }
  }

  // Decode ASCII for CSV / Key-Value
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return null;

  // 2. Key-Value format: RPM:8400 AFR:12.9 TPS:72 ...
  if ((protocol === 'auto' || protocol === 'key_value') && /RPM[:=]/i.test(text)) {
    const extract = (regex: RegExp, fallback: number): number => {
      const m = text.match(regex);
      return m ? parseFloat(m[1]) : fallback;
    };
    return {
      timestamp: now,
      elapsedMs,
      rpm: Math.round(extract(/RPM[:=]\s*([\d.]+)/i, prevFrame.rpm)),
      afr: Number(extract(/AFR[:=]\s*([\d.]+)/i, prevFrame.afr).toFixed(1)),
      tps: Number(extract(/TPS[:=]\s*([\d.]+)/i, prevFrame.tps).toFixed(1)),
      map: Math.round(extract(/MAP[:=]\s*([\d.]+)/i, prevFrame.map)),
      ect: Math.round(extract(/(?:ECT|TEMP|EOT)[:=]\s*([\d.]+)/i, prevFrame.ect)),
      iat: Math.round(extract(/IAT[:=]\s*([\d.]+)/i, prevFrame.iat)),
      battery: Number(extract(/(?:BAT|VOLT|AKI)[:=]\s*([\d.]+)/i, prevFrame.battery).toFixed(1)),
      ignTiming: Number(extract(/(?:IGN|TIM|ADV)[:=]\s*([\d.]+)/i, prevFrame.ignTiming).toFixed(1)),
      injWidth: Number(extract(/(?:INJ|PW)[:=]\s*([\d.]+)/i, prevFrame.injWidth).toFixed(2)),
      speed: Math.round(extract(/(?:SPD|SPEED|KMH)[:=]\s*([\d.]+)/i, prevFrame.speed)),
    };
  }

  // 3. CSV format: RPM,AFR,TPS,MAP,ECT,IAT,BAT,IGN,INJ,SPEED
  if (protocol === 'auto' || protocol === 'csv') {
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
      const parts = line.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
        return {
          timestamp: now,
          elapsedMs,
          rpm: Math.round(parts[0]),
          afr: Number(parts[1].toFixed(1)),
          tps: Number(parts[2].toFixed(1)),
          map: !Number.isNaN(parts[3]) ? Math.round(parts[3]) : prevFrame.map,
          ect: !Number.isNaN(parts[4]) ? Math.round(parts[4]) : prevFrame.ect,
          iat: !Number.isNaN(parts[5]) ? Math.round(parts[5]) : prevFrame.iat,
          battery: !Number.isNaN(parts[6]) ? Number(parts[6].toFixed(1)) : prevFrame.battery,
          ignTiming: !Number.isNaN(parts[7]) ? Number(parts[7].toFixed(1)) : prevFrame.ignTiming,
          injWidth: !Number.isNaN(parts[8]) ? Number(parts[8].toFixed(2)) : prevFrame.injWidth,
          speed: !Number.isNaN(parts[9]) ? Math.round(parts[9]) : prevFrame.speed,
        };
      }
    }
  }

  return null;
}

export class JukenBluetoothClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rxChar: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private txChar: any = null;
  private pollTimer: number | null = null;
  private asciiBuffer = '';
  private startTime = Date.now();
  private lastFrame: TelemetryFrame = createInitialFrame();

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public getDeviceName(): string | null {
    return this.device?.name || null;
  }

  public async connect(
    config: BluetoothConfig,
    callbacks: {
      onFrame: (frame: TelemetryFrame) => void;
      onRawPacket: (log: RawPacketLog) => void;
      onDisconnect: (reason?: string) => void;
    }
  ): Promise<{ deviceName: string; serviceUuid: string }> {
    if (!this.isSupported()) {
      throw new Error('Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome/Edge di Android atau Desktop.');
    }

    const optionalServices = Array.from(
      new Set([
        config.serviceUuid.toLowerCase(),
        BLE_PROFILES.nordic_uart.serviceUuid,
        BLE_PROFILES.hm10_ffe0.serviceUuid,
        BLE_PROFILES.microchip.serviceUuid,
      ])
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices,
    });

    this.device = device;
    this.startTime = Date.now();
    this.asciiBuffer = '';

    device.addEventListener('gattserverdisconnected', () => {
      this.stopPolling();
      callbacks.onDisconnect('Koneksi Bluetooth terputus dari perangkat ECU.');
    });

    const server = await device.gatt.connect();

    // Attempt configured service first, then auto-probe known UART services
    let service = null;
    let usedServiceUuid = config.serviceUuid;
    const candidateServices = [config.serviceUuid, ...optionalServices];

    for (const uuid of candidateServices) {
      try {
        service = await server.getPrimaryService(uuid);
        usedServiceUuid = uuid;
        break;
      } catch {
        // try next UUID
      }
    }

    if (!service) {
      const services = await server.getPrimaryServices();
      if (services.length > 0) {
        service = services[0];
        usedServiceUuid = service.uuid;
      }
    }

    if (!service) {
      throw new Error('Service UART BLE tidak ditemukan pada perangkat ini.');
    }

    const characteristics = await service.getCharacteristics();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rxChar = characteristics.find((c: any) => c.uuid.toLowerCase() === config.rxCharacteristicUuid.toLowerCase())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || characteristics.find((c: any) => c.properties.notify || c.properties.indicate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.txChar = characteristics.find((c: any) => c.uuid.toLowerCase() === config.txCharacteristicUuid.toLowerCase())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);

    if (!this.rxChar) {
      throw new Error('Characteristic RX (Notify) tidak ditemukan pada modul Bluetooth.');
    }

    await this.rxChar.startNotifications();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rxChar.addEventListener('characteristicvaluechanged', (event: any) => {
      const value: DataView = event.target.value;
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const hex = bytesToHex(bytes);
      const ascii = bytesToPrintableAscii(bytes);

      callbacks.onRawPacket({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        direction: 'rx',
        hex,
        ascii,
      });

      // First try direct binary or complete chunk parse
      const directFrame = parseJukenPacket(bytes, config.protocol, this.startTime, this.lastFrame);
      if (directFrame) {
        this.lastFrame = directFrame;
        callbacks.onFrame(directFrame);
        return;
      }

      // Otherwise buffer ASCII lines until newline
      this.asciiBuffer += new TextDecoder().decode(bytes);
      if (this.asciiBuffer.includes('\n') || this.asciiBuffer.includes('\r')) {
        const lines = this.asciiBuffer.split(/[\r\n]+/);
        this.asciiBuffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const lineBytes = new TextEncoder().encode(line);
          const parsed = parseJukenPacket(lineBytes, config.protocol, this.startTime, this.lastFrame);
          if (parsed) {
            this.lastFrame = parsed;
            callbacks.onFrame(parsed);
          }
        }
      }
      if (this.asciiBuffer.length > 512) {
        this.asciiBuffer = this.asciiBuffer.slice(-128);
      }
    });

    // Optional polling loop if pollCommandHex is configured
    if (this.txChar && config.pollCommandHex.trim().length > 0 && config.pollIntervalMs >= 40) {
      const cmdBytes = hexToBytes(config.pollCommandHex);
      if (cmdBytes.length > 0) {
        this.pollTimer = window.setInterval(async () => {
          try {
            if (this.txChar?.properties.writeWithoutResponse) {
              await this.txChar.writeValueWithoutResponse(cmdBytes);
            } else if (this.txChar?.properties.write) {
              await this.txChar.writeValue(cmdBytes);
            }
          } catch {
            // ignore transient write collision
          }
        }, config.pollIntervalMs);
      }
    }

    callbacks.onRawPacket({
      id: `${Date.now()}-info`,
      timestamp: Date.now(),
      direction: 'info',
      hex: '-',
      ascii: `Terhubung ke ${device.name || 'Juken 5+ BLE'} (${usedServiceUuid})`,
    });

    return {
      deviceName: device.name || 'Perangkat Juken 5+ BLE',
      serviceUuid: usedServiceUuid,
    };
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async disconnect(): Promise<void> {
    this.stopPolling();
    try {
      if (this.rxChar) {
        await this.rxChar.stopNotifications();
      }
    } catch {
      // ignore
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
  }
}

/**
 * Windows / Desktop Web Serial client for USB-TTL / FTDI / CH340 / CP2102 or Bluetooth SPP COM ports.
 */
export class JukenSerialClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private port: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reader: any = null;
  private pollTimer: number | null = null;
  private keepReading = false;
  private asciiBuffer = '';
  private startTime = Date.now();
  private lastFrame: TelemetryFrame = createInitialFrame();

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public async connect(
    config: BluetoothConfig,
    callbacks: {
      onFrame: (frame: TelemetryFrame) => void;
      onRawPacket: (log: RawPacketLog) => void;
      onDisconnect: (reason?: string) => void;
    }
  ): Promise<{ portLabel: string; baudRate: number }> {
    if (!this.isSupported()) {
      throw new Error(
        'Browser ini tidak mendukung Web Serial API. Gunakan Google Chrome atau Microsoft Edge di Windows 10/11.'
      );
    }

    const baudRate = config.serialBaudRate && config.serialBaudRate > 0 ? config.serialBaudRate : 38400;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const port = await nav.serial.requestPort();
    await port.open({ baudRate });

    this.port = port;
    this.startTime = Date.now();
    this.asciiBuffer = '';
    this.keepReading = true;

    const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
    const portLabel = info.usbVendorId
      ? `USB Serial (${info.usbVendorId.toString(16).toUpperCase()}:${(info.usbProductId || 0)
          .toString(16)
          .toUpperCase()})`
      : `COM Port (${baudRate} bps)`;

    callbacks.onRawPacket({
      id: `${Date.now()}-serial-info`,
      timestamp: Date.now(),
      direction: 'info',
      hex: '-',
      ascii: `Terhubung via ${portLabel} @ ${baudRate} baud`,
    });

    // Optional polling loop for active ECU request frames
    if (port.writable && config.pollCommandHex.trim().length > 0 && config.pollIntervalMs >= 40) {
      const cmdBytes = hexToBytes(config.pollCommandHex);
      if (cmdBytes.length > 0) {
        this.pollTimer = window.setInterval(async () => {
          if (!this.port?.writable || !this.keepReading) return;
          const writer = this.port.writable.getWriter();
          try {
            await writer.write(cmdBytes);
          } catch {
            // ignore transient write error
          } finally {
            writer.releaseLock();
          }
        }, config.pollIntervalMs);
      }
    }

    // Background async read loop
    (async () => {
      try {
        while (this.port?.readable && this.keepReading) {
          this.reader = this.port.readable.getReader();
          try {
            while (this.keepReading) {
              const { value, done } = await this.reader.read();
              if (done) break;
              if (!value || value.length === 0) continue;

              const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
              callbacks.onRawPacket({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: Date.now(),
                direction: 'rx',
                hex: bytesToHex(bytes),
                ascii: bytesToPrintableAscii(bytes),
              });

              const directFrame = parseJukenPacket(
                bytes,
                config.protocol,
                this.startTime,
                this.lastFrame
              );
              if (directFrame) {
                this.lastFrame = directFrame;
                callbacks.onFrame(directFrame);
                continue;
              }

              this.asciiBuffer += new TextDecoder().decode(bytes);
              if (this.asciiBuffer.includes('\n') || this.asciiBuffer.includes('\r')) {
                const lines = this.asciiBuffer.split(/[\r\n]+/);
                this.asciiBuffer = lines.pop() || '';
                for (const line of lines) {
                  if (!line.trim()) continue;
                  const lineBytes = new TextEncoder().encode(line);
                  const parsed = parseJukenPacket(
                    lineBytes,
                    config.protocol,
                    this.startTime,
                    this.lastFrame
                  );
                  if (parsed) {
                    this.lastFrame = parsed;
                    callbacks.onFrame(parsed);
                  }
                }
              }
              if (this.asciiBuffer.length > 512) {
                this.asciiBuffer = this.asciiBuffer.slice(-128);
              }
            }
          } finally {
            this.reader?.releaseLock();
            this.reader = null;
          }
        }
      } catch {
        if (this.keepReading) {
          callbacks.onDisconnect('Koneksi kabel USB / COM Port terputus.');
        }
      }
    })();

    return { portLabel, baudRate };
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async disconnect(): Promise<void> {
    this.keepReading = false;
    this.stopPolling();
    try {
      if (this.reader) {
        await this.reader.cancel();
      }
    } catch {
      // ignore
    }
    try {
      if (this.port) {
        await this.port.close();
      }
    } catch {
      // ignore
    }
    this.reader = null;
    this.port = null;
  }
}

export function createInitialFrame(): TelemetryFrame {
  return {
    timestamp: Date.now(),
    elapsedMs: 0,
    rpm: 1450,
    afr: 13.8,
    tps: 2.0,
    map: 36,
    ect: 76,
    iat: 32,
    battery: 13.9,
    ignTiming: 14.5,
    injWidth: 2.15,
    speed: 0,
  };
}

/**
 * Physics-inspired Juken 5+ 4-stroke racing engine simulator for testing without hardware.
 */
export class EngineSimulator {
  private startTime = Date.now();
  private tps = 3;
  private rpm = 1450;
  private ect = 74;
  private gear = 1;
  private cycleTime = 0;

  public reset(): void {
    this.startTime = Date.now();
    this.cycleTime = 0;
  }

  public step(
    dtSec: number,
    scenario: 'dyno' | 'touring' | 'idle' | 'manual',
    manualThrottle: number
  ): TelemetryFrame {
    this.cycleTime += dtSec;
    const now = Date.now();
    const elapsedMs = now - this.startTime;

    let targetTps = 2;
    let loadFactor = 0.25;

    if (scenario === 'idle') {
      targetTps = 1.8 + Math.sin(this.cycleTime * 3.1) * 0.4;
      loadFactor = 0.1;
    } else if (scenario === 'manual') {
      targetTps = manualThrottle;
      loadFactor = Math.max(0.15, targetTps / 100);
    } else if (scenario === 'dyno') {
      // Realistic 12-second dyno pull cycle: warm idle -> WOT pull to 11,800 RPM -> decel overrun
      const phase = this.cycleTime % 12;
      if (phase < 1.8) {
        targetTps = 3;
        loadFactor = 0.15;
      } else if (phase < 7.2) {
        targetTps = Math.min(100, 12 + ((phase - 1.8) / 1.2) * 88);
        loadFactor = 0.95;
      } else if (phase < 8.4) {
        targetTps = 100;
        loadFactor = 1.0;
      } else {
        targetTps = 0.5;
        loadFactor = 0.08;
      }
    } else {
      // Touring / Street riding across gears 1-5
      const wave =
        Math.sin(this.cycleTime * 0.45) * 32 +
        Math.sin(this.cycleTime * 1.2) * 18 +
        38;
      targetTps = Math.max(2, Math.min(92, wave));
      loadFactor = Math.max(0.2, targetTps / 100);
    }

    // Smooth TPS actuator response
    this.tps += (targetTps - this.tps) * Math.min(1, dtSec * 8);

    // Calculate target RPM based on TPS & scenario
    let targetRpm = 1400 + (this.tps / 100) * 10600;
    if (scenario === 'dyno') {
      const phase = this.cycleTime % 12;
      if (phase >= 1.8 && phase < 8.4) {
        const pullProgress = (phase - 1.8) / 6.6;
        targetRpm = 2800 + Math.pow(pullProgress, 0.85) * 9200;
      } else if (phase >= 8.4) {
        targetRpm = Math.max(1450, this.rpm - 2600 * dtSec);
      } else {
        targetRpm = 1480 + Math.sin(this.cycleTime * 7) * 45;
      }
      this.rpm += (targetRpm - this.rpm) * Math.min(1, dtSec * 5.5);
    } else {
      // Simulate subtle gear shift drops in touring mode
      if (scenario === 'touring' && this.rpm > 9200 && this.gear < 5) {
        this.gear += 1;
        this.rpm -= 2100;
      } else if (scenario === 'touring' && this.rpm < 3400 && this.gear > 1) {
        this.gear -= 1;
        this.rpm += 1400;
      }
      this.rpm += (targetRpm - this.rpm) * Math.min(1, dtSec * 2.8);
    }

    // Add realistic crankshaft RPM jitter
    const rpmJitter = (Math.random() - 0.5) * (this.tps > 50 ? 110 : 55);
    const finalRpm = Math.max(1100, Math.min(13200, Math.round(this.rpm + rpmJitter)));

    // MAP follows TPS & RPM (vacuum at idle ~34 kPa, WOT ~99 kPa)
    const map = Math.round(
      Math.max(22, Math.min(102, 32 + (this.tps / 100) * 67 + (Math.random() - 0.5) * 2))
    );

    // Realistic Juken 5+ AFR mapping:
    // Idle ~13.7, Cruise/mid TPS ~13.9-14.4, WOT/Power ~12.4-12.9, Decel overrun ~16.2, slight lean blip at 7800 RPM
    let baseAfr = 13.8;
    if (this.tps < 3 && finalRpm > 3800) {
      baseAfr = 15.8 + Math.random() * 0.6; // Decel fuel cut / lean overrun
    } else if (this.tps > 75) {
      baseAfr = 12.7 - (finalRpm / 12000) * 0.35;
      if (finalRpm > 7400 && finalRpm < 8300) {
        baseAfr += 0.65; // realistic mid-high tuning lean spot for chart analysis!
      }
    } else if (this.tps > 20) {
      baseAfr = 13.9 - (this.tps / 100) * 1.1;
    } else {
      baseAfr = 13.7;
    }
    const afr = Number(
      Math.max(10.5, Math.min(17.8, baseAfr + (Math.random() - 0.5) * 0.25)).toFixed(1)
    );

    // Ignition advance curve (°BTDC)
    const ignBase = 12 + Math.min(24, (finalRpm / 9500) * 24) - (this.tps / 100) * 4.5;
    const ignTiming = Number(Math.max(8, Math.min(38, ignBase + (Math.random() - 0.5) * 0.6)).toFixed(1));

    // Injector pulse width (ms) scales with RPM & MAP/TPS
    const injWidth = Number(
      Math.max(1.4, Math.min(14.5, 1.85 + (this.tps / 100) * 7.8 + (finalRpm / 12000) * 2.4)).toFixed(2)
    );

    // Engine coolant/oil temp slowly climbs under high RPM load, cools at idle
    const targetEct = 78 + loadFactor * 22;
    this.ect += (targetEct - this.ect) * dtSec * 0.08;
    const ect = Math.round(this.ect);
    const iat = Math.round(31 + (ect - 75) * 0.22 + (Math.random() - 0.5) * 0.8);

    // Battery voltage: alternator charges ~14.1V above 2000 RPM, ~12.8V at low idle
    const battery = Number(
      Math.min(14.4, Math.max(12.2, 12.7 + Math.min(1.5, (finalRpm / 4000) * 1.4) + (Math.random() - 0.5) * 0.08)).toFixed(1)
    );

    // Speed correlation
    const speedRatio = scenario === 'dyno' ? 0.0125 : 0.008 + this.gear * 0.0018;
    const speed = scenario === 'idle' ? 0 : Math.round(Math.max(0, (finalRpm - 1300) * speedRatio));

    return {
      timestamp: now,
      elapsedMs,
      rpm: finalRpm,
      afr,
      tps: Number(this.tps.toFixed(1)),
      map,
      ect,
      iat,
      battery,
      ignTiming,
      injWidth,
      speed,
    };
  }
}
