export interface TelemetryForwarder {
  publishTelemetry(payload: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

export const createRedisPublisher = (): TelemetryForwarder => ({
  async publishTelemetry() {
    // no-op placeholder; plug in Redis/I/O as needed
  },
  async disconnect() {
    // no-op
  }
});
