'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDashboardStore } from '../lib/use-dashboard-store';
import { Room, RouteSnapshot, WheelSummary } from '../lib/types';

interface SocketProviderProps {
  apiUrl: string;
  rooms: Room[];
  initialWheels: WheelSummary[];
  initialRoutes: RouteSnapshot[];
  children: React.ReactNode;
}

export const SocketProvider = ({
  apiUrl,
  rooms,
  initialWheels,
  initialRoutes,
  children
}: SocketProviderProps) => {
  const setRooms = useDashboardStore((state) => state.setRooms);
  const upsertWheels = useDashboardStore((state) => state.upsertWheels);
  const setRoutes = useDashboardStore((state) => state.setRoutes);
  const upsertRoute = useDashboardStore((state) => state.upsertRoute);
  const updateKpi = useDashboardStore((state) => state.updateKpi);

  useEffect(() => {
    setRooms(rooms);
    upsertWheels(initialWheels);
    setRoutes(initialRoutes);
  }, [rooms, initialWheels, initialRoutes, setRooms, upsertWheels, setRoutes]);

  useEffect(() => {
    let socket: Socket | undefined;
    socket = io(`${apiUrl}/rt`, {
      transports: ['websocket'],
      path: '/socket.io'
    });

    socket.on('telemetry', (payload) => {
      upsertWheels([
        {
          id: payload.wheel_id,
          name: payload.wheel_name ?? `Wheel ${payload.wheel_id}`,
          assignedRoomId: null,
          assignedRoomName: null,
          online: !(payload.stale ?? false),
          lastSeen: payload.ts,
          avgRssi: payload.rssi,
          roomId: payload.room_id ?? null
        }
      ]);
    });

    socket.on('route', (route: RouteSnapshot) => {
      upsertRoute(route);
    });

    socket.on('kpi', (kpi) => {
      updateKpi(kpi);
    });

    return () => {
      socket?.disconnect();
    };
  }, [apiUrl, upsertWheels, upsertRoute, updateKpi]);

  return <>{children}</>;
};
