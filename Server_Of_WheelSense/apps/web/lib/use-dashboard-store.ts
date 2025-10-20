import { create } from "zustand";
import { Room, RouteSnapshot, WheelSummary } from "./types";
import { isSameRoute } from "@wheelsense/shared";

interface DashboardState {
  rooms: Room[];
  wheels: WheelSummary[];
  routes: RouteSnapshot[];
  kpi: Record<string, unknown> | null;
  setRooms: (rooms: Room[]) => void;
  upsertWheels: (wheels: WheelSummary[]) => void;
  setRoutes: (routes: RouteSnapshot[]) => void;
  upsertRoute: (route: RouteSnapshot) => void;
  updateKpi: (snapshot: Record<string, unknown>) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  rooms: [],
  wheels: [],
  routes: [],
  kpi: null,
  setRooms: (rooms) => set({ rooms }),
  upsertWheels: (next) =>
    set((state) => {
      const map = new Map(state.wheels.map((wheel) => [wheel.id, wheel]));
      next.forEach((wheel) => map.set(wheel.id, { ...map.get(wheel.id), ...wheel }));
      return { wheels: Array.from(map.values()).sort((a, b) => a.id - b.id) };
    }),
  setRoutes: (routes) => set({ routes }),
  upsertRoute: (route) =>
    set((state) => {
      const existing = state.routes.find((item) => item.wheelId === route.wheelId);
      if (isSameRoute(existing, route)) return {};
      const filtered = state.routes.filter((item) => item.wheelId !== route.wheelId);
      return { routes: [...filtered, route] };
    }),
  updateKpi: (snapshot) => set({ kpi: { ...(get().kpi ?? {}), ...snapshot } })
}));
