import React, { useState, useEffect } from 'react'
import DetectionViewer from './DetectionViewer'
import TrainModel from './TrainModel'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('detection') // 'detection' or 'train'
  const [devices, setDevices] = useState([])
  const [detectionResults, setDetectionResults] = useState({})
  const [ws, setWs] = useState(null)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8) // Default 80%

  // Use ref for devices to access in WebSocket callback without triggering reconnection
  const devicesRef = React.useRef(devices)

  // Update ref when devices change
  useEffect(() => {
    devicesRef.current = devices
  }, [devices])

  useEffect(() => {
    // Fetch device list
    fetchDevices()

    // Connect to WebSocket for detection results
    // Use nginx proxy on the same host:port as the web app
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`
    console.log('[App] Connecting to WebSocket:', wsUrl)
    const websocket = new WebSocket(wsUrl)

    websocket.onopen = () => {
      console.log('[App] ✅ WebSocket connected for detection updates')
      // Send a ping message to verify connection
      websocket.send(JSON.stringify({ type: 'ping' }))
    }

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // console.log('[App] WebSocket message received:', data)

        // Handle wheelchair detection messages
        if (data.type === 'wheelchair_detection') {
          // Try multiple room matching strategies
          let room = data.room

          // Use ref to access current devices
          const currentDevices = devicesRef.current

          // If no room in message, try to find from device_id
          if (!room && data.device_id) {
            const device = currentDevices.find(d => (d.id || d.deviceId) === data.device_id)
            if (device) {
              room = device.room || device.roomType || 'unknown'
              console.log('[App] Found room from device:', room)
            }
          }

          // Normalize room name (handle variations like "livingroom" vs "living room")
          const normalizeRoom = (roomName) => {
            if (!roomName) return null
            return roomName.toLowerCase().replace(/\s+/g, '')
          }

          // Group devices by room for matching
          const devicesByRoomLocal = currentDevices.reduce((acc, device) => {
            const r = device.room || device.roomType || 'unknown'
            if (!acc[r]) acc[r] = []
            acc[r].push(device)
            return acc
          }, {})

          // Try to match room with existing devices
          if (room) {
            const normalizedRoom = normalizeRoom(room)
            const matchedRoom = Object.keys(devicesByRoomLocal).find(r =>
              normalizeRoom(r) === normalizedRoom
            ) || room

            // console.log('[App] Room matching:', { original: room, normalized: normalizedRoom, matched: matchedRoom })
            room = matchedRoom
          }

          if (room) {
            const confidence = data.confidence || 0.0
            // Apply confidence threshold - only consider detected if confidence >= threshold
            const isDetected = data.detected && confidence >= confidenceThreshold

            console.log('[App] ✅ Processing detection for room:', room, {
              detected: isDetected,
              confidence: confidence,
              method: data.method
            })

            setDetectionResults(prev => ({
              ...prev,
              [room]: {
                detected: isDetected,
                confidence: confidence,
                timestamp: data.timestamp || new Date().toISOString(),
                device_id: data.device_id,
                method: data.method || 'unknown',
                raw_detected: data.detected // Keep original detection result
              }
            }))
          } else {
            // Still store detection even if room not found
            if (data.room) {
              setDetectionResults(prev => ({
                ...prev,
                [data.room]: {
                  detected: data.detected && (data.confidence || 0) >= confidenceThreshold,
                  confidence: data.confidence || 0.0,
                  timestamp: data.timestamp || new Date().toISOString(),
                  device_id: data.device_id,
                  method: data.method || 'unknown',
                  raw_detected: data.detected
                }
              }))
            }
          }
        } else if (data.type === 'pong') {
          console.log('[App] Received pong from server')
        }
      } catch (e) {
        console.error('[App] Failed to parse WebSocket message:', e, event.data)
      }
    }

    websocket.onerror = (error) => {
      console.error('[App] WebSocket error:', error)
    }

    websocket.onclose = (event) => {
      console.log('[App] WebSocket disconnected, code:', event.code)
    }

    setWs(websocket)

    return () => {
      if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close()
      }
    }
  }, [confidenceThreshold]) // Removed devices from dependency

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/map/devices')
      const data = await response.json()
      // Filter for camera devices
      const cameraDevices = data.devices?.filter(d =>
        d.type === 'camera' || !d.type
      ) || []
      setDevices(cameraDevices)
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    }
  }

  // Group devices by room
  const devicesByRoom = devices.reduce((acc, device) => {
    const room = device.room || device.roomType || 'unknown'
    if (!acc[room]) acc[room] = []
    acc[room].push(device)
    return acc
  }, {})

  // Debug: Log available rooms
  useEffect(() => {
    console.log('[App] Available rooms:', Object.keys(devicesByRoom))
    console.log('[App] Devices by room:', devicesByRoom)
  }, [devicesByRoom])

  return (
    <div className="app">
      <header className="app-header">
        <h1>🦽 Wheelchair Detection Test</h1>
        <p>Real-time detection monitoring</p>
        <div className="confidence-control" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
          <label style={{ color: 'white', fontWeight: '500' }}>
            Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={confidenceThreshold * 100}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value) / 100)}
            style={{ width: '200px', cursor: 'pointer' }}
          />
        </div>
        <div className="tab-switcher">
          <button
            onClick={() => setActiveTab('detection')}
            className={activeTab === 'detection' ? 'active' : ''}
          >
            📹 Detection
          </button>
          <button
            onClick={() => setActiveTab('train')}
            className={activeTab === 'train' ? 'active' : ''}
          >
            🎓 Train Model
          </button>
        </div>
      </header>

      {activeTab === 'train' && <TrainModel />}

      {activeTab === 'detection' && (
        <>

          <div className="devices-grid">
            {Object.entries(devicesByRoom).map(([room, roomDevices]) => (
              <div key={room} className="room-section">
                <h2 className="room-title">
                  {room}
                  {detectionResults[room] ? (
                    <span className={`status-badge ${detectionResults[room].detected ? 'detected' : 'not-detected'}`}>
                      {detectionResults[room].detected ? '🦽 WheelChair Detected' : '❌ NoWheelChair'}
                    </span>
                  ) : (
                    <span className="status-badge" style={{ background: '#e9ecef', color: '#6c757d' }}>
                      ⏳ Waiting for detection...
                    </span>
                  )}
                </h2>
                <div className="devices-list">
                  {roomDevices.map(device => (
                    <DetectionViewer
                      key={device.id || device.deviceId}
                      device={device}
                      detection={detectionResults[room]}
                      confidenceThreshold={confidenceThreshold}
                    />
                  ))}
                </div>
                {detectionResults[room] && (
                  <div className="detection-info">
                    <div><strong>Status:</strong> {detectionResults[room].detected ? '🦽 WheelChair' : '❌ NoWheelChair'}</div>
                    <div><strong>Confidence:</strong> {(detectionResults[room].confidence * 100).toFixed(1)}%</div>
                    <div><strong>Threshold:</strong> {(confidenceThreshold * 100).toFixed(0)}%</div>
                    <div><strong>Method:</strong> {detectionResults[room].method || 'unknown'}</div>
                    {detectionResults[room].raw_detected !== detectionResults[room].detected && (
                      <div style={{ color: '#ff9800', fontSize: '0.85rem' }}>
                        ⚠️ Raw detection: {detectionResults[room].raw_detected ? 'Detected' : 'Not Detected'} (below threshold)
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {Object.keys(devicesByRoom).length === 0 && (
            <div className="no-devices">
              <p>No camera devices found. Make sure cameras are connected.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App

