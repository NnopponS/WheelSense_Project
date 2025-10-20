'use client';

import { memo, useMemo } from 'react';
import clsx from 'clsx';
import { useDashboardStore } from '../lib/use-dashboard-store';

const ROOM_SCALE = 1;

const FALLBACK_NODES = new Map<string, { x: number; y: number }>([
  ['Gateway', { x: 40, y: 40 }]
]);

const computeRoomCenters = (rooms: ReturnType<typeof useDashboardStore.getState>['rooms']) => {
  const map = new Map<string, { x: number; y: number }>(FALLBACK_NODES);
  rooms.forEach((room) => {
    const center = {
      x: room.rect_x + room.rect_w / 2,
      y: room.rect_y + room.rect_h / 2
    };
    map.set(room.name, center);
    map.set(room.name.toLowerCase(), center);
  });
  return map;
};

export const MapViewport = memo(() => {
  const rooms = useDashboardStore((state) => state.rooms);
  const wheels = useDashboardStore((state) => state.wheels);
  const routes = useDashboardStore((state) => state.routes);

  const roomCenters = useMemo(() => computeRoomCenters(rooms), [rooms]);
  const fallbackMarkers = useMemo(
    () =>
      Array.from(FALLBACK_NODES.entries()).filter(([name]) =>
        rooms.every((room) => room.name !== name)
      ),
    [rooms]
  );

  const viewBox = useMemo(() => {
    if (rooms.length === 0) {
      return { width: 800, height: 600 };
    }
    const maxX = Math.max(...rooms.map((room) => room.rect_x + room.rect_w));
    const maxY = Math.max(...rooms.map((room) => room.rect_y + room.rect_h));
    return { width: maxX + 120, height: maxY + 120 };
  }, [rooms]);

  return (
    <div className='w-full overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm'>
      <svg
        viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
        className='h-[600px] w-full'
      >
        {rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.rect_x * ROOM_SCALE}
              y={room.rect_y * ROOM_SCALE}
              width={room.rect_w * ROOM_SCALE}
              height={room.rect_h * ROOM_SCALE}
              className='fill-sky-100 stroke-sky-500'
              strokeWidth={2}
              rx={8}
            />
            <text
              x={(room.rect_x + 8) * ROOM_SCALE}
              y={(room.rect_y + 20) * ROOM_SCALE}
              className='text-sm font-medium fill-sky-900'
            >
              {room.name}
            </text>
          </g>
        ))}

        {fallbackMarkers.map(([name, point]) => (
          <g key={`fallback-${name}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={10}
              className='fill-emerald-100 stroke-emerald-500'
              strokeWidth={2}
            />
            <text
              x={point.x + 12}
              y={point.y + 4}
              className='text-sm font-medium fill-emerald-700'
            >
              {name}
            </text>
          </g>
        ))}

        {routes.map((route) => {
          if (!route.path || route.path.length < 2) return null;
          const points = route.path
            .map((name) => roomCenters.get(name) ?? roomCenters.get(name.toLowerCase()))
            .filter((pt): pt is { x: number; y: number } => Boolean(pt));
          if (points.length < 2) return null;
          const pathD = points.map((pt) => `${pt.x},${pt.y}`).join(' ');
          const last = points[points.length - 1];
          return (
            <g key={`route-${route.wheelId}`}>
              <polyline
                points={pathD}
                className={clsx(
                  'fill-none stroke-2',
                  route.recovered ? 'stroke-emerald-500' : 'stroke-rose-500'
                )}
                strokeDasharray={route.recovered ? '4 6' : undefined}
              />
              <circle
                cx={last.x}
                cy={last.y}
                r={8}
                className={clsx(
                  route.recovered ? 'fill-emerald-500' : 'fill-rose-500'
                )}
              />
              <text
                x={last.x + 10}
                y={last.y - 8}
                className='text-xs font-semibold fill-slate-800'
              >
                {route.wheelName}
              </text>
              {route.recoveryMs ? (
                <text
                  x={last.x + 10}
                  y={last.y + 8}
                  className='text-[10px] fill-slate-500'
                >
                  recovery {route.recoveryMs} ms
                </text>
              ) : null}
            </g>
          );
        })}

        {wheels.map((wheel) => {
          const room = rooms.find((r) => r.id === (wheel.roomId ?? wheel.assignedRoomId ?? -1));
          if (!room) return null;
          const center = {
            x: room.rect_x + room.rect_w / 2,
            y: room.rect_y + room.rect_h / 2
          };
          return (
            <g key={`wheel-${wheel.id}`}>
              <circle
                cx={center.x}
                cy={center.y}
                r={6}
                className={wheel.online ? 'fill-emerald-500' : 'fill-gray-400'}
              />
              <text
                x={center.x + 8}
                y={center.y + 4}
                className='text-xs fill-slate-700'
              >
                {wheel.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

MapViewport.displayName = 'MapViewport';
