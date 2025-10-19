import { MapViewport } from '../../components/map-viewport';
import { SocketProvider } from '../../components/socket-provider';
import { Room, RouteSnapshot, WheelSummary } from '../../lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const fetchJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return res.json() as Promise<T>;
};

const MapPage = async () => {
  try {
    const [rooms, wheels, routes] = await Promise.all([
      fetchJson<Room[]>('/api/rooms'),
      fetchJson<WheelSummary[]>('/api/wheels'),
      fetchJson<RouteSnapshot[]>('/api/routes/live')
    ]);

    return (
      <SocketProvider apiUrl={API_BASE} rooms={rooms} initialWheels={wheels} initialRoutes={routes}>
        <section className='flex flex-col gap-6'>
          <div className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <h2 className='text-xl font-semibold text-slate-900'>Routing Map</h2>
            <p className='text-sm text-slate-600'>
              Live topology view showing current route path per wheel and recovery delays.
            </p>
          </div>
          <MapViewport />
        </section>
      </SocketProvider>
    );
  } catch (err) {
    return (
      <section className='rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700'>
        <h2 className='text-lg font-semibold'>Failed to load routing data</h2>
        <p className='text-sm'>
          {(err as Error).message ?? 'Unknown error. Ensure the API service is reachable and try again.'}
        </p>
      </section>
    );
  }
};

export default MapPage;

