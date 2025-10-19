export interface TelemetryForwarder {
  publishTelemetry(payload: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

export const createRedisPublisher = (): TelemetryForwarder => {
  return {
    async publishTelemetry() {
      // No-op stub to keep interface compatible across environments.
    },
    async disconnect() {
      // No-op
    }
  };
};
