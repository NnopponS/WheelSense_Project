import { useEffect, useState } from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

interface RealtimeIndicatorProps {
  isConnected: boolean;
  lastUpdate?: Date | null;
  isUpdating?: boolean;
}

export function RealtimeIndicator({ isConnected, lastUpdate, isUpdating }: RealtimeIndicatorProps) {
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (isUpdating) {
      setPulseKey(prev => prev + 1);
    }
  }, [isUpdating]);

  return (
    <div className="flex items-center gap-2">
      {/* Connection Status Dot */}
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {isConnected && (
            <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
          )}
        </div>
      </div>

      {/* Status Text */}
      <div className="flex flex-col">
        <span className={`text-xs font-medium ${
          isConnected ? 'text-green-600' : 'text-red-600'
        }`}>
          {isConnected ? 'Real-time Active' : 'Disconnected'}
        </span>
        {lastUpdate && (
          <span className="text-[10px] text-gray-500">
            {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Update Animation */}
      {isUpdating && (
        <div key={pulseKey} className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
          <span className="text-[10px] text-blue-500 animate-pulse">Syncing</span>
        </div>
      )}
    </div>
  );
}

interface RealtimeBadgeProps {
  isConnected: boolean;
  showIcon?: boolean;
}

export function RealtimeBadge({ isConnected, showIcon = true }: RealtimeBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
      isConnected 
        ? 'bg-green-100 text-green-700 border border-green-300' 
        : 'bg-red-100 text-red-700 border border-red-300'
    }`}>
      {showIcon && (
        isConnected ? (
          <Wifi className="w-3 h-3 animate-pulse" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )
      )}
      <span>{isConnected ? 'Live' : 'Offline'}</span>
      {isConnected && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
}

