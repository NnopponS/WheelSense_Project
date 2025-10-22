import { useState, useEffect, useCallback } from 'react';
import { apiService, SensorData, SensorHistory, DeviceLabel, MapLayout } from '../services/api';

// Hook for sensor data with real-time updates
export function useSensorData() {
  const [data, setData] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.getSensorData();
      setData(response.data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sensor data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Set up SSE connection for real-time updates
    const eventSource = apiService.createSSEConnection(
      (message) => {
        if (message.type === 'connected' || message.type === 'keepalive') {
          return; // Ignore connection messages
        }
        
        // Handle sensor data updates
        if (message.reason === 'sensor_data' || message.reason === 'labels') {
          fetchData(); // Refresh data when updates occur
        }
      },
      (error) => {
        console.error('SSE connection lost, retrying...');
        // Retry connection after 5 seconds
        setTimeout(fetchData, 5000);
      }
    );

    return () => {
      eventSource.close();
    };
  }, [fetchData]);

  return { data, loading, error, lastUpdate, refetch: fetchData };
}

// Hook for sensor history
export function useSensorHistory(nodeId: number, wheelId: number, limit: number = 100) {
  const [data, setData] = useState<SensorHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!nodeId || !wheelId) return;
    
    try {
      setLoading(true);
      const response = await apiService.getSensorHistory(nodeId, wheelId, limit);
      setData(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sensor history');
    } finally {
      setLoading(false);
    }
  }, [nodeId, wheelId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { data, loading, error, refetch: fetchHistory };
}

// Hook for device labels
export function useDeviceLabels() {
  const [labels, setLabels] = useState<Map<string, DeviceLabel>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLabel = useCallback(async (
    nodeId: number, 
    wheelId: number, 
    nodeLabel: string, 
    wheelLabel: string
  ) => {
    try {
      setLoading(true);
      const updatedLabel = await apiService.updateDeviceLabels(nodeId, wheelId, nodeLabel, wheelLabel);
      
      // Update local state
      const key = `${nodeId}-${wheelId}`;
      setLabels(prev => new Map(prev.set(key, updatedLabel)));
      setError(null);
      
      return updatedLabel;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update labels');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getLabel = useCallback((nodeId: number, wheelId: number): DeviceLabel | null => {
    const key = `${nodeId}-${wheelId}`;
    return labels.get(key) || null;
  }, [labels]);

  return { labels, loading, error, updateLabel, getLabel };
}

// Hook for map layout
export function useMapLayout() {
  const [layout, setLayout] = useState<MapLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.getMapLayout();
      setLayout(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch map layout');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveLayout = useCallback(async (newLayout: MapLayout[]) => {
    try {
      setLoading(true);
      await apiService.saveMapLayout(newLayout);
      setLayout(newLayout);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save map layout');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLayout();
  }, [fetchLayout]);

  return { layout, loading, error, saveLayout, refetch: fetchLayout };
}

// Hook for device statistics
export function useDeviceStats(sensorData: SensorData[]) {
  const stats = {
    totalNodes: new Set(sensorData.map(d => d.node_id)).size,
    totalWheelchairs: new Set(sensorData.map(d => d.wheel_id)).size,
    activeWheelchairs: sensorData.filter(d => d.motion === 1).length,
    onlineDevices: sensorData.filter(d => !d.stale).length,
    alerts: sensorData.filter(d => d.rssi < -80).length,
  };

  return stats;
}
