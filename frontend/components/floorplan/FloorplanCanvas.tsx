"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { FloorplanRoomShape } from "@/lib/floorplanLayout";

export type { FloorplanRoomShape };

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function clampRoom(r: FloorplanRoomShape): FloorplanRoomShape {
  let { x, y, w, h } = r;
  w = Math.max(8, Math.min(100 - 0.01, w));
  h = Math.max(8, Math.min(100 - 0.01, h));
  x = Math.max(0, Math.min(100 - w, x));
  y = Math.max(0, Math.min(100 - h, y));
  return { ...r, x, y, w, h };
}

function applyResize(
  corner: "nw" | "ne" | "sw" | "se",
  room: FloorplanRoomShape,
  px: number,
  py: number,
): FloorplanRoomShape {
  const right = room.x + room.w;
  const bottom = room.y + room.h;
  let { x, y, w, h } = room;
  switch (corner) {
    case "se":
      w = px - x;
      h = py - y;
      break;
    case "ne":
      w = px - x;
      h = bottom - py;
      y = py;
      break;
    case "sw":
      w = right - px;
      h = py - y;
      x = px;
      break;
    case "nw":
      w = right - px;
      h = bottom - py;
      x = px;
      y = py;
      break;
  }
  return clampRoom({ ...room, x, y, w, h });
}

type DragState =
  | {
      kind: "move";
      id: string;
      ptr0: { x: number; y: number };
      room0: FloorplanRoomShape;
    }
  | {
      kind: "resize";
      corner: "nw" | "ne" | "sw" | "se";
      id: string;
      orig: FloorplanRoomShape;
    }
  | null;

export default function FloorplanCanvas({
  rooms,
  onRoomsChange,
  selectedId,
  onSelect,
  readOnly = false,
  enableZoom = true,
}: {
  rooms: FloorplanRoomShape[];
  onRoomsChange: (next: FloorplanRoomShape[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true: no drag/resize; rooms are clickable only to highlight (via onSelect). */
  readOnly?: boolean;
  /** Show zoom controls and allow Ctrl/Cmd + wheel zoom */
  enableZoom?: boolean;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const [drag, setDrag] = useState<DragState>(null);
  const [zoom, setZoom] = useState(1);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * 100,
      y: ((clientY - r.top) / r.height) * 100,
    };
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const p = toPercent(e.clientX, e.clientY);
      if (drag.kind === "move") {
        const dx = p.x - drag.ptr0.x;
        const dy = p.y - drag.ptr0.y;
        const moved = clampRoom({
          ...drag.room0,
          x: drag.room0.x + dx,
          y: drag.room0.y + dy,
        });
        onRoomsChange(
          roomsRef.current.map((room) => (room.id === drag.id ? moved : room)),
        );
      } else {
        const next = applyResize(drag.corner, drag.orig, p.x, p.y);
        onRoomsChange(
          roomsRef.current.map((room) => (room.id === drag.id ? next : room)),
        );
      }
    };

    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, onRoomsChange, toPercent]);

  function startMove(room: FloorplanRoomShape, e: React.PointerEvent) {
    if (readOnly) return;
    e.stopPropagation();
    onSelect(room.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toPercent(e.clientX, e.clientY);
    setDrag({ kind: "move", id: room.id, ptr0: p, room0: { ...room } });
  }

  function startResize(
    corner: "nw" | "ne" | "sw" | "se",
    room: FloorplanRoomShape,
    e: React.PointerEvent,
  ) {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(room.id);
    setDrag({ kind: "resize", corner, id: room.id, orig: { ...room } });
  }

  const cornerBtn =
    "absolute w-3 h-3 bg-primary border-2 border-white rounded-sm shadow z-10 touch-none";

  const onWheelZoom = useCallback((e: React.WheelEvent) => {
    if (!enableZoom) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    setZoom((z) => clampZoom(z - e.deltaY * 0.002));
  }, [enableZoom]);

  return (
    <div className="space-y-2">
      {enableZoom && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-on-surface">
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
          <span className="text-xs text-on-surface-variant">{t("floorplan.zoomWheelHint")}</span>
        </div>
      )}

      <div
        className="overflow-auto rounded-xl border border-outline-variant/30 bg-surface-container-low/40 max-h-[min(85vh,960px)] min-h-[min(78vh,720px)]"
        onWheel={onWheelZoom}
      >
        <div
          ref={containerRef}
          style={{
            transform: enableZoom ? `scale(${zoom})` : undefined,
            transformOrigin: "top left",
          }}
          className={`relative w-full min-h-[560px] rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/80 overflow-hidden select-none ${
            readOnly ? "cursor-default" : ""
          }`}
          onPointerDown={() => onSelect(null)}
        >
          {rooms.map((room) => {
            const selected = selectedId === room.id;
            return (
              <div
                key={room.id}
                className={`absolute rounded-lg flex flex-col items-center justify-center text-center px-1 shadow-md transition-shadow ${
                  selected
                    ? "ring-2 ring-primary bg-primary-fixed/90"
                    : "bg-primary-fixed/70 hover:bg-primary-fixed/85"
                }`}
                style={{
                  left: `${room.x}%`,
                  top: `${room.y}%`,
                  width: `${room.w}%`,
                  height: `${room.h}%`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {readOnly ? (
                  <button
                    type="button"
                    className="flex-1 w-full flex items-center justify-center p-1 cursor-default"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect(room.id);
                    }}
                  >
                    <span className="text-xs font-semibold text-primary leading-tight line-clamp-3">
                      {room.label}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex-1 w-full cursor-grab active:cursor-grabbing flex items-center justify-center p-1"
                      onPointerDown={(e) => startMove(room, e)}
                    >
                      <span className="text-xs font-semibold text-primary leading-tight line-clamp-3">
                        {room.label}
                      </span>
                    </button>
                    {selected && (
                      <>
                        <button
                          type="button"
                          aria-label="resize-nw"
                          className={`${cornerBtn} -left-1.5 -top-1.5 cursor-nwse-resize`}
                          onPointerDown={(e) => startResize("nw", room, e)}
                        />
                        <button
                          type="button"
                          aria-label="resize-ne"
                          className={`${cornerBtn} -right-1.5 -top-1.5 cursor-nesw-resize`}
                          onPointerDown={(e) => startResize("ne", room, e)}
                        />
                        <button
                          type="button"
                          aria-label="resize-sw"
                          className={`${cornerBtn} -left-1.5 -bottom-1.5 cursor-nesw-resize`}
                          onPointerDown={(e) => startResize("sw", room, e)}
                        />
                        <button
                          type="button"
                          aria-label="resize-se"
                          className={`${cornerBtn} -right-1.5 -bottom-1.5 cursor-nwse-resize`}
                          onPointerDown={(e) => startResize("se", room, e)}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
