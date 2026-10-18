"use client";

import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Plus, RotateCcw, Scan } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { percentToCanvasUnits, type FloorplanRoomShape } from "@/lib/floorplanLayout";

import type { FloorplanBackground } from "@/lib/floorplanEditor";

export type { FloorplanRoomShape };
export type FloorplanRoomTone = "critical" | "warning" | "success" | "info";

export type FloorplanRoomChip = {
  label: string;
  tone?: FloorplanRoomTone;
};

export type FloorplanRoomMeta = {
  chips?: FloorplanRoomChip[];
  detailLines?: string[];
  tone?: FloorplanRoomTone;
  presenceDots?: string[];
  /** Same length as presenceDots when set: profile links for map initials */
  presenceHrefs?: (string | null)[];
  /** Same length as presenceDots: hosted profile image URL or null (initials fallback) */
  presenceAvatarUrls?: (string | null)[];
};

const CANVAS_BASE_VIEW = 1000;
const CANVAS_BOUNDS = percentToCanvasUnits(100);
const GRID_SIZE = percentToCanvasUnits(1);
const MIN_ROOM_SIZE = percentToCanvasUnits(2);
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

function clampZoom(z: number, minimum = ZOOM_MIN): number {
  return Math.min(ZOOM_MAX, Math.max(minimum, z));
}

