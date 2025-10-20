import { Router, type Request, type Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { KpiTracker } from "../kpi";

interface ApiDeps {
  prisma: PrismaClient;
  kpi: KpiTracker;
}

const roomSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  rect_x: z.number(),
  rect_y: z.number(),
  rect_w: z.number().positive(),
  rect_h: z.number().positive()
});

const wheelSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  assigned_room_id: z.number().int().nullable().optional()
});

export const createApiRouter = ({ prisma, kpi }: ApiDeps) => {
  const router = Router();

  router.get("/kpi", (_req: Request, res: Response) => {
    res.json(kpi.snapshot());
  });

  router.get("/rooms", async (_req: Request, res: Response) => {
    const rooms = await prisma.room.findMany({ orderBy: { id: "asc" } });
    res.json(rooms);
  });

  router.post("/rooms", async (req: Request, res: Response) => {
    const body = z.array(roomSchema).parse(req.body);
    const tasks = body.map((room) =>
      prisma.room.upsert({
        where: { id: room.id },
        update: {
          name: room.name,
          rect_x: room.rect_x,
          rect_y: room.rect_y,
          rect_w: room.rect_w,
          rect_h: room.rect_h
        },
        create: {
          id: room.id,
          name: room.name,
          rect_x: room.rect_x,
          rect_y: room.rect_y,
          rect_w: room.rect_w,
          rect_h: room.rect_h
        }
      })
    );
    const results = await Promise.all(tasks);
    res.json(results);
  });

  router.get("/wheels", async (_req: Request, res: Response) => {
    const wheels = await prisma.wheel.findMany({
      include: {
        assigned_room: true,
        presence: true
      },
      orderBy: { id: "asc" }
    });

    const rows = wheels.map((wheel) => ({
      id: wheel.id,
      name: wheel.name,
      assignedRoomId: wheel.assigned_room?.id ?? null,
      assignedRoomName: wheel.assigned_room?.name ?? null,
      online: wheel.presence?.online ?? false,
      lastSeen: wheel.presence?.last_seen ?? null,
      avgRssi: wheel.presence?.avg_rssi ?? null,
      roomId: wheel.presence?.room_id ?? null
    }));

    res.json(rows);
  });

  router.post("/wheels", async (req: Request, res: Response) => {
    const body = z.array(wheelSchema).parse(req.body);
    const tasks = body.map((wheel) =>
      prisma.wheel.upsert({
        where: { id: wheel.id },
        update: {
          name: wheel.name,
          assigned_room_id: wheel.assigned_room_id ?? null
        },
        create: {
          id: wheel.id,
          name: wheel.name,
          assigned_room_id: wheel.assigned_room_id ?? null
        }
      })
    );
    const results = await Promise.all(tasks);
    res.json(results);
  });

  router.get("/routes/live", async (_req: Request, res: Response) => {
    const latest = await prisma.meshRouteSnapshot.groupBy({
      by: ["wheel_id"],
      _max: { observed_at: true }
    });
    const key = new Map<number, Date>();
    latest.forEach((row) => {
      if (row._max.observed_at) {
        key.set(row.wheel_id, row._max.observed_at);
      }
    });

    const filters = Array.from(key.entries()).map(([wheelId, observed]) => ({
      wheel_id: wheelId,
      observed_at: observed
    }));

    const snapshots =
      filters.length === 0
        ? []
        : await prisma.meshRouteSnapshot.findMany({
            where: { OR: filters },
            include: {
              wheel: true,
              room: true
            },
            orderBy: { observed_at: "desc" }
          });

    const rows = snapshots.map((item) => ({
      wheelId: item.wheel_id,
      wheelName: item.wheel.name,
      roomId: item.room_id,
      roomName: item.room.name,
      path: item.path,
      hopCount: item.hop_count,
      recovered: item.recovered,
      recoveryMs: item.recovery_ms,
      latencyMs: item.latency_ms,
      observedAt: item.observed_at
    }));

    res.json(rows);
  });

  router.get("/routes/history", async (req: Request, res: Response) => {
    const params = z
      .object({
        wheel_id: z.string().optional(),
        limit: z.string().optional()
      })
      .parse(req.query);

    const where: Prisma.MeshRouteSnapshotWhereInput = {};
    if (params.wheel_id) {
      where.wheel_id = Number(params.wheel_id);
    }

    const limit = params.limit ? Math.min(Number(params.limit), 500) : 100;

    const rows = await prisma.meshRouteSnapshot.findMany({
      where,
      include: {
        wheel: true,
        room: true
      },
      orderBy: { observed_at: "desc" },
      take: limit
    });

    res.json(
      rows.map((item) => ({
        wheelId: item.wheel_id,
        wheelName: item.wheel.name,
        roomId: item.room_id,
        roomName: item.room.name,
        path: item.path,
        recovered: item.recovered,
        recoveryMs: item.recovery_ms,
        latencyMs: item.latency_ms,
        observedAt: item.observed_at
      }))
    );
  });

  return router;
};
