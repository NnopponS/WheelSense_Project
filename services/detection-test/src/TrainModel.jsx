import React, { useState, useRef, useEffect } from 'react'
import './TrainModel.css'

function TrainModel() {
    const [images, setImages] = useState({
        Wheelchair: [],
        NoWheelChair: []
    })
    const [currentClass, setCurrentClass] = useState('Wheelchair')
    const [isCapturing, setIsCapturing] = useState(false)
    const [devices, setDevices] = useState([])
    const [selectedDevice, setSelectedDevice] = useState(null)
    const [videoSrc, setVideoSrc] = useState(null)
    const imgRef = useRef(null)
    const canvasRef = useRef(null)
    const wsRef = useRef(null)
    const prevSrcRef = useRef('')

    // Fetch available camera devices
    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const response = await fetch('/api/map/devices')
                const data = await response.json()
                // Filter for camera devices
                const cameraDevices = data.devices?.filter(d =>
                    d.type === 'camera' || !d.type
                ) || []
                setDevices(cameraDevices)
                if (cameraDevices.length > 0 && !selectedDevice) {
                    setSelectedDevice(cameraDevices[0])
                }
            } catch (error) {
                console.error('Failed to fetch devices:', error)
            }
        }
        fetchDevices()
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
            if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(prevSrcRef.current)
            }
        }
    }, [])

    const startCamera = async () => {
        if (!selectedDevice) {
            alert('Please select a camera device first')
            return
        }

        const room = selectedDevice.room || selectedDevice.roomType || 'unknown'
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws/stream/${room}`

        console.log(`[TrainModel] Connecting to WebSocket: ${wsUrl}`)

        try {
            const ws = new WebSocket(wsUrl)
            ws.binaryType = 'arraybuffer'

            ws.onopen = () => {
                console.log('[TrainModel] WebSocket connected')
                setIsCapturing(true)
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
                console.error('[TrainModel] WebSocket error:', error)
                alert('Failed to connect to camera stream. Make sure the ESP32-CAM is connected.')
                setIsCapturing(false)
            }

            ws.onclose = () => {
                console.log('[TrainModel] WebSocket disconnected')
                setIsCapturing(false)
            }

            wsRef.current = ws
        } catch (error) {
            console.error('[TrainModel] Failed to connect:', error)
            alert('Failed to connect to camera: ' + error.message)
        }
    }

    const stopCamera = () => {
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(prevSrcRef.current)
        }
        setVideoSrc(null)
        setIsCapturing(false)
    }

    const captureImage = () => {
        if (!imgRef.current || !canvasRef.current || !videoSrc) {
            alert('No video frame available. Wait for camera to load.')
            return
        }

        const canvas = canvasRef.current
        const img = imgRef.current
        const ctx = canvas.getContext('2d')

        // Wait for image to be loaded
        if (!img.complete || !img.naturalWidth) {
            alert('Image not ready. Please try again.')
            return
        }

        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        ctx.drawImage(img, 0, 0)

        const imageData = canvas.toDataURL('image/jpeg', 0.8)

        setImages(prev => ({
            ...prev,
            [currentClass]: [...prev[currentClass], imageData]
        }))

        console.log(`[TrainModel] Captured image for ${currentClass}, total: ${images[currentClass].length + 1}`)
    }

    const removeImage = (classType, index) => {
        setImages(prev => ({
            ...prev,
            [classType]: prev[classType].filter((_, i) => i !== index)
        }))
    }

    const downloadImages = async () => {
        // Check if File System Access API is supported (Chrome/Edge)
        if ('showDirectoryPicker' in window) {
            try {
                const directoryHandle = await window.showDirectoryPicker()

                // Create subdirectories for each class
                const timestamp = new Date().toISOString().split('T')[0]

                for (const [className, imageList] of Object.entries(images)) {
                    if (imageList.length === 0) continue

                    // Create class directory
                    let classDirHandle
                    try {
                        classDirHandle = await directoryHandle.getDirectoryHandle(className, { create: true })
                    } catch (e) {
                        console.error(`Failed to create directory for ${className}:`, e)
                        continue
                    }

                    // Save each image
                    for (let i = 0; i < imageList.length; i++) {
                        const imageData = imageList[i]
                        // Convert data URL to blob
                        const response = await fetch(imageData)
                        const blob = await response.blob()

                        // Create file in directory
                        const fileName = `${className}_${timestamp}_${String(i + 1).padStart(4, '0')}.jpg`
                        const fileHandle = await classDirHandle.getFileHandle(fileName, { create: true })
                        const writable = await fileHandle.createWritable()
                        await writable.write(blob)
                        await writable.close()
                    }
                }

                // Also save JSON metadata
                const metadata = {
                    timestamp,
                    classes: {
                        Wheelchair: images.Wheelchair.length,
                        NoWheelChair: images.NoWheelChair.length
                    },
                    total: images.Wheelchair.length + images.NoWheelChair.length
                }
                const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
                const metadataFile = await directoryHandle.getFileHandle('metadata.json', { create: true })
                const writable = await metadataFile.createWritable()
                await writable.write(jsonBlob)
                await writable.close()

                alert(`Successfully saved ${images.Wheelchair.length + images.NoWheelChair.length} images to selected folder!`)
            } catch (error) {
                if (error.name === 'AbortError') {
                    // User cancelled folder picker
                    return
                }
                console.error('Failed to save to folder:', error)
                // Fallback to download
                downloadImagesFallback()
            }
        } else {
            // Fallback for browsers that don't support File System Access API
            downloadImagesFallback()
        }
    }

    const downloadImagesFallback = () => {
        const allImages = {
            Wheelchair: images.Wheelchair,
            NoWheelChair: images.NoWheelChair
        }

        const json = JSON.stringify(allImages, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`
        a.click()
        URL.revokeObjectURL(url)

        // Also download images as ZIP would be better, but for now just JSON
        alert('Downloaded training data as JSON. For folder selection, please use Chrome or Edge browser.')
    }

    const exportToTeachableMachine = () => {
        const instructions = `
# Instructions to use training data with Teachable Machine

1. Go to https://teachablemachine.withgoogle.com/
2. Click "Get Started" and select "Image Project"
3. Add two classes: "Wheelchair" and "NoWheelChair"
4. Upload images for each class:
   - Wheelchair: ${images.Wheelchair.length} images
   - NoWheelChair: ${images.NoWheelChair.length} images
5. Train the model
6. Export the model as TensorFlow/Keras
7. Place the exported files in: services/camera-service/models/tm-my-image-model/

Current training data:
- Wheelchair: ${images.Wheelchair.length} images
- NoWheelChair: ${images.NoWheelChair.length} images
    `

        alert(instructions)
    }

    return (
        <div className="train-model">
            <div className="train-header">
                <h1>🦽 Train Wheelchair Detection Model</h1>
                <p>Capture images from ESP32-CAM to train Teachable Machine model</p>
            </div>

            <div className="train-controls">
                <div className="class-selector">
                    <label>Class:</label>
                    <select value={currentClass} onChange={(e) => setCurrentClass(e.target.value)}>
                        <option value="Wheelchair">Wheelchair</option>
                        <option value="NoWheelChair">NoWheelChair</option>
                    </select>
                    <span className="image-count">
                        ({images[currentClass].length} images)
                    </span>
                </div>

                <div className="device-selector">
                    <label>Camera:</label>
                    <select
                        value={selectedDevice?.id || selectedDevice?.deviceId || ''}
                        onChange={(e) => {
                            const dev = devices.find(d => (d.id || d.deviceId) === e.target.value)
                            setSelectedDevice(dev)
                        }}
                        disabled={isCapturing}
                    >
                        {devices.length === 0 && (
                            <option value="">No cameras found</option>
                        )}
                        {devices.map(d => (
                            <option key={d.id || d.deviceId} value={d.id || d.deviceId}>
                                {d.id || d.deviceId} ({d.room || d.roomType || 'unknown'})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="camera-controls">
                    {!isCapturing ? (
                        <button
                            onClick={startCamera}
                            className="btn btn-primary"
                            disabled={devices.length === 0}
                        >
                            📷 Start Camera Stream
                        </button>
                    ) : (
                        <>
                            <button onClick={captureImage} className="btn btn-success">
                                📸 Capture Image
                            </button>
                            <button onClick={stopCamera} className="btn btn-danger">
                                ⏹️ Stop Camera
                            </button>
                        </>
                    )}
                </div>

                <div className="export-controls">
                    <button
                        onClick={downloadImages}
                        className="btn btn-secondary"
                        disabled={images.Wheelchair.length === 0 && images.NoWheelChair.length === 0}
                        title={('showDirectoryPicker' in window) ? 'Save images to folder (Chrome/Edge only)' : 'Download as JSON (use Chrome/Edge for folder selection)'}
                    >
                        💾 {('showDirectoryPicker' in window) ? 'Save to Folder' : 'Download Training Data'}
                    </button>
                    <button
                        onClick={exportToTeachableMachine}
                        className="btn btn-primary"
                        disabled={images.Wheelchair.length === 0 && images.NoWheelChair.length === 0}
                    >
                        🚀 Export to Teachable Machine
                    </button>
                </div>
            </div>

            <div className="train-content">
                <div className="camera-preview">
                    <h3>ESP32-CAM Preview {selectedDevice && `(${selectedDevice.room || selectedDevice.id})`}</h3>
                    <div style={{ position: 'relative', width: '100%', maxWidth: '640px', background: '#000' }}>
                        {isCapturing && videoSrc ? (
                            <img
                                ref={imgRef}
                                src={videoSrc}
                                alt="ESP32-CAM Stream"
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '480px',
                                    display: 'block'
                                }}
                            />
                        ) : (
                            <div className="camera-placeholder">
                                {devices.length === 0
                                    ? 'No ESP32-CAM devices found. Connect a camera first.'
                                    : 'Select a camera and click "Start Camera Stream"'
                                }
                            </div>
                        )}
                    </div>
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>

                <div className="training-images">
                    <h3>Captured Images - {currentClass}</h3>
                    <div className="images-grid">
                        {images[currentClass].map((img, index) => (
                            <div key={index} className="image-item">
                                <img src={img} alt={`${currentClass} ${index + 1}`} />
                                <button
                                    onClick={() => removeImage(currentClass, index)}
                                    className="btn-remove"
                                    title="Remove image"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {images[currentClass].length === 0 && (
                            <div className="no-images">
                                No images captured yet. Start camera stream and capture images.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="training-summary">
                <h3>Training Summary</h3>
                <div className="summary-stats">
                    <div className="stat-item">
                        <span className="stat-label">Wheelchair:</span>
                        <span className="stat-value">{images.Wheelchair.length} images</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">NoWheelChair:</span>
                        <span className="stat-value">{images.NoWheelChair.length} images</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Total:</span>
                        <span className="stat-value">
                            {images.Wheelchair.length + images.NoWheelChair.length} images
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TrainModel

