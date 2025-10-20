import mqtt from "mqtt";
import { z } from "zod";
import { Prisma, PrismaClient, WheelStatus } from "@prisma/client";
import { Server as SocketServer } from "socket.io";
import {
  directionText,
  motionText,
  statusText,
  distanceToUint16,
  RouteSnapshot,
  isSameRoute
} from "@wheelsense/shared";
import { logger } from "./logger";
import { AppConfig } from "./config";
import { KpiTracker } from "./kpi";
import { TelemetryForwarder } from "./redis";
import { TelemetryPayload } from "./types";

const payloadSchema = z.object({
  room: z.number().int(),
  room_name: z.string().optional(),
  wheel: z.number().int(),
  wheel_name: z.string().optional(),
  distance: z.number(),
  status: z.number().int(),
  motion: z.number().int(),
  direction: z.number().int(),
  rssi: z.number(),
  stale: z.boolean().optional(),
  ts: z.string(),
  gateway_ts: z.string().optional(),
  route_path: z.array(z.string()).optional(),
  route_latency_ms: z.number().optional(),
  route_recovery_ms: z.number().optional(),
  route_recovered: z.boolean().optional()
});

const toWheelStatus = (value: string | null | undefined): WheelStatus => {
  if (!value) return "UNKNOWN";
  const candidate = value.toUpperCase() as WheelStatus;
  return (Object.values(WheelStatus) as string[]).includes(candidate) ? candidate : "UNKNOWN";
};

interface MqttDeps {
  prisma: PrismaClient;
  io: SocketServer;
  config: AppConfig;
  kpi: KpiTracker;
  forwarder: TelemetryForwarder;
}

