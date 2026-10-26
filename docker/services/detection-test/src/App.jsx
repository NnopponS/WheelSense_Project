import React, { useState, useEffect, useRef } from 'react'
import './App.css'

// API helper functions
async function rotateCamera(deviceId, degrees) {
  try {
    const response = await fetch(`/api/nodes/${deviceId}/rotate?degrees=${degrees}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) throw new Error('Failed to rotate camera')
    return await response.json()
  } catch (error) {
    console.error('Failed to rotate camera:', error)
    throw error
  }
}

async function snapshotCamera(room, saveDir) {
  const response = await fetch(`/api/capture/${room}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_dir: saveDir })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Snapshot failed (${response.status})`)
  }
  return await response.json()
}

async function startRecording(room, saveDir, fps) {
  const response = await fetch(`/api/record/${room}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save_dir: saveDir, fps })
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Record start failed (${response.status})`)
  }
  return await response.json()
}

async function stopRecording(room) {
  const response = await fetch(`/api/record/${room}/stop`, { method: 'POST' })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Record stop failed (${response.status})`)
  }
  return await response.json()
}

async function updateThreshold(threshold) {
  try {
    const response = await fetch(`/api/detection/threshold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold })
    })
    if (!response.ok) throw new Error('Failed to update threshold')
    return await response.json()
  } catch (error) {
    console.error('Failed to update threshold:', error)
    // Don't throw - threshold is stored locally
  }
}

// Send detection result to dashboard
async function notifyDashboardDetection(room, detected, confidence, bbox, device_id) {
  try {
    const response = await fetch(`/api/detection/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room,
        detected,
        confidence,
        bbox,
        device_id,
        timestamp: new Date().toISOString()
      })
    })
    if (!response.ok) throw new Error('Failed to notify dashboard')
    return await response.json()
  } catch (error) {
    console.error('Failed to notify dashboard:', error)
    // Don't throw - notification is optional
  }
}

