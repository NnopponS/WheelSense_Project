interface WheelPresence {
  online: boolean;
  lastSeen: number;
}

export interface RouteRecoveryMetric {
  wheelId: number;
  recoveryMs: number;
  observedAt: number;
}

export class KpiTracker {
  private packets = 0;
  private mqttStatus: "connected" | "disconnected" | "reconnecting" = "disconnected";
  private wheels = new Map<number, WheelPresence>();
  private recoveries: RouteRecoveryMetric[] = [];

  registerWheel(id: number): void {
    if (!this.wheels.has(id)) {
      this.wheels.set(id, { online: false, lastSeen: 0 });
    }
  }

  setMqttStatus(status: "connected" | "disconnected" | "reconnecting"): void {
    this.mqttStatus = status;
  }

  trackPacket(): void {
    this.packets += 1;
  }

  trackPresence(wheelId: number, online: boolean): void {
    const now = Date.now();
    const entry = this.wheels.get(wheelId) ?? { online: false, lastSeen: 0 };
    this.wheels.set(wheelId, { online, lastSeen: now });
  }

  trackRecovery(metric: RouteRecoveryMetric): void {
    this.recoveries.push(metric);
    const windowMs = 5 * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    this.recoveries = this.recoveries.filter((item) => item.observedAt >= cutoff);
  }

  snapshot() {
    const online = Array.from(this.wheels.values()).filter((item) => item.online).length;
    const total = this.wheels.size;
    const avgRecovery =
      this.recoveries.length > 0
        ? Math.round(
            this.recoveries.reduce((acc, item) => acc + item.recoveryMs, 0) /
              this.recoveries.length
          )
        : 0;

    return {
      packets: this.packets,
      wheelsOnline: online,
      wheelsTotal: total,
      mqttStatus: this.mqttStatus,
      avgRecoveryMs: avgRecovery
    };
  }
}
