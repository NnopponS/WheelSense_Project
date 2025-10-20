import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { config } from "./config";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { KpiTracker } from "./kpi";
import { createApiRouter } from "./routes";
import { createMqttIngest } from "./mqtt";
import { createRedisPublisher } from "./redis";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const kpi = new KpiTracker();
const redis = createRedisPublisher();

io.of("/rt").on("connection", (socket) => {
  socket.emit("kpi", kpi.snapshot());
});

app.use("/api", createApiRouter({ prisma, kpi }));

const start = async () => {
  const wheels = await prisma.wheel.findMany({ select: { id: true } });
  wheels.forEach((wheel) => kpi.registerWheel(wheel.id));

  createMqttIngest({
    prisma,
    io,
    config,
    kpi,
    forwarder: redis
  });

  server.listen(config.port, () => {
    logger.info({ port: config.port }, "API listening");
  });
};

start().catch((err) => {
  logger.error(err, "API startup failed");
  process.exit(1);
});

const shutdown = async () => {
  logger.info("Shutting down API service");
  await redis.disconnect();
  await prisma.$disconnect();
  server.close();
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});
