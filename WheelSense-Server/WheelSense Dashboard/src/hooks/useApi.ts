/**
 * WheelSense Custom Hooks
 * React hooks for accessing backend data with SSE real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSensorData,
  getSensorDataByDevice,
  getSensorHistory,
  getSystemStats,
  getMapLayout,
  updateDeviceLabels,
  updateMapLayout,
  createSSEConnection,
  type SensorData,
  type SystemStats,
  type MapLayout,
  type HistoryDataPoint,
  type SSEMessage,
} from '../services/api';

// ============================================
// useSensorData Hook
// ============================================

export interface UseSensorDataResult {
  data: SensorData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isConnected: boolean;
  isUpdating: boolean;
  lastUpdate: Date | null;
}

export function useSensorData(): UseSensorDataResult {
  const [data, setData] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      } else {
        setIsUpdating(true);
      }
      setError(null);
      
      const sensorData = await getSensorData();
      setData(sensorData);
      setLastUpdate(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sensor data';
      setError(errorMessage);
      console.error('[useSensorData] Error:', errorMessage);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, []);

  // Setup SSE connection
  useEffect(() => {
    let isActive = true;

    const setupSSE = () => {
      if (!isActive) return;

      try {
        const es = createSSEConnection(
          (message: SSEMessage) => {
            if (!isActive) return;

            if (message.type === 'connected') {
              setIsConnected(true);
              console.log('[SSE] Connected:', message);
            } else if (message.type === 'sensor_update') {
              console.log('[SSE] Sensor update received:', message);
              // Refetch data without showing loading state
              fetchData(false);
            } else if (message.type === 'labels_updated' || message.type === 'layout_updated') {
              console.log('[SSE] Config update received:', message.type);
              fetchData(false);
            }
          },
          (error) => {
            console.error('[SSE] Error:', error);
            setIsConnected(false);
            
            // Retry connection after 5 seconds
            if (isActive) {
              fetchTimeoutRef.current = setTimeout(() => {
                if (isActive) setupSSE();
              }, 5000);
            }
          },
          () => {
            setIsConnected(true);
            console.log('[SSE] Connection opened');
          }
        );

        eventSourceRef.current = es;
      } catch (err) {
        console.error('[SSE] Failed to create connection:', err);
        setIsConnected(false);
      }
    };

    // Initial data fetch
    fetchData(true);

    // Setup SSE
    setupSSE();

    // Cleanup
    return () => {
      isActive = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(false),
    isConnected,
    isUpdating,
    lastUpdate,
  };
}

// ============================================
// useDeviceData Hook
// ============================================

export interface UseDeviceDataResult {
  data: SensorData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDeviceData(node: number, wheel: number): UseDeviceDataResult {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const deviceData = await getSensorDataByDevice(node, wheel);
      setData(deviceData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch device data';
      setError(errorMessage);
      console.error('[useDeviceData] Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [node, wheel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// ============================================
// useDeviceHistory Hook
// ============================================

export interface UseDeviceHistoryResult {
  data: HistoryDataPoint[];
  loading: boolean;
  error: string | null;
  refetch: (limit?: number) => Promise<void>;
}

export function useDeviceHistory(
  node: number,
  wheel: number,
  initialLimit: number = 100
): UseDeviceHistoryResult {
  const [data, setData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (limit: number = initialLimit) => {
    try {
      setLoading(true);
      setError(null);
      
      const historyData = await getSensorHistory(node, wheel, limit);
      setData(historyData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch history data';
      setError(errorMessage);
      console.error('[useDeviceHistory] Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [node, wheel, initialLimit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// ============================================
// useSystemStats Hook
// ============================================

export interface UseSystemStatsResult {
  stats: SystemStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSystemStats(): UseSystemStatsResult {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const statsData = await getSystemStats();
      setStats(statsData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch stats';
      setError(errorMessage);
      console.error('[useSystemStats] Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

// ============================================
// useDeviceLabels Hook
// ============================================

export interface UseDeviceLabelsResult {
  updateLabels: (node: number, wheel: number, labels: {
    node_label?: string;
    wheel_label?: string;
  }) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useDeviceLabels(): UseDeviceLabelsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLabels = useCallback(async (
    node: number,
    wheel: number,
    labels: { node_label?: string; wheel_label?: string }
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      await updateDeviceLabels(node, wheel, labels);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update labels';
      setError(errorMessage);
      console.error('[useDeviceLabels] Error:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    updateLabels,
    loading,
    error,
  };
}