export const createMqttIngest = ({ prisma, io, config, kpi, forwarder }: MqttDeps) => {
  const client = mqtt.connect(config.mqttUrl, { reconnectPeriod: 2000 });
  const lastRoutes = new Map<number, RouteSnapshot>();

  client.on("connect", () => {
    logger.info({ url: config.mqttUrl }, "MQTT connected");
    kpi.setMqttStatus("connected");
    client.subscribe(config.mqttTopic, (err) => {
      if (err) logger.error(err, "Failed to subscribe");
    });
  });

  client.on("close", () => kpi.setMqttStatus("disconnected"));
  client.on("reconnect", () => kpi.setMqttStatus("reconnecting"));
  client.on("error", (err) => logger.error(err, "MQTT error"));

  client.on("message", async (_topic, buffer) => {
    kpi.trackPacket();
    const rawText = buffer.toString();
    try {
      const parsed = payloadSchema.parse(JSON.parse(rawText) as TelemetryPayload);
      const ts = new Date(parsed.ts);
      if (Number.isNaN(ts.getTime())) throw new Error("Invalid timestamp");
      const gatewayTs = parsed.gateway_ts ? new Date(parsed.gateway_ts) : null;

      const statusLabel = statusText(parsed.status);
      const motionLabel = motionText(parsed.motion);
      const directionLabel = directionText(parsed.direction);
      const wheelStatus = toWheelStatus(statusLabel);
      const distanceRounded = Math.round(parsed.distance * 100) / 100;
      const distanceRaw = distanceToUint16(parsed.distance);

      const result = await prisma.$transaction(async (tx) => {
        const room = await tx.room.upsert({
          where: { id: parsed.room },
          update: parsed.room_name ? { name: parsed.room_name } : {},
          create: {
            id: parsed.room,
            name: parsed.room_name ?? `Room ${parsed.room}`,
            rect_x: 0,
            rect_y: 0,
            rect_w: 100,
            rect_h: 100
          }
        });

        const wheel = await tx.wheel.upsert({
          where: { id: parsed.wheel },
          update: parsed.wheel_name ? { name: parsed.wheel_name } : {},
          create: {
            id: parsed.wheel,
            name: parsed.wheel_name ?? `Wheel ${parsed.wheel}`
          }
        });

        await tx.rawData.create({
          data: {
            ts,
            gateway_ts: gatewayTs,
            room_id: parsed.room,
            wheel_id: parsed.wheel,
            direction_code: parsed.direction,
            direction_text: directionLabel,
            status_code: parsed.status,
            status_text: wheelStatus,
            motion_code: parsed.motion,
            motion_text: motionLabel,
            distance_m: new Prisma.Decimal(distanceRounded),
            distance_raw_uint16: distanceRaw,
            rssi: parsed.rssi,
            stale: parsed.stale ?? false,
            rx_ok: !(parsed.stale ?? false),
            route_path: parsed.route_path ?? [],
            route_latency_ms: parsed.route_latency_ms ?? null,
            route_recovery_ms: parsed.route_recovery_ms ?? null,
            route_recovered: parsed.route_recovered ?? null
          }
        });

        await tx.presence.upsert({
          where: { wheel_id: parsed.wheel },
          update: {
            online: !(parsed.stale ?? false),
            last_seen: ts,
            avg_rssi: parsed.rssi,
            rx_total: { increment: 1 },
            rx_ok: { increment: parsed.stale ? 0 : 1 },
            rx_ratio: 0,
            status_text: wheelStatus,
            motion_text: motionLabel,
            direction_text: directionLabel,
            distance_m: new Prisma.Decimal(distanceRounded),
            room_id: parsed.room
          },
          create: {
            wheel_id: parsed.wheel,
            online: true,
            last_seen: ts,
            avg_rssi: parsed.rssi,
            rx_total: 1n,
            rx_ok: parsed.stale ? 0n : 1n,
            rx_ratio: 1,
            status_text: wheelStatus,
            motion_text: motionLabel,
            direction_text: directionLabel,
            distance_m: new Prisma.Decimal(distanceRounded),
            room_id: parsed.room
          }
        });

        let routeSnapshot: RouteSnapshot | undefined;
        if (parsed.route_path && parsed.route_path.length > 0) {
          const snapshot = await tx.meshRouteSnapshot.create({
            data: {
              wheel_id: parsed.wheel,
              room_id: parsed.room,
              path: parsed.route_path,
              hop_count: parsed.route_path.length,
              recovered: parsed.route_recovered ?? false,
              recovery_ms: parsed.route_recovery_ms ?? null,
              latency_ms: parsed.route_latency_ms ?? null,
              observed_at: ts
            },
            include: {
              wheel: true
            }
          });

          routeSnapshot = {
            wheelId: snapshot.wheel_id,
            wheelName: snapshot.wheel.name,
            roomId: snapshot.room_id,
            path: snapshot.path,
            recovered: snapshot.recovered,
            recoveryMs: snapshot.recovery_ms ?? undefined,
            latencyMs: snapshot.latency_ms ?? undefined,
            observedAt: snapshot.observed_at.toISOString()
          };
        }

        return { room, wheel, routeSnapshot };
      });

      kpi.registerWheel(parsed.wheel);
      kpi.trackPresence(parsed.wheel, !(parsed.stale ?? false));
      if (parsed.route_recovery_ms) {
        kpi.trackRecovery({
          wheelId: parsed.wheel,
          recoveryMs: parsed.route_recovery_ms,
          observedAt: Date.now()
        });
      }

      const telemetry = {
        wheel_id: parsed.wheel,
        wheel_name: result.wheel.name,
        room_id: parsed.room,
        room_name: result.room.name,
        status_code: parsed.status,
        status_text: statusLabel,
        motion_code: parsed.motion,
        motion_text: motionLabel,
        direction_code: parsed.direction,
        direction_text: directionLabel,
        distance_m: distanceRounded,
        distance_raw_uint16: distanceRaw,
        rssi: parsed.rssi,
        stale: parsed.stale ?? false,
        ts: ts.toISOString(),
        route_path: parsed.route_path ?? [],
        route_latency_ms: parsed.route_latency_ms ?? null,
        route_recovery_ms: parsed.route_recovery_ms ?? null,
        route_recovered: parsed.route_recovered ?? null
      };

      io.of("/rt").emit("telemetry", telemetry);
      if (result.routeSnapshot) {
        const previous = lastRoutes.get(result.routeSnapshot.wheelId);
        if (!isSameRoute(previous, result.routeSnapshot)) {
          io.of("/rt").emit("route", result.routeSnapshot);
          lastRoutes.set(result.routeSnapshot.wheelId, result.routeSnapshot);
        }
      }

      try {
        await forwarder.publishTelemetry(telemetry);
      } catch (err) {
        logger.warn({ err }, "Failed to forward telemetry");
      }
    } catch (err) {
      logger.warn({ err, rawText }, "Failed to process MQTT payload");
    }
  });

  return client;
};


