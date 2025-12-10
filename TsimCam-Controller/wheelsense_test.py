#!/usr/bin/env python3
"""
WheelSense MockUp - All-in-One Test Tool
=========================================
รวมทุกฟังก์ชันสำหรับทดสอบระบบ TsimCam Controller

เครื่องใช้ไฟฟ้าตามห้อง:
- Bedroom: light, alarm, aircon
- Kitchen: light, alarm
- Bathroom: light
- Living Room: light, fan, tv, aircon

Usage:
    python wheelsense_test.py video      # ดู video streaming
    python wheelsense_test.py control    # ทดสอบควบคุมเครื่องใช้ไฟฟ้า
    python wheelsense_test.py detection  # ดู wheelchair detection
    python wheelsense_test.py monitor    # monitor ทุกอย่าง (video + status)
    python wheelsense_test.py interactive # โหมด interactive control

Dependencies:
    pip install paho-mqtt opencv-python numpy
"""

import argparse
import base64
import binascii
import json
import queue
import sys
import threading
import time
from datetime import datetime

import cv2
import numpy as np
import paho.mqtt.client as mqtt

# =============================================================================
# MQTT Configuration
# =============================================================================
MQTT_BROKER = "192.168.100.245"
MQTT_PORT = 1883

# Topics
MQTT_TOPIC_VIDEO = "WheelSenseMockup/video"
MQTT_TOPIC_STATUS = "WheelSenseMockup/status"
MQTT_TOPIC_CONTROL = "WheelSenseMockup/control"
MQTT_TOPIC_DETECTION = "WheelSenseMockup/detection"

# Queue sizes
VIDEO_QUEUE_SIZE = 10  # เพิ่ม queue size สำหรับ 25fps
STATS_INTERVAL_SEC = 5

# Display settings
TARGET_FPS = 25
FRAME_INTERVAL_MS = 1000.0 / TARGET_FPS  # 40ms per frame for 25fps

# =============================================================================
# Global Variables
# =============================================================================
video_queue = queue.Queue(maxsize=VIDEO_QUEUE_SIZE)
stop_event = threading.Event()
stats_lock = threading.Lock()
stats = {
    "video_frames": 0,
    "last_status": {},
    "last_detection": {},
    "frames_received": 0,
    "last_device": "",
    "last_room": "",
    "wheelchair_detected": False
}

# Global MQTT client for control functions
control_client = None


