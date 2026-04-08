/**
 * URL contract for unified /admin/monitoring (Facility → Floor → List | Map).
 * Pure helpers — safe to import from any client/server code.
 */

export type MonitoringViewMode = "list" | "map";

export interface MonitoringWorkspaceQuery {
  facilityId: number | null;
  floorId: number | null;
  roomId: number | null;
  view: MonitoringViewMode;
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function parsePositiveInt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null;
  return n;
}

function parseView(v: string | undefined): MonitoringViewMode {
  if (v === "map") return "map";
  return "list";
}

/** Parse Next.js `searchParams` (or any flat record) into workspace query. */
export function parseMonitoringQuery(
  sp: Record<string, string | string[] | undefined>,
): MonitoringWorkspaceQuery {
  return {
    facilityId: parsePositiveInt(firstString(sp.facility)),
    floorId: parsePositiveInt(firstString(sp.floor)),
    roomId: parsePositiveInt(firstString(sp.room)),
    view: parseView(firstString(sp.view)),
  };
}

export interface LegacyTabRedirect {
  redirectTo: string;
}

/**
 * If legacy `tab=` is present, return a pathname+search to redirect to.
 * Otherwise return null.
 */
export function legacyMonitoringTabRedirect(
  pathname: string,
  sp: Record<string, string | string[] | undefined>,
): string | null {
  const tab = firstString(sp.tab);
  if (!tab) return null;

  const base = new URLSearchParams();
  const facility = firstString(sp.facility);
  const floor = firstString(sp.floor);
  const room = firstString(sp.room);
  const view = firstString(sp.view);

  if (facility) base.set("facility", facility);
  if (floor) base.set("floor", floor);
  if (room) base.set("room", room);

  if (tab === "floorplans") {
    base.set("view", "map");
  } else if (tab === "facilities") {
    if (view === "map") base.set("view", "map");
    else base.set("view", "list");
  } else if (tab === "rooms") {
    if (view) base.set("view", view);
    else base.set("view", "list");
  } else {
    if (view) base.set("view", view);
    else base.set("view", "list");
  }

  const q = base.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function buildMonitoringSearchParams(
  q: Partial<MonitoringWorkspaceQuery>,
  existing?: URLSearchParams,
): URLSearchParams {
  const out = existing ? new URLSearchParams(existing.toString()) : new URLSearchParams();
  out.delete("tab");

  if (q.facilityId !== undefined) {
    if (q.facilityId === null) {
      out.delete("facility");
      out.delete("floor");
      out.delete("room");
    } else {
      out.set("facility", String(q.facilityId));
    }
  }

  if (q.floorId !== undefined) {
    if (q.floorId === null) {
      out.delete("floor");
      out.delete("room");
    } else {
      out.set("floor", String(q.floorId));
    }
  }

  if (q.roomId !== undefined) {
    if (q.roomId === null) {
      out.delete("room");
    } else {
      out.set("room", String(q.roomId));
    }
  }

  if (q.view !== undefined) {
    if (q.view === "list") {
      out.delete("view");
    } else {
      out.set("view", q.view);
    }
  }

  return out;
}

export function monitoringHref(pathname: string, q: Partial<MonitoringWorkspaceQuery>): string {
  const params = buildMonitoringSearchParams(q);
  const s = params.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Alias matching plan naming (`buildMonitoringPath`). */
export const buildMonitoringPath = monitoringHref;

/** Parse `room-{id}` layout id to numeric room id, or null. */
export function floorplanRoomIdToNumeric(id: string): number | null {
  const m = /^room-(\d+)$/.exec(String(id).trim());
  if (!m) return null;
  return Number(m[1]);
}
