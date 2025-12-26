import React, { useEffect, useRef, useState } from 'react'
import './DetectionViewer.css'

async function rotateCamera(deviceId, degrees = 90) {
  try {
    // API endpoint expects 'degrees' as query parameter
    const response = await fetch(`/api/nodes/${deviceId}/rotate?degrees=${degrees}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    if (!response.ok) {
      let errorMsg = 'Failed to rotate camera'
      try {
        const error = await response.json()
        errorMsg = error.detail || errorMsg
        // Check if device needs to be in config mode
        if (errorMsg.includes('config mode')) {
          errorMsg = 'Camera rotation requires config mode. Please enable config mode first.'
        }
      } catch (e) {
        errorMsg = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMsg)
    }
    const result = await response.json()
    console.log('[DetectionViewer] Camera rotation successful:', result)
    return result
  } catch (error) {
    console.error('[DetectionViewer] Failed to rotate camera:', error)
    throw error
  }
}

async function triggerConfigMode(deviceId) {
  try {
    const response = await fetch(`/api/nodes/${deviceId}/config-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    if (!response.ok) {
      let errorMsg = 'Failed to trigger config mode'
      try {
        const error = await response.json()
        errorMsg = error.detail || errorMsg
      } catch (e) {
        errorMsg = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMsg)
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to trigger config mode:', error)
    throw error
  }
}

function DetectionViewer({ device, detection, confidenceThreshold = 0.5 }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [streamMode, setStreamMode] = useState('loading') // 'loading', 'websocket', 'offline'
  const [isRotating, setIsRotating] = useState(false)
  const deviceId = device.id || device.deviceId
  const room = device.room || device.roomType || 'unknown'

  // Use localStorage key for this specific device
  const rotationStorageKey = `camera_rotation_${deviceId}`

  // Load rotation from localStorage on mount, default to 0
  const [rotationDegrees, setRotationDegrees] = useState(() => {
    const saved = localStorage.getItem(rotationStorageKey)
    return saved ? parseInt(saved, 10) : 0
  })

  // Save rotation to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(rotationStorageKey, rotationDegrees.toString())
    console.log(`[DetectionViewer] Saved rotation ${rotationDegrees}° for device ${deviceId}`)
  }, [rotationDegrees, rotationStorageKey, deviceId])

  const wsRef = useRef(null)
  const prevSrcRef = useRef('')

  const handleRotate = async (degrees) => {
    // Apply rotation immediately for instant UI feedback
    setRotationDegrees((prev) => (prev + degrees) % 360)

    setIsRotating(true)
    try {
      console.log(`[DetectionViewer] Attempting to rotate camera ${deviceId} by ${degrees}°`)

      // Try to rotate on device in background (don't wait for it)
      rotateCamera(deviceId, degrees)
        .then((result) => {
          console.log('[DetectionViewer] Camera rotation successful on device:', result)
          // Rotation already applied to UI, no need to update state again
        })
        .catch((deviceError) => {
          // If device rotation fails (e.g., not in config mode), that's okay
          // We already applied visual rotation, so just log the error
          console.warn('[DetectionViewer] Device rotation failed, using client-side rotation only:', deviceError)
        })
    } catch (error) {
      console.error('[DetectionViewer] Failed to rotate camera:', error)
      // Rotation already applied to UI, so we're good
    } finally {
      setIsRotating(false)
    }
  }

  // Connect to WebSocket video stream
  useEffect(() => {
    if (!deviceId || !room) return

    const connectWebSocket = async () => {
      try {
        // Build WebSocket URL - use relative path for nginx proxy
        // Note: Using /ws/stream/ directly (not /api/ws/stream/) since detection-test has its own nginx
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        // Use room as identifier for stream endpoint (room name or room ID from device)
        const wsUrl = `${protocol}//${window.location.host}/ws/stream/${room}`

        console.log(`[DetectionViewer] Connecting to WebSocket: ${wsUrl} for device ${deviceId}, room ${room}`)
        setStreamMode('loading')

        const ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          console.log(`[DetectionViewer] WebSocket connected for device ${deviceId}`)
          setStreamMode('websocket')
        }

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            // Binary JPEG frame
            const blob = new Blob([event.data], { type: 'image/jpeg' })
            const url = URL.createObjectURL(blob)

            // Revoke old URL to prevent memory leak
            if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
              URL.revokeObjectURL(prevSrcRef.current)
            }

            prevSrcRef.current = url
            setVideoSrc(url)
          } else if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data)
              if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }))
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        ws.onerror = (error) => {
          console.error(`[DetectionViewer] WebSocket error for device ${deviceId}:`, error)
          setStreamMode('offline')
        }

        ws.onclose = () => {
          console.log(`[DetectionViewer] WebSocket disconnected for device ${deviceId}`)
          setStreamMode('offline')
        }

        wsRef.current = ws
      } catch (error) {
        console.error(`[DetectionViewer] Failed to connect WebSocket for device ${deviceId}:`, error)
        setStreamMode('offline')
      }
    }

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(prevSrcRef.current)
      }
    }
  }, [deviceId, room])

  // Draw detection overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !videoSrc) return

    const ctx = canvas.getContext('2d')

    // Wait for image to load
    const drawFrame = () => {
      canvas.width = img.naturalWidth || 640
      canvas.height = img.naturalHeight || 480

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw image (rotation is handled by CSS transform on parent div)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Note: Teachable Machine is image classification, not object detection
      // It cannot provide accurate bounding box coordinates
      // So we don't draw bbox, only show status text
      if (detection) {
        const isDetected = detection.detected && (detection.confidence || 0) >= confidenceThreshold
        const confidence = (detection.confidence || 0) * 100

        // Draw label at top-left corner (not rotated)
        ctx.fillStyle = isDetected ? '#28a745' : '#dc3545'
        ctx.font = 'bold 20px Arial'
        ctx.fillText(
          isDetected ? `🦽 WheelChair: ${confidence.toFixed(0)}%` : `❌ NoWheelChair: ${confidence.toFixed(0)}%`,
          10,
          30
        )

        // Draw threshold indicator if confidence is below threshold
        if (detection.confidence < confidenceThreshold && detection.raw_detected) {
          ctx.fillStyle = '#ff9800'
          ctx.font = '14px Arial'
          ctx.fillText(
            `⚠️ Below threshold (${(confidenceThreshold * 100).toFixed(0)}%)`,
            10,
            55
          )
        }
      }
    }

    // Set up image load handler
    img.onload = drawFrame

    // Trigger draw if image already loaded
    if (img.complete && img.naturalWidth > 0) {
      drawFrame()
    }
  }, [videoSrc, detection, rotationDegrees, confidenceThreshold])

  // Draw placeholder when no video
  useEffect(() => {
    if (streamMode === 'websocket' && videoSrc) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    canvas.width = 640
    canvas.height = 480

    // Draw placeholder background
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#666'
    ctx.font = '20px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${deviceId}`, canvas.width / 2, canvas.height / 2 - 40)
    ctx.fillText(`${room}`, canvas.width / 2, canvas.height / 2 - 10)

    if (streamMode === 'loading') {
      ctx.fillStyle = '#999'
      ctx.font = '16px Arial'
      ctx.fillText('Connecting...', canvas.width / 2, canvas.height / 2 + 30)
    } else if (streamMode === 'offline') {
      ctx.fillStyle = '#dc3545'
      ctx.font = '16px Arial'
      ctx.fillText('No signal', canvas.width / 2, canvas.height / 2 + 30)
    }

    if (detection) {
      const isDetected = detection.detected && (detection.confidence || 0) >= confidenceThreshold
      ctx.fillStyle = isDetected ? '#28a745' : '#dc3545'
      ctx.font = '14px Arial'
      ctx.fillText(
        isDetected ? '🦽 WheelChair Detected' : '❌ NoWheelChair',
        canvas.width / 2,
        canvas.height / 2 + 60
      )
      ctx.fillText(
        `Confidence: ${((detection.confidence || 0) * 100).toFixed(1)}% (Threshold: ${(confidenceThreshold * 100).toFixed(0)}%)`,
        canvas.width / 2,
        canvas.height / 2 + 85
      )
    }
  }, [deviceId, room, streamMode, videoSrc, detection])

  return (
    <div className="detection-viewer">
      <div className="viewer-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h3>{deviceId}</h3>
            <span className="room-label">{room}</span>
            <span style={{
              fontSize: '0.75rem',
              color: streamMode === 'websocket' ? '#28a745' : '#999',
              marginLeft: '0.5rem'
            }}>
              {streamMode === 'websocket' && '● Live'}
              {streamMode === 'loading' && '⏳ Connecting...'}
              {streamMode === 'offline' && '○ Offline'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {rotationDegrees !== 0 && (
              <span style={{
                fontSize: '0.7rem',
                color: '#666',
                marginRight: '0.5rem'
              }}>
                Rotated: {rotationDegrees}°
              </span>
            )}
            <button
              onClick={() => handleRotate(90)}
              disabled={isRotating}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                background: rotationDegrees % 360 === 90 ? '#28a745' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isRotating ? 'not-allowed' : 'pointer',
                opacity: isRotating ? 0.6 : 1
              }}
              title="Rotate 90°"
            >
              ↻ 90°
            </button>
            <button
              onClick={() => handleRotate(180)}
              disabled={isRotating}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                background: rotationDegrees % 360 === 180 ? '#28a745' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isRotating ? 'not-allowed' : 'pointer',
                opacity: isRotating ? 0.6 : 1
              }}
              title="Rotate 180°"
            >
              ↻ 180°
            </button>
            <button
              onClick={() => handleRotate(270)}
              disabled={isRotating}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                background: rotationDegrees % 360 === 270 ? '#28a745' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isRotating ? 'not-allowed' : 'pointer',
                opacity: isRotating ? 0.6 : 1
              }}
              title="Rotate 270°"
            >
              ↻ 270°
            </button>
            <button
              onClick={() => {
                setRotationDegrees(0)
                localStorage.setItem(rotationStorageKey, '0')
              }}
              disabled={isRotating || rotationDegrees === 0}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isRotating || rotationDegrees === 0) ? 'not-allowed' : 'pointer',
                opacity: (isRotating || rotationDegrees === 0) ? 0.6 : 1
              }}
              title="Reset Rotation"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>
      <div style={{
        position: 'relative',
        width: '100%',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px'
      }}>
        {videoSrc ? (
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%'
          }}>
            <img
              ref={imgRef}
              src={videoSrc}
              alt={`Camera ${deviceId}`}
              style={{
                transform: `rotate(${rotationDegrees}deg)`,
                transition: 'transform 0.3s ease',
                // For 90° or 270° rotation, swap width/height to fill container properly
                width: (rotationDegrees % 180 === 90) ? 'auto' : '100%',
                height: (rotationDegrees % 180 === 90) ? '480px' : 'auto',
                maxWidth: (rotationDegrees % 180 === 90) ? 'none' : '100%',
                maxHeight: (rotationDegrees % 180 === 90) ? 'none' : '480px',
                objectFit: 'contain',
                display: 'block'
              }}
            />
            <canvas
              ref={canvasRef}
              className="video-canvas"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) rotate(${rotationDegrees}deg)`,
                transition: 'transform 0.3s ease',
                width: (rotationDegrees % 180 === 90) ? 'auto' : '100%',
                height: (rotationDegrees % 180 === 90) ? '480px' : 'auto',
                maxWidth: (rotationDegrees % 180 === 90) ? 'none' : '100%',
                maxHeight: (rotationDegrees % 180 === 90) ? 'none' : '480px',
                pointerEvents: 'none'
              }}
            />
          </div>
        ) : (
          <div style={{
            position: 'relative',
            width: '100%',
            minHeight: '240px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            background: '#1a1a1a'
          }}>
            {streamMode === 'loading' ? 'Connecting...' : streamMode === 'offline' ? 'No signal' : 'Waiting for stream...'}
          </div>
        )}
      </div>
      {detection ? (
        <div className={`detection-status ${detection.detected && (detection.confidence || 0) >= confidenceThreshold ? 'detected' : 'not-detected'}`}>
          {detection.detected && (detection.confidence || 0) >= confidenceThreshold ? '🦽 WheelChair Detected' : '❌ NoWheelChair'}
          <span className="confidence">
            {(detection.confidence * 100).toFixed(1)}%
          </span>
          {(detection.confidence || 0) < confidenceThreshold && detection.raw_detected && (
            <span style={{ fontSize: '0.8rem', color: '#ff9800', marginLeft: '10px' }}>
              (Below {confidenceThreshold * 100}% threshold)
            </span>
          )}
        </div>
      ) : (
        <div className="detection-status" style={{ background: '#e9ecef', color: '#6c757d' }}>
          ⏳ Waiting for detection...
        </div>
      )}
    </div>
  )
}

export default DetectionViewer

