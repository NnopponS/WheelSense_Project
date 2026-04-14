"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { percentToCanvasUnits, type FloorplanRoomShape } from "@/lib/floorplanLayout";

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
};

const CANVAS_BASE_VIEW = 1000;
const CANVAS_BOUNDS = percentToCanvasUnits(100);
const GRID_SIZE = percentToCanvasUnits(1);
const MIN_ROOM_SIZE = percentToCanvasUnits(2);
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
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

/** One-time camera: frame all rooms with padding (matches admin floorplan editor UX vs full 5000 canvas). */
function computeFitViewToRooms(rooms: FloorplanRoomShape[]): { zoom: number; pan: { x: number; y: number } } {
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
  const side = Math.max(bw, bh);
  let zoom = CANVAS_BASE_VIEW / side;
  zoom = clampZoom(zoom);
  const viewBoxSize = CANVAS_BASE_VIEW / zoom;
  const maxPan = Math.max(0, CANVAS_BOUNDS - viewBoxSize);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const panX = Math.max(0, Math.min(maxPan, cx - viewBoxSize / 2));
  const panY = Math.max(0, Math.min(maxPan, cy - viewBoxSize / 2));
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
}) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [draftRooms, setDraftRooms] = useState(rooms);
  const draftRoomsRef = useRef(rooms);
  const dragRef = useRef<DragState>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const didFitContentOnMount = useRef(false);
  const zoomEnabled = enableZoom ?? true;
  const viewBoxSize = useMemo(() => CANVAS_BASE_VIEW / zoom, [zoom]);
  const maxPan = useMemo(() => Math.max(0, CANVAS_BOUNDS - viewBoxSize), [viewBoxSize]);
  const effectivePan = useMemo(
    () => ({
      x: Math.max(0, Math.min(maxPan, pan.x)),
      y: Math.max(0, Math.min(maxPan, pan.y)),
    }),
    [maxPan, pan.x, pan.y],
  );

  useEffect(() => {
    draftRoomsRef.current = draftRooms;
  }, [draftRooms]);

  useLayoutEffect(() => {
    if (!fitContentOnMount || didFitContentOnMount.current) return;
    if (rooms.length === 0) return;
    didFitContentOnMount.current = true;
    const next = computeFitViewToRooms(rooms);
    const frame = window.requestAnimationFrame(() => {
      setZoom(next.zoom);
      setPan(next.pan);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitContentOnMount, rooms]);

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
        room.id === id ? snapRoom(room) : room,
      );
      setDraftRooms(committed);
      onRoomsChange(committed);
    },
    [onRoomsChange],
  );

  function onSvgPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    onSelect(null);
    if (!zoomEnabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
      const moved = snapRoom({
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
      const resized = snapRoom(applyResize(drag.corner, drag.orig, point.x, point.y));
      setDraftRooms((prev) =>
        prev.map((room) => (room.id === drag.id ? resized : room)),
      );
      return;
    }

    const dx = drag.ptr0.x - point.x;
    const dy = drag.ptr0.y - point.y;
    setPan({
      x: Math.max(0, Math.min(maxPan, drag.pan0.x + dx)),
      y: Math.max(0, Math.min(maxPan, drag.pan0.y + dy)),
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
      setZoom((z) => clampZoom(z - event.deltaY * 0.002));
    };

    viewport.addEventListener("wheel", onWheelZoom, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheelZoom);
    };
  }, [zoomEnabled]);

  return (
    <div className={`space-y-2 ${compact ? "text-sm" : ""}`}>
      {zoomEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <button
            type="button"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high"
            aria-label={t("floorplan.zoomOut")}
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
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
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-outline-variant/40 bg-surface-container-low hover:bg-surface-container-high text-xs"
            aria-label={t("floorplan.zoomReset")}
            onClick={() => setZoom(1)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("floorplan.zoomReset")}
          </button>
          <span className="text-xs text-foreground-variant">{t("floorplan.zoomWheelHint")}</span>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-low/40 ${
          compact
            ? "max-h-[min(44vh,420px)] min-h-[280px]"
            : "max-h-[min(85vh,960px)] min-h-[min(78vh,720px)]"
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`${effectivePan.x} ${effectivePan.y} ${viewBoxSize} ${viewBoxSize}`}
          preserveAspectRatio="xMidYMid meet"
          className={`w-full rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/80 select-none ${
            compact ? "min-h-[280px]" : "min-h-[560px]"
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

          <rect x={0} y={0} width={CANVAS_BOUNDS} height={CANVAS_BOUNDS} fill="url(#ws-grid)" />

          {(isDragging ? draftRooms : rooms).map((room) => {
            const selected = selectedId === room.id;
            const meta = roomMetaById[room.id] ?? null;
            const tone = roomToneClasses(meta?.tone);
            const chips = meta?.chips?.slice(0, compact ? 2 : 3) ?? [];
            const detail = meta?.detailLines?.[0] ?? null;
            const presenceDots = meta?.presenceDots?.slice(0, compact ? 2 : 3) ?? [];

            return (
              <g
                key={room.id}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <rect
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
                    } else {
                      startMove(room, event);
                    }
                  }}
                >
                  <div className="flex h-full flex-col justify-between gap-1.5 overflow-hidden">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">{room.label}</p>
                      {detail ? <p className="mt-0.5 truncate text-[10px] text-slate-600">{detail}</p> : null}
                    </div>
                    <div className="space-y-1">
                      {presenceDots.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {presenceDots.map((label) => (
                            <span
                              key={`${room.id}-presence-${label}`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-slate-900/80 text-[8px] font-bold text-white"
                              title={label}
                            >
                              {initialsFromPresenceLabel(label)}
                            </span>
                          ))}
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
                      {chips.length === 0 ? (
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
                        r={10}
                        fill="rgb(37, 99, 235)"
                        stroke="white"
                        strokeWidth={3}
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