# =============================================================================
# Utility Functions
# =============================================================================
def parse_payload(payload):
    """Split payload into metadata JSON and base64 body."""
    if not payload:
        return None, b""
    try:
        meta_raw, data = payload.split(b"\n", 1)
    except ValueError:
        return None, b""
    try:
        metadata = json.loads(meta_raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None, data
    return metadata, data


def get_timestamp():
    """Get current timestamp in ISO format."""
    return time.strftime("%Y-%m-%dT%H:%M:%S+07:00")


# =============================================================================
# Video Streaming Functions
# =============================================================================
def handle_video_message(payload):
    """Handle incoming video frame."""
    if not payload:
        return
    
    meta, encoded = parse_payload(payload)
    if not meta or not encoded:
        # Debug: log if we're receiving messages but can't parse them
        if len(payload) > 0:
            print(f"[Video] Parse failed: payload_len={len(payload)}, has_meta={meta is not None}, has_data={encoded is not None}")
        return

    try:
        frame_bytes = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        print(f"[Video] Base64 error: {exc}")
        return

    frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
    frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
    if frame is None:
        print(f"[Video] JPEG decode failed: {len(frame_bytes)} bytes")
        return

    meta["received_at"] = time.time()

    # Always add to queue, drop oldest if full
    try:
        video_queue.put_nowait((frame, meta))
    except queue.Full:
        # Drop oldest frame to make room
        try:
            video_queue.get_nowait()
        except queue.Empty:
            pass
        try:
            video_queue.put_nowait((frame, meta))
        except queue.Full:
            # Still full, skip this frame
            print("[Video] Queue full, dropping frame")
            return

    with stats_lock:
        stats["video_frames"] += 1
        stats["frames_received"] += 1
        stats["last_device"] = meta.get("device_id", "?")
        stats["last_room"] = meta.get("room", "?")
        stats["wheelchair_detected"] = meta.get("wheelchair_detected", False)


def video_display_worker():
    """Display video frames in a window at 25 fps."""
    window_name = "WheelSense - Video Stream"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 960, 540)

    placeholder = np.zeros((540, 960, 3), dtype=np.uint8)
    placeholder[:] = (25, 25, 25)
    cv2.putText(placeholder, "Waiting for video...", (280, 270),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    cv2.putText(placeholder, "Press 'q' to exit", (340, 320),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2)

    fps_counter = 0
    fps_value = 0
    last_fps_tick = time.time()
    last_frame_time = time.time()
    
    # Frame rate limiting for 25 fps
    frame_interval = FRAME_INTERVAL_MS / 1000.0  # Convert to seconds

    while not stop_event.is_set():
        frame_start_time = time.time()
        
        # Try to get frame (non-blocking)
        try:
            frame, meta = video_queue.get_nowait()
            display = frame.copy()
            
            # Overlay info
            device = meta.get("device_id", "?")
            room = meta.get("room", "?")
            wheelchair = meta.get("wheelchair_detected", False)
            timestamp = meta.get("timestamp", "")
            
            # Calculate latency
            latency_ms = "--"
            if timestamp:
                try:
                    sent_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    latency = (time.time() - sent_dt.timestamp()) * 1000
                    latency_ms = f"{latency:.0f} ms"
                except ValueError:
                    pass

            # Draw overlay
            cv2.putText(display, f"Device: {device}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display, f"Room: {room}", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display, f"Latency: {latency_ms}", (10, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # Wheelchair detection status
            status_color = (0, 255, 0) if wheelchair else (128, 128, 128)
            status_text = "WHEELCHAIR DETECTED" if wheelchair else "No wheelchair"
            cv2.putText(display, status_text, (10, 120),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
            
            fps_counter += 1
        except queue.Empty:
            # No frame available, show placeholder
            display = placeholder.copy()

        # Calculate FPS
        now = time.time()
        if now - last_fps_tick >= 1.0:
            fps_value = fps_counter
            fps_counter = 0
            last_fps_tick = now

        # Draw FPS and stats
        cv2.putText(display, f"FPS: {fps_value}/{TARGET_FPS}", (display.shape[1] - 180, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 200, 255), 2)
        
        with stats_lock:
            total_frames = stats["frames_received"]
            queue_size = video_queue.qsize()
        cv2.putText(display, f"Frames: {total_frames}", (display.shape[1] - 150, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
        cv2.putText(display, f"Queue: {queue_size}/{VIDEO_QUEUE_SIZE}", (display.shape[1] - 150, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)

        cv2.imshow(window_name, display)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            stop_event.set()
            break
        
        # Frame rate limiting - maintain 25 fps display rate
        frame_elapsed = time.time() - frame_start_time
        sleep_time = frame_interval - frame_elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    cv2.destroyAllWindows()


# =============================================================================
# Status Handling Functions
# =============================================================================
def handle_status_message(payload):
    """Handle status message."""
    try:
        message = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        return
    
    with stats_lock:
        stats["last_status"] = message
    
    device = message.get("device_id", "?")
    room = message.get("room", "?")
    wheelchair = message.get("wheelchair_detected", False)
    heap = message.get("heap", "?")
    rssi = message.get("rssi", "?")
    
    # Get appliance status
    appliances = message.get("appliances", {})
    app_status = []
    for name, info in appliances.items():
        if isinstance(info, dict) and info.get("state"):
            app_status.append(name.upper())
    
    app_str = ', '.join(app_status) if app_status else 'None'
    wheelchair_str = '✅' if wheelchair else '❌'
    
    print(f"📊 [{device}/{room}] Wheelchair: {wheelchair_str} | "
          f"Active: {app_str} | Heap: {heap}B | RSSI: {rssi}dBm")


# =============================================================================
# Detection Handling Functions
# =============================================================================
def handle_detection_message(payload):
    """Handle wheelchair detection message."""
    try:
        detection = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        return
    
    with stats_lock:
        stats["last_detection"] = detection
    
    print("\n" + "=" * 60)
    print("🦽 Wheelchair Detection Result")
    print("=" * 60)
    print(f"Device ID:  {detection.get('device_id', 'N/A')}")
    print(f"Room:       {detection.get('room', 'N/A')}")
    print(f"Timestamp:  {detection.get('timestamp', 'N/A')}")
    print(f"Detected:   {detection.get('detected', False)}")
    print(f"Confidence: {detection.get('confidence', 0.0):.2f}")
    print(f"Method:     {detection.get('method', 'N/A')}")
    
    bbox = detection.get('bbox')
    if bbox:
        print(f"Bbox:       x={bbox[0]}, y={bbox[1]}, w={bbox[2]}, h={bbox[3]}")
    
    if detection.get('detected', False):
        print("\n✅ WHEELCHAIR DETECTED IN ROOM!")
    else:
        print("\n❌ No wheelchair detected")
    print("=" * 60)


# =============================================================================
# Control Functions
# =============================================================================
def send_control(client, appliance: str, state: bool, value: int = None,
                 device_id: str = None, room: str = None):
    """Send appliance control command."""
    command = {
        "appliance": appliance,
        "state": state,
        "timestamp": get_timestamp()
    }
    
    if value is not None:
        command["value"] = value
    if device_id:
        command["device_id"] = device_id
    if room:
        command["room"] = room
    
    client.publish(MQTT_TOPIC_CONTROL, json.dumps(command))
    action = "ON" if state else "OFF"
    target = device_id or room or "broadcast"
    value_str = f" (value={value})" if value is not None else ""
    print(f"📤 [{target}] {appliance} -> {action}{value_str}")


def send_command(client, command: str, device_id: str = None, room: str = None):
    """Send special command."""
    msg = {
        "command": command,
        "timestamp": get_timestamp()
    }
    if device_id:
        msg["device_id"] = device_id
    if room:
        msg["room"] = room
    
    client.publish(MQTT_TOPIC_CONTROL, json.dumps(msg))
    print(f"📤 Command: {command}")


# =============================================================================
# Stats Worker
# =============================================================================
def stats_worker():
    """Print stats periodically."""
    while not stop_event.is_set():
        time.sleep(STATS_INTERVAL_SEC)
        with stats_lock:
            video_count = stats["video_frames"]
            queue_size = video_queue.qsize()
            last_status = stats.get("last_status", {})
            
            # Calculate FPS
            fps = video_count / STATS_INTERVAL_SEC
            fps_str = f"{fps:.1f} fps"
            if fps < TARGET_FPS * 0.8:
                fps_str = f"⚠️ {fps_str} (target: {TARGET_FPS})"
            else:
                fps_str = f"✅ {fps_str}"
            
            status_str = ""
            if last_status:
                heap = last_status.get("heap", "?")
                rssi = last_status.get("rssi", "?")
                status_str = f"| heap={heap}B rssi={rssi}dBm"
            
            print(f"[Stats] {fps_str} | frames={video_count}/{STATS_INTERVAL_SEC}s | queue={queue_size}/{VIDEO_QUEUE_SIZE} {status_str}")
            stats["video_frames"] = 0


# =============================================================================
# MQTT Callbacks
# =============================================================================
def create_on_connect(topics):
    """Create on_connect callback for specified topics (supports both API v1 and v2)."""
    def on_connect(client, userdata, flags, rc, properties=None):
        # Support both API v1 (rc only) and v2 (rc, properties)
        if rc == 0:
            print(f"✅ Connected to {MQTT_BROKER}:{MQTT_PORT}")
            for topic in topics:
                client.subscribe(topic, qos=0)  # QoS 0 for fastest delivery
                print(f"📡 Subscribed to: {topic}")
        else:
            print(f"❌ Connection failed with code {rc}")
    return on_connect


def create_on_message(handlers):
    """Create on_message callback with specified handlers (supports both API v1 and v2)."""
    message_count = {"video": 0, "status": 0, "other": 0}
    
    def on_message(client, userdata, msg, properties=None):
        # Support both API v1 and v2
        if msg.topic in handlers:
            # Count messages for debugging
            if "video" in msg.topic.lower():
                message_count["video"] += 1
                if message_count["video"] % 25 == 0:  # Log every 25 frames
                    print(f"[Debug] Received {message_count['video']} video messages")
            elif "status" in msg.topic.lower():
                message_count["status"] += 1
            else:
                message_count["other"] += 1
            
            handlers[msg.topic](msg.payload)
        else:
            print(f"[Debug] Unhandled topic: {msg.topic}")
    
    return on_message


# =============================================================================
# Mode: Video Streaming
# =============================================================================
def run_video_mode():
    """Run video streaming mode."""
    print("=" * 60)
    print("🎥 WheelSense - Video Streaming Mode")
    print("=" * 60)
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"Topic:  {MQTT_TOPIC_VIDEO}")
    print(f"Target: {TARGET_FPS} fps")
    print("Press 'q' in the video window to exit")
    print("=" * 60)
    print("⚠️  หาก FPS ต่ำ ให้ตรวจสอบ:")
    print("   1. Firmware ถูก upload แล้วหรือยัง (pio run -t upload)")
    print("   2. Firmware ตั้งค่า VIDEO_FRAME_INTERVAL_MS = 40 (25 fps)")
    print("   3. WiFi signal strength (RSSI)")
    print("=" * 60)
    
    # Start display thread
    display_thread = threading.Thread(target=video_display_worker, daemon=True)
    display_thread.start()
    
    # Start stats thread
    stats_thread = threading.Thread(target=stats_worker, daemon=True)
    stats_thread.start()
    
    # MQTT setup - Use callback API version 2
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = create_on_connect([MQTT_TOPIC_VIDEO, MQTT_TOPIC_STATUS])
    client.on_message = create_on_message({
        MQTT_TOPIC_VIDEO: handle_video_message,
        MQTT_TOPIC_STATUS: handle_status_message
    })
    
    # Optimize MQTT for high frame rate
    client.max_inflight_messages_set(20)  # Allow more in-flight messages
    client.max_queued_messages_set(0)  # Unlimited queue
    
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()
    
    try:
        while not stop_event.is_set():
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\n⏹️ Stopping...")
        stop_event.set()
    finally:
        client.loop_stop()
        client.disconnect()
        print("✅ Done")


# =============================================================================
# Mode: Detection Monitor
# =============================================================================
def run_detection_mode():
    """Run wheelchair detection monitoring mode."""
    print("=" * 60)
    print("🦽 WheelSense - Detection Monitor Mode")
    print("=" * 60)
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"Topic:  {MQTT_TOPIC_DETECTION}")
    print("Press Ctrl+C to exit")
    print("=" * 60)
    print("\nWaiting for detection messages...\n")
    
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = create_on_connect([MQTT_TOPIC_DETECTION, MQTT_TOPIC_STATUS])
    client.on_message = create_on_message({
        MQTT_TOPIC_DETECTION: handle_detection_message,
        MQTT_TOPIC_STATUS: handle_status_message
    })
    client.max_inflight_messages_set(20)
    client.max_queued_messages_set(0)
    
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_forever()
    except KeyboardInterrupt:
        print("\n⏹️ Stopping...")
        client.disconnect()
        print("✅ Done")


# =============================================================================
# Mode: Control Test
# =============================================================================
def run_control_mode():
    """Run appliance control test mode."""
    print("=" * 60)
    print("🔌 WheelSense - Appliance Control Test")
    print("=" * 60)
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"Topic:  {MQTT_TOPIC_CONTROL}")
    print("=" * 60)
    
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    
    def on_connect(c, userdata, flags, rc, properties=None):
        print(f"✅ Connected (rc={rc})")
        c.subscribe(MQTT_TOPIC_STATUS, qos=0)
        print(f"📡 Listening to: {MQTT_TOPIC_STATUS}")
    
    def on_message(c, userdata, msg, properties=None):
        try:
            data = json.loads(msg.payload.decode())
            device = data.get("device_id", "?")
            room = data.get("room", "?")
            appliance = data.get("appliance", "")
            state = data.get("state", None)
            
            if appliance:
                status = 'ON' if state else 'OFF'
                print(f"📥 [{device}/{room}] {appliance} = {status}")
        except:
            pass
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    print(f"\n🔌 Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    
    time.sleep(2)
    
    print("\n" + "-" * 50)
    print("Running Automated Appliance Tests")
    print("-" * 50)
    
    # Test light control
    print("\n🔦 Testing Light...")
    send_control(client, "light", True)
    time.sleep(2)
    
    send_control(client, "light", True, value=50)  # 50% brightness
    time.sleep(2)
    
    send_control(client, "light", False)
    time.sleep(2)
    
    # Test alarm
    print("\n🚨 Testing Alarm...")
    send_control(client, "alarm", True)
    time.sleep(2)
    
    send_control(client, "alarm", False)
    time.sleep(2)
    
    # Test aircon
    print("\n❄️ Testing AirCon...")
    send_control(client, "aircon", True, value=24)  # 24°C
    time.sleep(2)
    
    send_control(client, "aircon", False)
    time.sleep(2)
    
    # Test fan
    print("\n🌀 Testing Fan...")
    send_control(client, "fan", True, value=2)  # Speed 2
    time.sleep(2)
    
    send_control(client, "fan", False)
    time.sleep(2)
    
    # Test TV
    print("\n📺 Testing TV...")
    send_control(client, "tv", True)
    time.sleep(2)
    
    send_control(client, "tv", False)
    time.sleep(2)
    
    # Turn off all
    print("\n🔌 Turning off all appliances...")
    send_command(client, "turn_off_all")
    time.sleep(2)
    
    # Get status
    print("\n📊 Requesting status...")
    send_command(client, "get_status")
    time.sleep(3)
    
    print("\n" + "=" * 50)
    print("✅ Control Test Complete!")
    print("=" * 50)
    
    client.loop_stop()
    client.disconnect()


# =============================================================================
# Mode: Interactive Control
# =============================================================================
def run_interactive_mode():
    """Run interactive control mode."""
    print("=" * 60)
    print("🎮 WheelSense - Interactive Control Mode")
    print("=" * 60)
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print("=" * 60)
    print("""
Commands:
  light on/off [brightness]  - Control light (brightness: 0-100)
  alarm on/off               - Control alarm
  aircon on/off [temp]       - Control air conditioner (temp: 16-30)
  fan on/off [speed]         - Control fan (speed: 1-3)
  tv on/off                  - Control TV
  all off                    - Turn off all appliances
  status                     - Request device status
  quit / exit                - Exit program

Examples:
  light on 50
  aircon on 24
  fan on 2
  all off
""")
    print("-" * 60)
    
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.max_inflight_messages_set(20)
    client.max_queued_messages_set(0)
    
    def on_connect(c, userdata, flags, rc, properties=None):
        print(f"✅ Connected!")
        c.subscribe(MQTT_TOPIC_STATUS, qos=0)
    
    def on_message(c, userdata, msg, properties=None):
        try:
            data = json.loads(msg.payload.decode())
            device = data.get("device_id", "?")
            room = data.get("room", "?")
            
            appliance = data.get("appliance", "")
            if appliance:
                state = data.get("state", False)
                value = data.get("value", "")
                value_str = f" ({value})" if value else ""
                status = 'ON' if state else 'OFF'
                print(f"\n📥 [{device}/{room}] {appliance} = {status}{value_str}")
            else:
                wheelchair = data.get("wheelchair_detected", False)
                appliances = data.get("appliances", {})
                active = [k for k, v in appliances.items() 
                         if isinstance(v, dict) and v.get("state")]
                
                wc_str = '✅' if wheelchair else '❌'
                active_str = ', '.join(active) if active else 'None'
                print(f"\n📊 [{device}/{room}] Wheelchair: {wc_str} | Active: {active_str}")
            
            print("> ", end="", flush=True)
        except:
            pass
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    print(f"\n🔌 Connecting...")
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    
    time.sleep(1)
    
    while True:
        try:
            cmd = input("> ").strip().lower()
            
            if not cmd:
                continue
            
            parts = cmd.split()
            
            if parts[0] in ['quit', 'exit', 'q']:
                break
            
            elif parts[0] == 'status':
                send_command(client, "get_status")
            
            elif parts[0] == 'all' and len(parts) > 1 and parts[1] == 'off':
                send_command(client, "turn_off_all")
            
            elif parts[0] == 'light':
                if len(parts) < 2:
                    print("Usage: light on/off [brightness]")
                    continue
                state = parts[1] == 'on'
                value = int(parts[2]) if len(parts) > 2 else None
                send_control(client, "light", state, value)
            
            elif parts[0] == 'alarm':
                if len(parts) < 2:
                    print("Usage: alarm on/off")
                    continue
                state = parts[1] == 'on'
                send_control(client, "alarm", state)
            
            elif parts[0] == 'aircon':
                if len(parts) < 2:
                    print("Usage: aircon on/off [temperature]")
                    continue
                state = parts[1] == 'on'
                value = int(parts[2]) if len(parts) > 2 else None
                send_control(client, "aircon", state, value)
            
            elif parts[0] == 'fan':
                if len(parts) < 2:
                    print("Usage: fan on/off [speed]")
                    continue
                state = parts[1] == 'on'
                value = int(parts[2]) if len(parts) > 2 else None
                send_control(client, "fan", state, value)
            
            elif parts[0] == 'tv':
                if len(parts) < 2:
                    print("Usage: tv on/off")
                    continue
                state = parts[1] == 'on'
                send_control(client, "tv", state)
            
            else:
                print(f"Unknown command: {cmd}")
                print("Type 'help' for available commands")
                
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
    
    print("\n⏹️ Stopping...")
    client.loop_stop()
    client.disconnect()
    print("✅ Done")


# =============================================================================
# Mode: Full Monitor
# =============================================================================
def run_monitor_mode():
    """Run full monitoring mode (video + status + detection)."""
    print("=" * 60)
    print("📺 WheelSense - Full Monitor Mode")
    print("=" * 60)
    print(f"Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print("Monitoring: Video, Status, Detection")
    print("Press 'q' in the video window to exit")
    print("=" * 60)
    
    # Start display thread
    display_thread = threading.Thread(target=video_display_worker, daemon=True)
    display_thread.start()
    
    # Start stats thread
    stats_thread = threading.Thread(target=stats_worker, daemon=True)
    stats_thread.start()
    
    # MQTT setup
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = create_on_connect([
        MQTT_TOPIC_VIDEO,
        MQTT_TOPIC_STATUS,
        MQTT_TOPIC_DETECTION
    ])
    client.on_message = create_on_message({
        MQTT_TOPIC_VIDEO: handle_video_message,
        MQTT_TOPIC_STATUS: handle_status_message,
        MQTT_TOPIC_DETECTION: handle_detection_message
    })
    client.max_inflight_messages_set(20)
    client.max_queued_messages_set(0)
    
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()
    
    try:
        while not stop_event.is_set():
            time.sleep(0.2)
    except KeyboardInterrupt:
        print("\n⏹️ Stopping...")
        stop_event.set()
    finally:
        client.loop_stop()
        client.disconnect()
        print("✅ Done")


# =============================================================================
# Main Entry Point
# =============================================================================
def main():
    global MQTT_BROKER, MQTT_PORT
    
    parser = argparse.ArgumentParser(
        description="WheelSense MockUp - All-in-One Test Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Modes:
  video       - Watch video streaming from TsimCam
  detection   - Monitor wheelchair detection results
  control     - Run automated appliance control tests
  interactive - Interactive appliance control (CLI)
  monitor     - Full monitoring (video + status + detection)

Examples:
  python wheelsense_test.py video
  python wheelsense_test.py interactive
  python wheelsense_test.py control
        """
    )
    
    parser.add_argument(
        'mode',
        choices=['video', 'detection', 'control', 'interactive', 'monitor'],
        help='Test mode to run'
    )
    
    parser.add_argument(
        '--broker',
        default=MQTT_BROKER,
        help=f'MQTT broker address (default: {MQTT_BROKER})'
    )
    
    parser.add_argument(
        '--port',
        type=int,
        default=MQTT_PORT,
        help=f'MQTT broker port (default: {MQTT_PORT})'
    )
    
    args = parser.parse_args()
    
    # Update global config
    MQTT_BROKER = args.broker
    MQTT_PORT = args.port
    
    # Run selected mode
    if args.mode == 'video':
        run_video_mode()
    elif args.mode == 'detection':
        run_detection_mode()
    elif args.mode == 'control':
        run_control_mode()
    elif args.mode == 'interactive':
        run_interactive_mode()
    elif args.mode == 'monitor':
        run_monitor_mode()


if __name__ == "__main__":
    main()

