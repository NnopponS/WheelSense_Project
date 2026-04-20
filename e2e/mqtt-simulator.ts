/**
 * MQTT Simulator Helper for E2E Tests
 * 
 * Provides synthetic hardware data injection for the 5 patients from redesign seed:
 * - Emika (critical, ICU-101)
 * - Somchai (special, Ward-A)
 * - Rattana (normal, Ward-B)
 * - Krit (normal, Ward-C)
 * - Wichai (normal, Garden-1)
 */

import mqtt from 'mqtt';

export interface SimPatient {
  id: number;
  name: string;
  careLevel: 'critical' | 'special' | 'normal';
  deviceId: string;
  roomId: number;
  roomName: string;
}

// 5 patients from redesign seed
export const SIM_PATIENTS: SimPatient[] = [
  { id: 1, name: 'Emika', careLevel: 'critical', deviceId: 'WS-DEV-001', roomId: 1, roomName: 'ICU-101' },
  { id: 2, name: 'Somchai', careLevel: 'special', deviceId: 'WS-DEV-002', roomId: 2, roomName: 'Ward-A' },
  { id: 3, name: 'Rattana', careLevel: 'normal', deviceId: 'WS-DEV-003', roomId: 3, roomName: 'Ward-B' },
  { id: 4, name: 'Krit', careLevel: 'normal', deviceId: 'WS-DEV-004', roomId: 4, roomName: 'Ward-C' },
  { id: 5, name: 'Wichai', careLevel: 'normal', deviceId: 'WS-DEV-005', roomId: 5, roomName: 'Garden-1' },
];

const MQTT_BROKER = process.env.MQTT_BROKER || 'localhost';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883');

export interface TelemetryPayload {
  device_id: string;
  heart_rate_bpm: number;
  rr_interval_ms: number;
  spo2: number;
  sensor_battery: number;
  room_id: number;
  room_name: string;
  imu_ax: number;
  imu_ay: number;
  imu_az: number;
  velocity: number;
  motion_state: 'idle' | 'moving' | 'fall_detected';
  timestamp: string;
}

export interface PolarH10Payload {
  device_id: string;
  heart_rate: number;
  rr_intervals: number[];
  battery_level: number;
  timestamp: string;
}

export class MqttSimulator {
  private client: mqtt.MqttClient | null = null;
  private connected = false;
  private publishInterval: NodeJS.Timeout | null = null;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(`mqtt://${MQTT_BROKER}:${MQTT_PORT}`, {
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.connected = true;
        console.log('[MQTT Simulator] Connected to broker');
        resolve();
      });

