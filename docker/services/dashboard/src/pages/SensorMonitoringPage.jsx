import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    Activity, Heart, Wifi, WifiOff, AlertTriangle,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    Circle, RotateCcw, Gauge, MapPin
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// WebSocket server URL for Polar sensor service
const SENSOR_WS_URL = 'ws://localhost:8767';
const SENSOR_HTTP_URL = 'http://localhost:8768';

// Maximum data points to show in graphs
const MAX_GRAPH_POINTS = 100;

export function SensorMonitoringPage() {
    const { t } = useTranslation();

    // Connection state
    const [connected, setConnected] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [deviceName, setDeviceName] = useState(null);

    // Sensor data
    const [currentData, setCurrentData] = useState(null);
    const [gyroHistory, setGyroHistory] = useState([]);
    const [accelHistory, setAccelHistory] = useState([]);

    // Fall detection
    const [fallDetected, setFallDetected] = useState(false);
    const [fallEvents, setFallEvents] = useState([]);

    // Statistics
    const [stats, setStats] = useState({
        totalDistance: 0,
        totalSamples: 0,
        fallCount: 0,
        heartRate: 0
    });

    // WebSocket ref
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    // Connect to WebSocket
    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            const ws = new WebSocket(SENSOR_WS_URL);

            ws.onopen = () => {
                console.log('Connected to Polar sensor service');
                setConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };

            ws.onclose = () => {
                console.log('Disconnected from sensor service');
                setConnected(false);
                setStreaming(false);

                // Auto-reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    connectWebSocket();
                }, 3000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            wsRef.current = ws;

        } catch (error) {
            console.error('Failed to connect:', error);
        }
    }, []);

    // Handle incoming messages
    const handleMessage = useCallback((message) => {
        switch (message.type) {
            case 'status':
                setConnected(message.data.connected);
                setStreaming(message.data.streaming);
                setDeviceName(message.data.device_name);
                if (message.data.stats) {
                    setStats(prev => ({
                        ...prev,
                        totalSamples: message.data.stats.total_samples || 0,
                        fallCount: message.data.stats.fall_count || 0
                    }));
                }
                break;

            case 'connection_status':
                setConnected(message.connected);
                setDeviceName(message.device_name);
                break;

            case 'raw_data':
                handleRawData(message.data);
                break;

            case 'processed_data':
                handleProcessedData(message.data);
                break;

            case 'sensor_data':
                // Legacy support (optional)
                handleRawData(message.data);
                handleProcessedData(message.data);
                break;

            case 'history':
                // Initialize graphs with history
                if (message.data && message.data.length > 0) {
                    const gyroData = message.data.map((d, i) => ({
                        time: i,
                        x: d.gyro?.x || 0,
                        y: d.gyro?.y || 0,
                        z: d.gyro?.z || 0
                    }));
                    setGyroHistory(gyroData.slice(-MAX_GRAPH_POINTS));
                }
                break;

            case 'fall_alert':
                setFallDetected(true);
                setFallEvents(prev => [message.event, ...prev].slice(0, 20));
                break;

            case 'fall_acknowledged':
                setFallDetected(false);
                break;

            default:
                break;
        }
    }, []);

    // Handle raw sensor data (high frequency)
    const handleRawData = useCallback((data) => {
        // Update gyro history
        if (data.gyro) {
            setGyroHistory(prev => {
                const newPoint = {
                    time: prev.length,
                    x: data.gyro?.x || 0,
                    y: data.gyro?.y || 0,
                    z: data.gyro?.z || 0
                };
                return [...prev.slice(-(MAX_GRAPH_POINTS - 1)), newPoint];
            });
        }

        // Update accel history
        if (data.accel) {
            setAccelHistory(prev => {
                const newPoint = {
                    time: prev.length,
                    x: data.accel?.x || 0,
                    y: data.accel?.y || 0,
                    z: data.accel?.z || 0
                };
                return [...prev.slice(-(MAX_GRAPH_POINTS - 1)), newPoint];
            });
        }

        // Also update currentData for Raw Data Panel display
        // Note: this might cause frequent re-renders, consider throttling if panel not open
        setCurrentData(prev => ({ ...prev, gyro: data.gyro, accel: data.accel }));
    }, []);

    // Handle processed data (throttled)
    const handleProcessedData = useCallback((data) => {
        setCurrentData(prev => ({
            ...prev,
            processed: data.processed,
            heart_rate: data.heart_rate
        }));

        // Update heart rate
        if (data.heart_rate) {
            setStats(prev => ({ ...prev, heartRate: data.heart_rate }));
        }

        // Update distance
        if (data.processed?.distance_m !== undefined) {
            setStats(prev => ({ ...prev, totalDistance: data.processed.distance_m }));
        }

        // Update fall status
        if (data.processed?.fall_detected) {
            setFallDetected(true);
        }
    }, []);

    // Send command to server
    const sendCommand = useCallback((action) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action }));
        }
    }, []);

    // Acknowledge fall
    const acknowledgeFall = useCallback(() => {
        sendCommand('acknowledge_fall');
        setFallDetected(false);
    }, [sendCommand]);

    // Reset distance
    const resetDistance = useCallback(() => {
        sendCommand('reset_distance');
        setStats(prev => ({ ...prev, totalDistance: 0 }));
    }, [sendCommand]);

    // Connect on mount
    useEffect(() => {
        connectWebSocket();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connectWebSocket]);

    // Get motion icon
    const getMotionIcon = () => {
        const motion = currentData?.processed?.motion;
        if (motion === 'FORWARD') return <ArrowUp className="motion-icon forward" />;
        if (motion === 'BACKWARD') return <ArrowDown className="motion-icon backward" />;
        return <Circle className="motion-icon stop" />;
    };

    // Get direction icon
    const getDirectionIcon = () => {
        const direction = currentData?.processed?.direction;
        if (direction === 'LEFT') return <ArrowLeft className="direction-icon left" />;
        if (direction === 'RIGHT') return <ArrowRight className="direction-icon right" />;
        return <ArrowUp className="direction-icon straight" />;
    };

    return (
        <div className="page-content sensor-monitoring-page">
            {/* Fall Detection Alert Banner */}
            {fallDetected && (
                <div className="fall-alert-banner">
                    <div className="fall-alert-content">
                        <AlertTriangle size={32} />
                        <div className="fall-alert-text">
                            <h3>⚠️ FALL DETECTED!</h3>
                            <p>Immediate attention may be required</p>
                        </div>
                        <button className="fall-acknowledge-btn" onClick={acknowledgeFall}>
                            Acknowledge
                        </button>
                    </div>
                </div>
            )}

            <div className="page-header">
                <h2><Gauge /> Sensor Monitoring</h2>
                <p>Real-time data from Polar Verity Sense</p>
            </div>

            {/* Connection Status */}
            <div className="sensor-status-bar">
                <div className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
                    {connected ? <Wifi /> : <WifiOff />}
                    <span>{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                {deviceName && (
                    <div className="device-name">
                        <span>📱 {deviceName}</span>
                    </div>
                )}
                {streaming && (
                    <div className="streaming-indicator">
                        <span className="pulse-dot"></span>
                        <span>Streaming</span>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <div className="sensor-stats-grid">
                {/* Motion Card */}
                <div className="sensor-card motion-card">
                    <div className="sensor-card-header">
                        <Activity />
                        <span>Motion</span>
                    </div>
                    <div className="sensor-card-value motion-display">
                        {getMotionIcon()}
                        <span className="motion-text">
                            {currentData?.processed?.motion || 'STOP'}
                        </span>
                    </div>
                </div>

                {/* Direction Card */}
                <div className="sensor-card direction-card">
                    <div className="sensor-card-header">
                        <MapPin />
                        <span>Direction</span>
                    </div>
                    <div className="sensor-card-value direction-display">
                        {getDirectionIcon()}
                        <span className="direction-text">
                            {currentData?.processed?.direction || 'STRAIGHT'}
                        </span>
                    </div>
                </div>

                {/* Distance Card */}
                <div className="sensor-card distance-card">
                    <div className="sensor-card-header">
                        <Gauge />
                        <span>Distance</span>
                        <button className="reset-btn" onClick={resetDistance} title="Reset">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                    <div className="sensor-card-value">
                        <span className="distance-value">
                            {stats.totalDistance.toFixed(2)}
                        </span>
                        <span className="distance-unit">meters</span>
                    </div>
                </div>

                {/* Heart Rate Card */}
                <div className="sensor-card heart-rate-card">
                    <div className="sensor-card-header">
                        <Heart />
                        <span>Heart Rate</span>
                    </div>
                    <div className="sensor-card-value">
                        <span className="heart-rate-value pulse-animation">
                            {stats.heartRate || '--'}
                        </span>
                        <span className="heart-rate-unit">BPM</span>
                    </div>
                </div>
            </div>

            {/* Raw Data Graphs */}
            <div className="bg-[#1e293b] p-4 rounded-xl shadow-lg border border-[#334155] mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Activity className="text-blue-400" />
                        <h3 className="text-lg font-semibold text-gray-100">Accelerometer Data (g)</h3>
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                        X: {currentData?.accel?.x?.toFixed(1) || '0.0'} Y: {currentData?.accel?.y?.toFixed(1) || '0.0'} Z: {currentData?.accel?.z?.toFixed(1) || '0.0'}
                    </div>
                </div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={accelHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="time" hide />
                            <YAxis domain={['auto', 'auto']} stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                itemStyle={{ color: '#f1f5f9' }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="x" stroke="#f87171" name="Accel X" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="y" stroke="#4ade80" name="Accel Y" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="z" stroke="#60a5fa" name="Accel Z" dot={false} strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {/* Gyroscope Graph */}
            <div className="sensor-graph-container">
                <div className="card">
                    <div className="card-header">
                        <h3>📈 Gyroscope Data (°/s)</h3>
                        <div className="gyro-values">
                            <span className="gyro-x">X: {currentData?.gyro?.x?.toFixed(1) || '0.0'}</span>
                            <span className="gyro-y">Y: {currentData?.gyro?.y?.toFixed(1) || '0.0'}</span>
                            <span className="gyro-z">Z: {currentData?.gyro?.z?.toFixed(1) || '0.0'}</span>
                        </div>
                    </div>
                    <div className="card-body graph-body">
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={gyroHistory}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis
                                    dataKey="time"
                                    stroke="rgba(255,255,255,0.5)"
                                    tick={false}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.5)"
                                    domain={[-100, 100]}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(0,0,0,0.8)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="x"
                                    stroke="#ff6b6b"
                                    dot={false}
                                    strokeWidth={2}
                                    name="Gyro X"
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="y"
                                    stroke="#51cf66"
                                    dot={false}
                                    strokeWidth={2}
                                    name="Gyro Y"
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="z"
                                    stroke="#339af0"
                                    dot={false}
                                    strokeWidth={2}
                                    name="Gyro Z"
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Fall Events History */}
            {fallEvents.length > 0 && (
                <div className="fall-events-container">
                    <div className="card">
                        <div className="card-header">
                            <h3>⚠️ Fall Events ({fallEvents.length})</h3>
                        </div>
                        <div className="card-body">
                            <div className="fall-events-list">
                                {fallEvents.map((event, index) => (
                                    <div key={index} className="fall-event-item">
                                        <span className="fall-event-time">
                                            {new Date(event.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="fall-event-gyro">
                                            Gyro Z: {event.data?.gyro?.z?.toFixed(1)}°/s
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Raw Data Panel (for debugging) */}
            <div className="raw-data-panel">
                <details>
                    <summary>Raw Sensor Data</summary>
                    <pre className="raw-data-code">
                        {JSON.stringify(currentData, null, 2)}
                    </pre>
                </details>
            </div>

            {/* Styles */}
            <style>{`
                .sensor-monitoring-page {
                    padding: 1rem;
                }
                
                .fall-alert-banner {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(135deg, #ff4444, #cc0000);
                    padding: 1rem;
                    z-index: 1000;
                    animation: flashAlert 0.5s infinite alternate;
                }
                
                @keyframes flashAlert {
                    from { opacity: 1; }
                    to { opacity: 0.8; }
                }
                
                .fall-alert-content {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    color: white;
                }
                
                .fall-alert-text h3 {
                    margin: 0;
                    font-size: 1.25rem;
                }
                
                .fall-alert-text p {
                    margin: 0;
                    opacity: 0.9;
                }
                
                .fall-acknowledge-btn {
                    background: white;
                    color: #cc0000;
                    border: none;
                    padding: 0.5rem 1.5rem;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                }
                
                .fall-acknowledge-btn:hover {
                    transform: scale(1.05);
                }
                
                .sensor-status-bar {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.75rem 1rem;
                    background: rgba(255,255,255,0.05);
                    border-radius: 12px;
                    margin-bottom: 1rem;
                }
                
                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 20px;
                    font-size: 0.875rem;
                    font-weight: 500;
                }
                
                .status-indicator.connected {
                    background: rgba(81, 207, 102, 0.2);
                    color: #51cf66;
                }
                
                .status-indicator.disconnected {
                    background: rgba(255, 107, 107, 0.2);
                    color: #ff6b6b;
                }
                
                .device-name {
                    font-size: 0.875rem;
                    opacity: 0.8;
                }
                
                .streaming-indicator {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-left: auto;
                }
                
                .pulse-dot {
                    width: 8px;
                    height: 8px;
                    background: #51cf66;
                    border-radius: 50%;
                    animation: pulse 1s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
                }
                
                .sensor-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                
                .sensor-card {
                    background: rgba(255,255,255,0.05);
                    border-radius: 16px;
                    padding: 1rem;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                
                .sensor-card-header {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    opacity: 0.8;
                    margin-bottom: 0.75rem;
                }
                
                .sensor-card-header .reset-btn {
                    margin-left: auto;
                    background: transparent;
                    border: none;
                    color: inherit;
                    opacity: 0.6;
                    cursor: pointer;
                    padding: 0.25rem;
                }
                
                .sensor-card-header .reset-btn:hover {
                    opacity: 1;
                }
                
                .sensor-card-value {
                    display: flex;
                    align-items: baseline;
                    gap: 0.5rem;
                }
                
                .motion-display, .direction-display {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                
                .motion-icon, .direction-icon {
                    width: 32px;
                    height: 32px;
                }
                
                .motion-icon.forward { color: #51cf66; }
                .motion-icon.backward { color: #ff6b6b; }
                .motion-icon.stop { color: #868e96; }
                
                .direction-icon.left { color: #ff922b; }
                .direction-icon.right { color: #339af0; }
                .direction-icon.straight { color: #51cf66; }
                
                .motion-text, .direction-text {
                    font-size: 1.25rem;
                    font-weight: 600;
                }
                
                .distance-value, .heart-rate-value {
                    font-size: 2rem;
                    font-weight: 700;
                }
                
                .distance-unit, .heart-rate-unit {
                    font-size: 0.875rem;
                    opacity: 0.7;
                }
                
                .heart-rate-card {
                    background: linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,107,107,0.05));
                }
                
                .pulse-animation {
                    animation: heartbeat 1s infinite;
                }
                
                @keyframes heartbeat {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                
                .sensor-graph-container {
                    margin-bottom: 1.5rem;
                }
                
                .sensor-graph-container .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                
                .gyro-values {
                    display: flex;
                    gap: 1rem;
                    font-size: 0.875rem;
                    font-family: monospace;
                }
                
                .gyro-x { color: #ff6b6b; }
                .gyro-y { color: #51cf66; }
                .gyro-z { color: #339af0; }
                
                .graph-body {
                    padding: 0.5rem !important;
                }
                
                .fall-events-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .fall-event-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.75rem;
                    background: rgba(255,68,68,0.1);
                    border-radius: 8px;
                    border-left: 3px solid #ff4444;
                }
                
                .fall-event-time {
                    font-weight: 500;
                }
                
                .fall-event-gyro {
                    font-family: monospace;
                    opacity: 0.8;
                }
                
                .raw-data-panel {
                    margin-top: 1.5rem;
                }
                
                .raw-data-panel summary {
                    cursor: pointer;
                    padding: 0.75rem;
                    background: rgba(255,255,255,0.05);
                    border-radius: 8px;
                    font-size: 0.875rem;
                }
                
                .raw-data-code {
                    background: rgba(0,0,0,0.3);
                    padding: 1rem;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    overflow-x: auto;
                    margin-top: 0.5rem;
                }
            `}</style>
        </div>
    );
}

export default SensorMonitoringPage;
