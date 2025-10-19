import dotenv from "dotenv";

dotenv.config();

const number = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
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
  port: number(process.env.API_PORT, 4000),
  mqttUrl: process.env.MQTT_URL ?? "mqtt://broker.emqx.io:1883",
  mqttTopic: process.env.MQTT_TOPIC ?? "wheelsense/#",
  onlineWindowSec: number(process.env.ONLINE_WINDOW_SEC, 30),
  recoveryWindowSec: number(process.env.ROUTE_RECOVERY_WINDOW_SEC, 120)
};