      this.client.on('error', (err) => {
        console.error('[MQTT Simulator] Connection error:', err.message);
        reject(err);
      });
    });
  }

  disconnect(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Publish wheelchair telemetry for a patient
   */
  publishWheelchairTelemetry(patient: SimPatient, isFall: boolean = false): void {
    if (!this.client || !this.connected) return;

    const careLevelRanges = {
      critical: { hr: [85, 120], spo2: [88, 95] },
      special: { hr: [70, 110], spo2: [90, 97] },
      normal: { hr: [60, 90], spo2: [95, 100] },
    };

    const ranges = careLevelRanges[patient.careLevel];
    const hr = Math.floor(Math.random() * (ranges.hr[1] - ranges.hr[0]) + ranges.hr[0]);
    const spo2 = Math.floor(Math.random() * (ranges.spo2[1] - ranges.spo2[0]) + ranges.spo2[0]);
    const rrInterval = Math.floor(60000 / hr);

    const payload: TelemetryPayload = {
      device_id: patient.deviceId,
      heart_rate_bpm: hr,
      rr_interval_ms: rrInterval,
      spo2: spo2,
      sensor_battery: Math.floor(Math.random() * 40 + 60), // 60-100%
      room_id: patient.roomId,
      room_name: patient.roomName,
      imu_ax: isFall ? Math.random() * 4 - 2 : Math.random() * 1 - 0.5,
      imu_ay: isFall ? Math.random() * 4 - 2 : Math.random() * 1 - 0.5,
      imu_az: isFall ? 3.5 : 1.0,
      velocity: isFall ? 0.01 : Math.random() * 0.5,
      motion_state: isFall ? 'fall_detected' : (Math.random() > 0.7 ? 'moving' : 'idle'),
      timestamp: new Date().toISOString(),
    };

    const topic = `WheelSense/wheelchair/${patient.deviceId}/telemetry`;
    this.client.publish(topic, JSON.stringify(payload));
    console.log(`[MQTT Simulator] Published wheelchair telemetry for ${patient.name}`);
  }

  /**
   * Publish Polar H10 heart rate data
   */
  publishPolarH10(patient: SimPatient): void {
    if (!this.client || !this.connected) return;
    if (patient.id > 2) return; // Only Emika and Somchai have Polar H10

    const careLevelRanges = {
      critical: [85, 120],
      special: [70, 110],
      normal: [60, 90],
    };

    const ranges = careLevelRanges[patient.careLevel];
    const hr = Math.floor(Math.random() * (ranges[1] - ranges[0]) + ranges[0]);

    const payload: PolarH10Payload = {
      device_id: `${patient.deviceId}-POLAR`,
      heart_rate: hr,
      rr_intervals: [Math.floor(60000 / hr), Math.floor(60000 / hr) + 50],
      battery_level: Math.floor(Math.random() * 30 + 70),
      timestamp: new Date().toISOString(),
    };

    const topic = `WheelSense/polar/${patient.deviceId}-POLAR/hr`;
    this.client.publish(topic, JSON.stringify(payload));
    console.log(`[MQTT Simulator] Published Polar H10 data for ${patient.name}`);
  }

  /**
   * Publish node/UWB positioning data
   */
  publishNodePosition(patient: SimPatient): void {
    if (!this.client || !this.connected) return;

    const nodeId = `NODE_ROOM_${patient.roomId}`;
    const payload = {
      node_id: nodeId,
      device_id: patient.deviceId,
      room_id: patient.roomId,
      room_name: patient.roomName,
      x: Math.random() * 10 + 2, // 2-12 meters
      y: Math.random() * 8 + 1,  // 1-9 meters
      z: 0,
      accuracy: Math.random() * 0.5 + 0.5, // 0.5-1.0m
      timestamp: new Date().toISOString(),
    };

    const topic = `WheelSense/node/${nodeId}/position`;
    this.client.publish(topic, JSON.stringify(payload));
    console.log(`[MQTT Simulator] Published node position for ${patient.name}`);
  }

  /**
   * Simulate fall event for a patient
   */
  async simulateFall(patientId: number): Promise<void> {
    const patient = SIM_PATIENTS.find(p => p.id === patientId);
    if (!patient) throw new Error(`Patient ${patientId} not found`);

    console.log(`[MQTT Simulator] Simulating FALL for ${patient.name}`);
    
    // Publish multiple fall-indicator messages
    for (let i = 0; i < 3; i++) {
      this.publishWheelchairTelemetry(patient, true);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  /**
   * Start continuous simulation for all patients
   */
  startRoutineSimulation(intervalMs: number = 5000): void {
    if (this.publishInterval) return;

    console.log(`[MQTT Simulator] Starting routine simulation (${intervalMs}ms interval)`);
    
    this.publishInterval = setInterval(() => {
      for (const patient of SIM_PATIENTS) {
        this.publishWheelchairTelemetry(patient, false);
        this.publishPolarH10(patient);
        this.publishNodePosition(patient);
      }
    }, intervalMs);
  }

  stopRoutineSimulation(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
      console.log('[MQTT Simulator] Stopped routine simulation');
    }
  }
}

// Export singleton instance
export const mqttSimulator = new MqttSimulator();
