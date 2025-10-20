import dotenv from "dotenv";

dotenv.config();

const numberFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface AppConfig {
  port: number;
  mqttUrl: string;
  mqttTopic: string;
  onlineWindowSec: number;
  recoveryWindowSec: number;
}

export const config: AppConfig = {
  port: numberFromEnv("API_PORT", 4000),
  mqttUrl: process.env.MQTT_URL ?? "mqtt://broker.emqx.io:1883",
  mqttTopic: process.env.MQTT_TOPIC ?? "wheelsense/#",
  onlineWindowSec: numberFromEnv("ONLINE_WINDOW_SEC", 30),
  recoveryWindowSec: numberFromEnv("ROUTE_RECOVERY_WINDOW_SEC", 120)
};