function App() {
  const [devices, setDevices] = useState([])
  const [detectionResults, setDetectionResults] = useState({})
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8) // Match camera-service config (80%)
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true)
  const [lastDetectedRoom, setLastDetectedRoom] = useState(null) // Track last room with wheelchair
  const [saveDir, setSaveDir] = useState('yolo-dataset') // Subfolder under captures root
  const [pickerOpen, setPickerOpen] = useState(false) // Folder-picker modal
  const [recordFps, setRecordFps] = useState(5) // Frames per second to save while recording
  const [recordStatus, setRecordStatus] = useState({}) // {room: {frames, dir}}
  const [notice, setNotice] = useState(null) // Transient save status message
  const devicesRef = useRef(devices)
  const lastDetectedRoomRef = useRef(null) // Ref for use in callbacks
  const lastNotifyTimeRef = useRef(0) // Throttle notifications to every 2 seconds
  const NOTIFY_THROTTLE_MS = 2000 // 2 seconds

  useEffect(() => {
    devicesRef.current = devices
  }, [devices])

  // Keep ref in sync with state
  useEffect(() => {
    lastDetectedRoomRef.current = lastDetectedRoom
  }, [lastDetectedRoom])

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices()
  }, [])

  // Poll recording status so frame counts + REC badges stay fresh
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch('/api/record/status')
        const data = await res.json()
        if (!cancelled) setRecordStatus(data.recording || {})
      } catch (e) { /* status is optional */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const showNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 5000)
  }

  const handleSnapshot = async (room) => {
    try {
      const result = await snapshotCamera(room, saveDir)
      showNotice(`📷 Saved ${result.file}`)
    } catch (e) {
      showNotice(`⚠️ ${e.message}`)
    }
  }

  const handleRecordToggle = async (room) => {
    try {
      if (recordStatus[room]) {
        const result = await stopRecording(room)
        showNotice(`⏹ Stopped ${room}: ${result.frames} frames → captures/${result.dir}`)
      } else {
        const result = await startRecording(room, saveDir, recordFps)
        showNotice(`⏺ Recording ${room} → captures/${result.dir}`)
      }
    } catch (e) {
      showNotice(`⚠️ ${e.message}`)
    }
    // Refresh status immediately after toggle
    try {
      const res = await fetch('/api/record/status')
      const data = await res.json()
      setRecordStatus(data.recording || {})
    } catch (e) { }
  }

  // WebSocket for detection results
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws`
    console.log('[YOLOTest] Connecting to WebSocket:', wsUrl)

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[YOLOTest] ✅ WebSocket connected')
      ws.send(JSON.stringify({ type: 'ping' }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'wheelchair_detection') {
          const room = data.room || 'unknown'
          const currentDevices = devicesRef.current

          // Find device for this room
          const device = currentDevices.find(d =>
            d.room === room ||
            d.roomType?.toLowerCase() === room.toLowerCase()
          )

          const isDetected = data.detected && (data.confidence || 0) >= confidenceThreshold

          // When wheelchair is detected in a new room, clear all other rooms
          // This ensures only ONE room shows green at a time
          setDetectionResults(prev => {
            if (isDetected) {
              // Clear all rooms and set only the current room as detected
              const newState = {}
              Object.keys(prev).forEach(key => {
                newState[key] = {
                  ...prev[key],
                  detected: false,
                  raw_detected: false
                }
              })
              newState[room] = {
                detected: true,
                confidence: data.confidence || 0,
                bbox: data.bbox,
                detections: data.detections || [],
                method: data.method || 'yolo',
                frame_size: data.frame_size,
                timestamp: data.timestamp || new Date().toISOString(),
                device_id: data.device_id,
                raw_detected: data.detected,
                fall_detected: data.fall_detected || false
              }
              console.log(`[YOLOTest] Wheelchair moved to "${room}" - cleared detection from other rooms`)
              return newState
            } else {
              // Just update the current room
              return {
                ...prev,
                [room]: {
                  detected: false,
                  confidence: data.confidence || 0,
                  bbox: data.bbox,
                  detections: data.detections || [],
                  method: data.method || 'yolo',
                  frame_size: data.frame_size,
                  timestamp: data.timestamp || new Date().toISOString(),
                  device_id: data.device_id,
                  raw_detected: data.detected,
                  fall_detected: data.fall_detected || false
                }
              }
            }
          })

          // Notify dashboard when wheelchair is detected
          if (isDetected) {
            const previousRoom = lastDetectedRoomRef.current
            const now = Date.now()
            const timeSinceLastNotify = now - lastNotifyTimeRef.current
            const roomChanged = previousRoom !== room

            // Only send notification if:
            // 1. Room changed (wheelchair moved to different room), OR
            // 2. 2 seconds have passed since last notification (throttle)
            if (roomChanged || timeSinceLastNotify >= NOTIFY_THROTTLE_MS) {
              // Get all known rooms from devices
              const allRooms = new Set(devicesRef.current.map(d => d.room || d.roomType || 'unknown'))

              // Send detected=false for ALL other rooms (not just the previous room)
              allRooms.forEach(otherRoom => {
                if (otherRoom !== room) {
                  notifyDashboardDetection(
                    otherRoom,
                    false, // set to not detected
                    0,
                    null,
                    data.device_id
                  )
                }
              })

              if (roomChanged && previousRoom) {
                console.log(`[YOLOTest] Wheelchair moved from "${previousRoom}" to "${room}"`)
              }
              console.log(`[YOLOTest] Sending detection for "${room}", false for ${allRooms.size - 1} other rooms (${roomChanged ? 'room changed' : 'throttle interval'})`)

              // Send detected=true for the current room
              notifyDashboardDetection(
                room,
                true,
                data.confidence || 0,
                data.bbox,
                data.device_id
              )

              // Update last detected room and notify time
              setLastDetectedRoom(room)
              lastNotifyTimeRef.current = now
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    ws.onerror = (error) => console.error('[YOLOTest] WebSocket error:', error)
    ws.onclose = () => console.log('[YOLOTest] WebSocket disconnected')

    return () => ws.close()
  }, [confidenceThreshold])

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/map/devices')
      const data = await response.json()
      const cameraDevices = data.devices?.filter(d => d.type === 'camera' || !d.type) || []
      // One tile per room: a physical camera may report a raw id (e.g. TSIM_003)
      // alongside the room's canonical MODEL_NODE_* slot — keep the online one.
      const ROOM_ORDER = ['livingroom', 'bedroom', 'kitchen', 'bathroom']
      const byRoom = new Map()
      for (const d of cameraDevices) {
        const room = (d.room || d.roomType || 'unknown').toLowerCase()
        const existing = byRoom.get(room)
        if (!existing || (!existing.online && d.online)) {
          byRoom.set(room, d)
        }
      }
      const deduped = [...byRoom.entries()]
        .sort((a, b) => {
          const ai = ROOM_ORDER.indexOf(a[0])
          const bi = ROOM_ORDER.indexOf(b[0])
          return (ai === -1 ? ROOM_ORDER.length : ai) - (bi === -1 ? ROOM_ORDER.length : bi)
        })
        .map(([, d]) => d)
      setDevices(deduped)
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>🎯 YOLO Detection Test</h1>
          <p>Real-time wheelchair detection with bounding boxes</p>
        </div>

        <div className="header-right">
          <div className="yolo-status">
            <span className="yolo-indicator active">
              <span className="pulse-dot"></span>
              YOLO Active
            </span>
          </div>

          {/* Global Controls */}
          <div className="global-controls">
            <div className="control-group">
              <label>
                Confidence Threshold: <strong>{(confidenceThreshold * 100).toFixed(0)}%</strong>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={confidenceThreshold * 100}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) / 100
                  setConfidenceThreshold(val)
                  updateThreshold(val)
                }}
              />
            </div>

            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={showBoundingBoxes}
                  onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                />
                Show Bounding Boxes
              </label>
            </div>

            <div className="control-group">
              <label>
                Save folder:{' '}
                <button
                  className="folder-btn"
                  onClick={() => setPickerOpen(true)}
                  title="Choose save folder"
                >
                  📁 {saveDir || '(captures root)'}
                </button>
              </label>
              <label>
                fps:{' '}
                <input
                  type="number"
                  className="fps-input"
                  min="1"
                  max="15"
                  value={recordFps}
                  onChange={(e) => setRecordFps(parseInt(e.target.value, 10) || 5)}
                />
              </label>
            </div>
          </div>
          <div className="save-path-hint">
            Files save to <code>{`server\\captures\\${saveDir ? saveDir + '\\' : ''}<room>\\`}</code>
            {' '}(.jpg frames + .mjpg video)
            {notice && <span className="save-notice">{notice}</span>}
          </div>
        </div>
      </header>

      <main className="devices-container">
        {/* Flattened Grid for all devices */}
        <div className="devices-grid">
          {devices.map(device => {
            const room = device.room || device.roomType || 'unknown'
            return (
              <CameraViewer
                key={device.id || device.deviceId}
                device={device}
                detection={detectionResults[room]}
                confidenceThreshold={confidenceThreshold}
                showBoundingBoxes={showBoundingBoxes}
                onRotate={rotateCamera}
                recState={recordStatus[room]}
                onSnapshot={handleSnapshot}
                onRecordToggle={handleRecordToggle}
              />
            )
          })}
        </div>

        {devices.length === 0 && (
          <div className="no-devices">
            <p>📹 No camera devices found. Make sure TsimCam is connected.</p>
          </div>
        )}
      </main>

      {pickerOpen && (
        <FolderPicker
          initialPath={saveDir}
          onChoose={(p) => { setSaveDir(p); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// Folder browser modal — navigates directories under the captures root
function FolderPicker({ initialPath, onChoose, onClose }) {
  const [path, setPath] = useState('')
  const [parent, setParent] = useState(null)
  const [dirs, setDirs] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async (p) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/capture/browse?path=${encodeURIComponent(p)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Browse failed (${res.status})`)
      setPath(data.path)
      setParent(data.parent)
      setDirs(data.dirs)
      setError(null)
    } catch (e) {
      setError(e.message)
      if (p !== '') load('') // Fall back to root on missing folders
      return
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(initialPath || '')
  }, [])

  const enter = (name) => load(path ? `${path}/${name}` : name)
  const up = () => { if (parent !== null) load(parent) }

  const createFolder = async () => {
    const name = newName.trim().replace(/[\\/]/g, '-')
    if (!name) return
    const target = path ? `${path}/${name}` : name
    try {
      const res = await fetch('/api/capture/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Create failed')
      setNewName('')
      load(path)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="picker-title">Choose save folder</div>

        <div className="picker-breadcrumb">
          <span className="picker-crumb" onClick={() => load('')}>captures</span>
          {path && path.split('/').map((seg, i, arr) => (
            <span key={i}>
              {' \\ '}
              <span
                className="picker-crumb"
                onClick={() => load(arr.slice(0, i + 1).join('/'))}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>

        <div className="picker-list">
          {parent !== null && (
            <div className="picker-item picker-up" onClick={up}>⬅ .. (up)</div>
          )}
          {loading && <div className="picker-empty">Loading…</div>}
          {!loading && dirs.length === 0 && parent === null && (
            <div className="picker-empty">No subfolders — create one below</div>
          )}
          {!loading && dirs.length === 0 && parent !== null && (
            <div className="picker-empty">(empty folder)</div>
          )}
          {dirs.map((name) => (
            <div key={name} className="picker-item" onClick={() => enter(name)}>
              📁 {name}
            </div>
          ))}
        </div>

        <div className="picker-new">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            placeholder="New folder name…"
          />
          <button onClick={createFolder}>+ New</button>
        </div>

        {error && <div className="picker-error">⚠️ {error}</div>}

        <div className="picker-actions">
          <button className="picker-choose" onClick={() => onChoose(path)}>
            ✅ Choose this folder
          </button>
          <button className="picker-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Camera viewer component with video stream and YOLO overlay
function CameraViewer({ device, detection, confidenceThreshold, showBoundingBoxes, onRotate, recState, onSnapshot, onRecordToggle }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [streamStatus, setStreamStatus] = useState('connecting')
  const [rotation, setRotation] = useState(device.rotation || 0)
  const [isRotating, setIsRotating] = useState(false)
  const [scale, setScale] = useState(1)
  const containerRef = useRef(null)

  // Sync rotation from device when it changes
  useEffect(() => {
    if (device.rotation !== undefined && device.rotation !== rotation) {
      setRotation(device.rotation)
      console.log(`[CameraViewer] Synced rotation from device: ${device.rotation}°`)
    }
  }, [device.rotation])

  // Debug detections
  useEffect(() => {
    if (detection && detection.detections) {
      if (detection.detections.length > 0) {
        console.log(`[${device.room}] Detections:`, detection.detections)
      }
    }
  }, [detection, device.room])

  const deviceId = device.id || device.deviceId
  const room = device.room || device.roomType || 'unknown'

  // WebSocket video stream
  useEffect(() => {
    if (!deviceId || !room) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/stream/${room}`

    let prevBlobUrl = null
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => setStreamStatus('live')

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
        const blob = new Blob([event.data], { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        prevBlobUrl = url
        setVideoSrc(url)
      } else if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data)
          if (data.rotation !== undefined) setRotation(data.rotation)
        } catch (e) { }
      }
    }

    ws.onerror = () => setStreamStatus('error')
    ws.onclose = () => setStreamStatus('offline')

    return () => {
      ws.close()
      if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl)
    }
  }, [deviceId, room])

  // Draw YOLO bounding boxes on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    const container = containerRef.current
    if (!canvas || !img || !videoSrc || !container) return

    const ctx = canvas.getContext('2d')

    const drawFrame = () => {
      // Get natural dimensions (actual image size)
      const naturalWidth = img.naturalWidth || 640
      const naturalHeight = img.naturalHeight || 480

      // Get container dimensions
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight

      // Calculate scale factor to fill container
      // When rotated 90°/270°, dimensions swap
      let scale = 1
      if (rotation === 90 || rotation === 270) {
        // After rotation: naturalHeight x naturalWidth
        // Need to fill: containerWidth x containerHeight
        const scaleX = containerWidth / naturalHeight
        const scaleY = containerHeight / naturalWidth
        scale = Math.max(scaleX, scaleY)
      } else {
        // Normal: naturalWidth x naturalHeight
        // Need to fill: containerWidth x containerHeight
        const scaleX = containerWidth / naturalWidth
        const scaleY = containerHeight / naturalHeight
        scale = Math.max(scaleX, scaleY)
      }

      // Set canvas internal resolution (keep original for quality)
      canvas.width = naturalWidth
      canvas.height = naturalHeight

      // Clear and draw image at full size
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Update scale state for CSS transform
      setScale(scale)

      // Draw YOLO detections
      // Note: Server rotates frame before detection, so bbox coordinates are in rotated frame space
      // We need to transform them to match the original frame coordinate system
      if (detection && showBoundingBoxes) {
        const detections = detection.detections || []

        detections.forEach((det) => {
          if (det.confidence < confidenceThreshold) return

          let [x, y, w, h] = det.bbox
          const conf = (det.confidence * 100).toFixed(0)

          // Transform bbox from rotated coordinate system to original coordinate system
          // The server rotated the frame before detection, so bbox is in rotated space
          if (rotation === 90) {
            // Server rotated 90° clockwise
            // Rotated frame: H x W (480 x 640)
            // Original frame: W x H (640 x 480)
            // Transform: (x_rot, y_rot) in rotated -> (y_orig, W-x_rot-w_rot) in original
            const tempX = x
            x = y
            y = naturalWidth - tempX - w
            const tempW = w
            w = h
            h = tempW
          } else if (rotation === 180) {
            // Server rotated 180°
            x = naturalWidth - x - w
            y = naturalHeight - y - h
          } else if (rotation === 270) {
            // Server rotated 270° clockwise (90° counter-clockwise)
            // Transform: (x_rot, y_rot) -> (H-y_rot-h_rot, x_rot)
            const tempX = x
            x = naturalHeight - y - h
            y = tempX
            const tempW = w
            w = h
            h = tempW
          }

          // Draw bounding box — red for fall-class detections (red_obj), green otherwise
          const detClass = (det.class || '').toLowerCase()
          const isFallDet = detClass.includes('red') || detClass.includes('fall')
          const boxColor = isFallDet ? '#e53935' : '#00af50'
          ctx.strokeStyle = boxColor
          ctx.lineWidth = 4
          ctx.strokeRect(x, y, w, h)

          // Label background
          const label = `${isFallDet ? 'FALL: ' : ''}${det.class || 'Wheelchair'} ${conf}%`
          ctx.font = 'bold 24px Arial'
          const textMetrics = ctx.measureText(label)
          const textWidth = textMetrics.width

          ctx.fillStyle = boxColor
          ctx.fillRect(x, y > 30 ? y - 30 : y, textWidth + 10, 30)

          // Label text
          ctx.fillStyle = '#ffffff'
          ctx.fillText(label, x + 5, y > 30 ? y - 6 : y + 24)
        })
      }
    }

    img.onload = drawFrame
    if (img.complete && img.naturalWidth > 0) drawFrame()

    // Recalculate scale when container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (img.complete && img.naturalWidth > 0) {
        drawFrame()
      }
    })

    if (container) {
      resizeObserver.observe(container)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [videoSrc, detection, confidenceThreshold, showBoundingBoxes, rotation])

  // Handle rotation - increment by 90 degrees each click
  const handleRotate = async () => {
    setIsRotating(true)
    try {
      // Calculate new rotation: 0 -> 90 -> 180 -> 270 -> 0
      const newRotation = (rotation + 90) % 360
      const result = await onRotate(deviceId, newRotation)
      // Update rotation from API response to ensure sync
      if (result && result.rotation !== undefined) {
        setRotation(result.rotation)
      } else {
        setRotation(newRotation)
      }
      console.log(`[CameraViewer] Rotation updated to ${result?.rotation || newRotation}° for device ${deviceId}`)
    } catch (e) {
      console.error('Rotation failed:', e)
    } finally {
      setIsRotating(false)
    }
  }

  // Check if wheelchair is detected
  const isDetected = detection && detection.raw_detected && detection.confidence >= confidenceThreshold
  const isFall = !!(detection && detection.fall_detected)

  return (
    <div className={`camera-viewer ${isDetected ? 'detected' : ''} ${isFall ? 'fall' : ''}`}>
      <div className="camera-header">
        <div className="camera-info">
          <span className="device-id">{deviceId} ({room})</span>
          {isFall && <span className="fall-badge">⚠ FALL</span>}
          <span className={`status ${streamStatus}`}>
            {streamStatus === 'live' && '●'}
            {streamStatus === 'connecting' && '..'}
            {streamStatus === 'offline' && '○'}
          </span>
        </div>

        {/* Compact Rotation + Capture Controls */}
        <div className="rotation-control">
          <button className="rotate-btn" onClick={handleRotate} disabled={isRotating} title="Rotate +90°">
            ↻ {rotation}°
          </button>
          <button
            className="rotate-btn snap-btn"
            onClick={() => onSnapshot(room)}
            title="Save current frame as JPEG"
          >
            📷
          </button>
          <button
            className={`rotate-btn rec-btn ${recState ? 'recording' : ''}`}
            onClick={() => onRecordToggle(room)}
            title={recState ? 'Stop recording' : 'Record frames for training data'}
          >
            {recState ? `⏹ ${recState.frames}` : '⏺'}
          </button>
        </div>
      </div>

      <div
        className={`video-container ${rotation === 90 ? 'rotated-90' : rotation === 270 ? 'rotated-270' : ''}`}
        ref={containerRef}
      >
        {videoSrc ? (
          <>
            <img ref={imgRef} src={videoSrc} alt="Camera" style={{ display: 'none' }} />
            <canvas
              ref={canvasRef}
              className="video-canvas"
              style={{
                transform: rotation !== 0
                  ? `rotate(${rotation}deg) scale(${scale})`
                  : `scale(${scale})`,
                transition: 'transform 0.3s ease',
                objectFit: 'cover'
              }}
            />
          </>
        ) : (
          <div className="placeholder">
            <span className="status-text">{streamStatus}</span>
          </div>
        )}
      </div>

    </div>
  )
}

export default App