function clampRoom(r: FloorplanRoomShape): FloorplanRoomShape {
  let { x, y, w, h } = r;
  w = Math.max(MIN_ROOM_SIZE, Math.min(CANVAS_BOUNDS, w));
  h = Math.max(MIN_ROOM_SIZE, Math.min(CANVAS_BOUNDS, h));
  x = Math.max(0, Math.min(CANVAS_BOUNDS - w, x));
  y = Math.max(0, Math.min(CANVAS_BOUNDS - h, y));
  return { ...r, x, y, w, h };
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapRoom(room: FloorplanRoomShape): FloorplanRoomShape {
  return clampRoom({
    ...room,
    x: snapToGrid(room.x),
    y: snapToGrid(room.y),
    w: snapToGrid(room.w),
    h: snapToGrid(room.h),
  });
}

function initialsFromPresenceLabel(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function PresenceFace({ label, avatarUrl }: { label: string; avatarUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const trimmed = avatarUrl?.trim() ?? "";
  const showImg = trimmed.length > 0 && !broken;
  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same-origin /api/public profile paths
      <img
        src={trimmed}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 rounded-full object-cover border border-white/80"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className="leading-none">{initialsFromPresenceLabel(label)}</span>;
}

/** One-time camera: frame all rooms with padding (matches admin floorplan editor UX vs full 5000 canvas). */
function computeFitViewToRooms(rooms: FloorplanRoomShape[], viewportAspect?: number): { zoom: number; pan: { x: number; y: number } } {
  if (rooms.length === 0) return { zoom: 1, pan: { x: 0, y: 0 } };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = percentToCanvasUnits(2);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(CANVAS_BOUNDS, maxX + pad);
  maxY = Math.min(CANVAS_BOUNDS, maxY + pad);
  const bw = Math.max(maxX - minX, MIN_ROOM_SIZE);
  const bh = Math.max(maxY - minY, MIN_ROOM_SIZE);
  const aspect = viewportAspect ?? 1;
  const side = Math.max(bw, bh * aspect);
  let zoom = CANVAS_BASE_VIEW / side;
  zoom = clampZoom(zoom, ZOOM_MIN / Math.max(1, aspect));
  const viewBoxSize = CANVAS_BASE_VIEW / zoom;
  const maxPan = Math.max(0, CANVAS_BOUNDS - viewBoxSize);
  const viewBoxHeight = viewBoxSize / aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const panX = viewportAspect ? cx - viewBoxSize / 2 : Math.max(0, Math.min(maxPan, cx - viewBoxSize / 2));
  const panY = viewportAspect ? cy - viewBoxHeight / 2 : Math.max(0, Math.min(maxPan, cy - viewBoxSize / 2));
  return { zoom, pan: { x: panX, y: panY } };
}

function applyResize(
  corner: "nw" | "ne" | "sw" | "se",
  room: FloorplanRoomShape,
  x: number,
  y: number,
): FloorplanRoomShape {
  const right = room.x + room.w;
  const bottom = room.y + room.h;
  let nextX = room.x;
  let nextY = room.y;
  let w = room.w;
  let h = room.h;
  switch (corner) {
    case "se":
      w = x - nextX;
      h = y - nextY;
      break;
    case "ne":
      w = x - nextX;
      h = bottom - y;
      nextY = y;
      break;
    case "sw":
      w = right - x;
      h = y - nextY;
      nextX = x;
      break;
    case "nw":
      w = right - x;
      h = bottom - y;
      nextX = x;
      nextY = y;
      break;
  }
  return clampRoom({ ...room, x: nextX, y: nextY, w, h });
}

type DragState =
  | {
      kind: "move";
      id: string;
      pointerId: number;
      point0: { x: number; y: number };
      room0: FloorplanRoomShape;
    }
  | {
      kind: "resize";
      corner: "nw" | "ne" | "sw" | "se";
      id: string;
      pointerId: number;
      orig: FloorplanRoomShape;
    }
  | {
      kind: "pan";
      pointerId: number;
      ptr0: { x: number; y: number };
      pan0: { x: number; y: number };
    }
  | null;

export default function FloorplanCanvas({
  rooms,
  onRoomsChange,
  selectedId,
  onSelect,
  readOnly = false,
  enableZoom,
  compact = false,
  roomMetaById = {},
  fitContentOnMount = false,
  fillViewport = false,
  background = null,
  showGrid = true,
  snapToGrid: shouldSnap = true,
  workspaceTools = false,
  visibleRoomIds,
  fitKey = "",
}: {
  rooms: FloorplanRoomShape[];
  onRoomsChange: (next: FloorplanRoomShape[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true: no drag/resize; rooms are clickable only to highlight (via onSelect). */
  readOnly?: boolean;
  /** Show zoom controls and allow Ctrl/Cmd + wheel zoom */
  enableZoom?: boolean;
  /** Reduce height and hide zoom controls for dashboard surfaces. */
  compact?: boolean;
  roomMetaById?: Record<string, FloorplanRoomMeta | null | undefined>;
  /** After first non-empty layout, set zoom/pan to frame all rooms (does not refit on every edit). */
  fitContentOnMount?: boolean;
  /** Preserve screen-sized room labels and resize handles in a bounded workspace. */
  fillViewport?: boolean;
  background?: FloorplanBackground | null;
  showGrid?: boolean;
  snapToGrid?: boolean;
  workspaceTools?: boolean;
  visibleRoomIds?: string[];
  fitKey?: string;
}) {
  const { t } = useTranslation();
  const canvasId=useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [draftRooms, setDraftRooms] = useState(rooms);
  const draftRoomsRef = useRef(rooms);
  const dragRef = useRef<DragState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(1);
  const [viewportAspect, setViewportAspect] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const didFitContentOnMount = useRef(false);
  const fittedAspect = useRef<number | null>(null);
  const fittedKey = useRef<string | null>(null);
  const fitRooms = useMemo(() => {
    const visible = visibleRoomIds ? rooms.filter(room => visibleRoomIds.includes(room.id)) : rooms;
    return background ? [...visible, {id:"background",label:"",x:background.x,y:background.y,w:background.width,h:background.height,device_id:null,power_kw:null}] : visible;
  },[rooms,visibleRoomIds,background]);
  const fitIdentity = `${fitKey}:${background?.url ?? ""}`;
  const fitView = () => {
    const next=computeFitViewToRooms(fitRooms,fillViewport ? viewportAspect ?? 1 : undefined);
    setZoom(next.zoom);setPan(next.pan);
  };
  const zoomEnabled = enableZoom ?? true;
  const minimumZoom = fillViewport ? ZOOM_MIN / Math.max(1, viewportAspect ?? 1) : ZOOM_MIN;
  const viewBoxSize = useMemo(() => CANVAS_BASE_VIEW / zoom, [zoom]);
  const viewBoxHeight = viewBoxSize / (fillViewport ? viewportAspect ?? 1 : 1);
  const panBounds = useMemo(() => fillViewport ? {
    minX: -viewBoxSize / 2,
    minY: -viewBoxHeight / 2,
    maxX: CANVAS_BOUNDS - viewBoxSize / 2,
    maxY: CANVAS_BOUNDS - viewBoxHeight / 2,
  } : {
    minX: 0, minY: 0,
    maxX: Math.max(0, CANVAS_BOUNDS - viewBoxSize),
    maxY: Math.max(0, CANVAS_BOUNDS - viewBoxSize),
  }, [fillViewport, viewBoxSize, viewBoxHeight]);
  const effectivePan = useMemo(
    () => ({
      x: Math.max(panBounds.minX, Math.min(panBounds.maxX, pan.x)),
      y: Math.max(panBounds.minY, Math.min(panBounds.maxY, pan.y)),
    }),
    [panBounds, pan.x, pan.y],
  );

  useLayoutEffect(() => {
    if (!fillViewport) return;
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setViewportAspect(rect.width / rect.height);
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const scale = Math.hypot(matrix.a, matrix.b);
      if (scale > 0) setPixelsPerUnit(scale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [fillViewport, zoom, viewportAspect]);

  useEffect(() => {
    draftRoomsRef.current = draftRooms;
  }, [draftRooms]);

  useLayoutEffect(() => {
    if (!fitContentOnMount) return;
    if (didFitContentOnMount.current && fittedKey.current === fitIdentity && (!fillViewport || fittedAspect.current === viewportAspect)) return;
    if (rooms.length === 0 || (fillViewport && viewportAspect == null)) return;
    const next = computeFitViewToRooms(fitRooms, fillViewport ? viewportAspect ?? undefined : undefined);
    const frame = window.requestAnimationFrame(() => {
      didFitContentOnMount.current = true;
      fittedAspect.current = viewportAspect;
      fittedKey.current = fitIdentity;
      setZoom(next.zoom);
      setPan(next.pan);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitContentOnMount, rooms, fitRooms, fillViewport, viewportAspect, fitIdentity]);

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return {
      x: transformed.x,
      y: transformed.y,
    };
  }, []);

  function startMove(room: FloorplanRoomShape, event: React.PointerEvent) {
    if (readOnly) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(room.id);
    setDraftRooms(rooms);
    draftRoomsRef.current = rooms;
    setIsDragging(true);
    (event.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
      event.pointerId,
    );
    dragRef.current = {
      kind: "move",
      id: room.id,
      pointerId: event.pointerId,
      point0: toSvgPoint(event.clientX, event.clientY),
      room0: { ...room },
    };
  }

  function startResize(
    corner: "nw" | "ne" | "sw" | "se",
    room: FloorplanRoomShape,
    event: React.PointerEvent,
  ) {
    if (readOnly) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(room.id);
    setDraftRooms(rooms);
    draftRoomsRef.current = rooms;
    setIsDragging(true);
    (event.currentTarget as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
      event.pointerId,
    );
    dragRef.current = {
      kind: "resize",
      corner,
      id: room.id,
      pointerId: event.pointerId,
      orig: { ...room },
    };
  }

  const commitSelection = useCallback(
    (id: string) => {
      const committed = draftRoomsRef.current.map((room) =>
        room.id === id ? (shouldSnap ? snapRoom(room) : clampRoom(room)) : room,
      );
      setDraftRooms(committed);
      onRoomsChange(committed);
    },
    [onRoomsChange, shouldSnap],
  );

  function onSvgPointerDown(event: React.PointerEvent<SVGElement>, clearSelection = true) {
    if(clearSelection) onSelect(null);
    if (!zoomEnabled) return;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      ptr0: toSvgPoint(event.clientX, event.clientY),
      pan0: { ...effectivePan },
    };
  }

  function onSvgPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toSvgPoint(event.clientX, event.clientY);

    if (drag.kind === "move") {
      const dx = point.x - drag.point0.x;
      const dy = point.y - drag.point0.y;
      const moved = (shouldSnap ? snapRoom : clampRoom)({
        ...drag.room0,
        x: drag.room0.x + dx,
        y: drag.room0.y + dy,
      });
      setDraftRooms((prev) =>
        prev.map((room) => (room.id === drag.id ? moved : room)),
      );
      return;
    }

    if (drag.kind === "resize") {
      const resized = (shouldSnap ? snapRoom : clampRoom)(applyResize(drag.corner, drag.orig, point.x, point.y));
      setDraftRooms((prev) =>
        prev.map((room) => (room.id === drag.id ? resized : room)),
      );
      return;
    }

    const dx = drag.ptr0.x - point.x;
    const dy = drag.ptr0.y - point.y;
    setPan({
      x: Math.max(panBounds.minX, Math.min(panBounds.maxX, drag.pan0.x + dx)),
      y: Math.max(panBounds.minY, Math.min(panBounds.maxY, drag.pan0.y + dy)),
    });
  }

  function onSvgPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    svgRef.current?.releasePointerCapture?.(drag.pointerId);
    if (drag.kind === "move" || drag.kind === "resize") {
      commitSelection(drag.id);
    }
    setIsDragging(false);
    dragRef.current = null;
  }

  function roomToneClasses(tone?: FloorplanRoomTone) {
    if (tone === "critical") {
      return {
        fill: "rgba(248, 113, 113, 0.18)",
        border: "rgb(220, 38, 38)",
        chip: "bg-red-500/20 text-red-800",
      };
    }
    if (tone === "warning") {
      return {
        fill: "rgba(251, 191, 36, 0.18)",
        border: "rgb(217, 119, 6)",
        chip: "bg-amber-500/20 text-amber-800",
      };
    }
    if (tone === "success") {
      return {
        fill: "rgba(74, 222, 128, 0.16)",
        border: "rgb(22, 163, 74)",
        chip: "bg-emerald-500/20 text-emerald-800",
      };
    }
    return {
      fill: "rgba(56, 189, 248, 0.12)",
      border: "rgb(14, 116, 144)",
      chip: "bg-sky-500/20 text-sky-800",
    };
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheelZoom = (event: WheelEvent) => {
      if (!zoomEnabled) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom((z) => clampZoom(z - event.deltaY * 0.002, minimumZoom));
    };

    viewport.addEventListener("wheel", onWheelZoom, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheelZoom);
    };
  }, [zoomEnabled, minimumZoom]);

  return (
    <div className={`space-y-2 ${compact ? "text-sm" : ""}`}>
      {zoomEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <button
            type="button"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high"
            aria-label={t("floorplan.zoomOut")}
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP, minimumZoom))}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="tabular-nums font-medium min-w-[3.25rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high"
            aria-label={t("floorplan.zoomIn")}
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP, minimumZoom))}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high text-xs"
            aria-label={t("floorplan.zoomReset")}
            onClick={() => {
              const next = fillViewport && !workspaceTools ? computeFitViewToRooms(fitRooms, viewportAspect ?? 1) : { zoom: 1, pan: { x: 0, y: 0 } };
              setZoom(next.zoom);
              setPan(next.pan);
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("floorplan.zoomReset")}
          </button>
          {workspaceTools ? <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2 text-xs hover:bg-muted" onClick={fitView} aria-label={t("facilityWorkspace.fit")}><Scan className="size-3.5" aria-hidden />{t("facilityWorkspace.fit")}</button> : null}
          <span className="text-xs text-foreground-variant">{t("floorplan.zoomWheelHint")}</span>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-low/40 ${
          fillViewport
            ? "h-[min(65dvh,40rem)] min-h-0 max-h-none"
            : compact
            ? "max-h-[min(44vh,420px)] min-h-[280px]"
            : "max-h-[min(85vh,960px)] min-h-[min(78vh,720px)]"
        }`}
      >
        <svg
          ref={svgRef}
          tabIndex={workspaceTools ? 0 : undefined}
          role={workspaceTools ? "group" : undefined}
          aria-label={workspaceTools ? t("floorplan.canvas") : undefined}
          onKeyDown={event => {
            if (!workspaceTools || event.target !== event.currentTarget || !event.key.startsWith("Arrow")) return;
            event.preventDefault();
            const step=viewBoxSize/10;
            setPan(value=>({x:value.x+(event.key==="ArrowLeft" ? -step : event.key==="ArrowRight" ? step : 0),y:value.y+(event.key==="ArrowUp" ? -step : event.key==="ArrowDown" ? step : 0)}));
          }}
          viewBox={`${effectivePan.x} ${effectivePan.y} ${viewBoxSize} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className={`w-full rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/80 select-none ${
            fillViewport ? "h-full min-h-0" : compact ? "min-h-[280px]" : "min-h-[560px]"
          } ${readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerCancel={onSvgPointerUp}
        >
          <defs>
            <pattern id="ws-grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="rgba(148, 163, 184, 0.22)" strokeWidth={1} />
            </pattern>
          </defs>

          {showGrid ? <rect x={0} y={0} width={CANVAS_BOUNDS} height={CANVAS_BOUNDS} fill="url(#ws-grid)" /> : null}
          {background ? <image href={background.url} x={background.x} y={background.y} width={background.width} height={background.height} opacity={background.opacity} preserveAspectRatio="none" pointerEvents="none" aria-hidden="true" /> : null}

          {(isDragging ? draftRooms : rooms).map((room) => {
            const selected = selectedId === room.id;
            const meta = roomMetaById[room.id] ?? null;
            const tone = roomToneClasses(meta?.tone);
            const smallRoom=workspaceTools && fillViewport && (room.w*pixelsPerUnit<120 || room.h*pixelsPerUnit<80);
            const chips = smallRoom ? [] : meta?.chips?.slice(0, compact ? 2 : 3) ?? [];
            const detail = smallRoom ? null : meta?.detailLines?.[0] ?? null;
            const presenceDots = smallRoom ? [] : meta?.presenceDots?.slice(0, compact ? 2 : 3) ?? [];
            const presenceHrefs = meta?.presenceHrefs?.slice(0, compact ? 2 : 3) ?? [];
            const presenceAvatarUrls = meta?.presenceAvatarUrls?.slice(0, compact ? 2 : 3) ?? [];

            return (
              <g
                key={room.id}
                data-room-id={room.id}
                display={visibleRoomIds && !visibleRoomIds.includes(room.id) ? "none" : undefined}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <desc id={`${canvasId}-${room.id}-status`}>{[...(meta?.chips??[]).map(chip=>chip.label),...(meta?.detailLines??[])].join(" · ")}</desc>
                <rect
                  role="button"
                  tabIndex={0}
                  aria-label={room.label}
                  aria-describedby={`${canvasId}-${room.id}-status`}
                  aria-pressed={selected}
                  onKeyDown={event => {
                    if(event.key==="Enter" || event.key===" "){event.preventDefault();onSelect(room.id);return;}
                    if(readOnly || !event.key.startsWith("Arrow")) return;
                    event.preventDefault();event.stopPropagation();onSelect(room.id);
                    const step=(shouldSnap ? GRID_SIZE : 10)*(event.shiftKey ? 5 : 1);
                    const dx=event.key==="ArrowLeft" ? -step : event.key==="ArrowRight" ? step : 0;
                    const dy=event.key==="ArrowUp" ? -step : event.key==="ArrowDown" ? step : 0;
                    const next=event.altKey ? {...room,w:room.w+dx,h:room.h+dy} : {...room,x:room.x+dx,y:room.y+dy};
                    onRoomsChange(rooms.map(value=>value.id===room.id ? (shouldSnap ? snapRoom : clampRoom)(next) : value));
                  }}
                  style={{outlineOffset:4}}
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  rx={18}
                  fill={readOnly ? tone.fill : "rgba(59, 130, 246, 0.12)"}
                  stroke={selected ? "rgb(37, 99, 235)" : readOnly ? tone.border : "rgba(37, 99, 235, 0.4)"}
                  strokeWidth={selected ? 5 : 3}
                  onPointerDown={(event) => {
                    if (readOnly) {
                      onSelect(room.id);
                      if(workspaceTools) onSvgPointerDown(event,false);
                    } else {
                      startMove(room, event);
                    }
                  }}
                />

                <foreignObject
                  x={room.x + 10}
                  y={room.y + 10}
                  width={Math.max(24, room.w - 20)}
                  height={Math.max(24, room.h - 20)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (readOnly) {
                      onSelect(room.id);
                      if(workspaceTools) onSvgPointerDown(event,false);
                    } else {
                      startMove(room, event);
                    }
                  }}
                >
                  <div className="flex h-full flex-col justify-between gap-1.5 overflow-hidden"
                    style={fillViewport ? {
                      width: Math.max(24, room.w - 20) * pixelsPerUnit,
                      height: Math.max(24, room.h - 20) * pixelsPerUnit,
                      transform: `scale(${1 / pixelsPerUnit})`,
                      transformOrigin: "top left",
                    } : undefined}>
                    <div className="min-w-0">
                      <p className={`${fillViewport && !smallRoom ? "break-words leading-tight" : "truncate"} text-xs font-semibold text-slate-900`} title={room.label}>{smallRoom ? room.label.replace(/^Room\s+(?=\d)/i, "") : room.label}{smallRoom && readOnly && (meta?.tone==="critical" || meta?.tone==="warning") ? <span aria-hidden="true" className="ml-1">{meta.tone==="critical" ? "!" : "△"}</span> : null}</p>
                      {detail ? <p className="mt-0.5 truncate text-[10px] text-slate-600">{detail}</p> : null}
                    </div>
                    <div className="space-y-1">
                      {presenceDots.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {presenceDots.map((label, idx) => {
                            const href = presenceHrefs[idx] ?? null;
                            const avatarUrl = (presenceAvatarUrls[idx] ?? null)?.trim() || null;
                            const inner = <PresenceFace label={label} avatarUrl={avatarUrl} />;
                            const className =
                              "inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-slate-900/80 text-[8px] font-bold text-white hover:bg-slate-800";
                            return href ? (
                              <Link
                                key={`${room.id}-presence-${idx}-${label}`}
                                href={href}
                                className={className}
                                title={label}
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {inner}
                              </Link>
                            ) : (
                              <span
                                key={`${room.id}-presence-${idx}-${label}`}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-slate-900/80 text-[8px] font-bold text-white overflow-hidden"
                                title={label}
                              >
                                {inner}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                      {chips.map((chip) => (
                        <span
                          key={`${room.id}-${chip.label}`}
                          className={`inline-flex max-w-full items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${tone.chip}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                      {chips.length === 0 && !fillViewport ? (
                        <span className="inline-flex rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-700">
                          layout
                        </span>
                      ) : null}
                      </div>
                    </div>
                  </div>
                </foreignObject>

                {selected && !readOnly ? (
                  <>
                    {([
                      { corner: "nw", x: room.x, y: room.y, cursor: "nwse-resize" },
                      { corner: "ne", x: room.x + room.w, y: room.y, cursor: "nesw-resize" },
                      { corner: "sw", x: room.x, y: room.y + room.h, cursor: "nesw-resize" },
                      { corner: "se", x: room.x + room.w, y: room.y + room.h, cursor: "nwse-resize" },
                    ] as const).map((handle) => (
                      <circle
                        key={`${room.id}-${handle.corner}`}
                        cx={handle.x}
                        cy={handle.y}
                        r={fillViewport ? 6 / pixelsPerUnit : 10}
                        fill="rgb(37, 99, 235)"
                        stroke="white"
                        strokeWidth={fillViewport ? 2 / pixelsPerUnit : 3}
                        style={{ cursor: handle.cursor }}
                        onPointerDown={(event) => startResize(handle.corner, room, event)}
                      />
                    ))}
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
