import paho.mqtt.client as mqtt
import cv2
import numpy as np
import time
import json
import threading

MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
TOPIC = "WheelSense/camera/+/frame"
# ถ้า Device ID เปลี่ยน ให้เปลี่ยนตรงนี้ให้ตรงกับใน Log
TARGET_CAMERA_ID = "CAM_D77C"
CMD_TOPIC = f"WheelSense/camera/{TARGET_CAMERA_ID}/control"

# Global dictionary for displaying frames on main thread
latest_frames = {}
frames_lock = threading.Lock()

def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Connected with result code {rc}")
    client.subscribe(TOPIC)
    print(f"[MQTT] Listening for frames on {TOPIC}")
    
    # ยิงคำสั่งเริ่มเซ็ตกล้อง (VGA - 5 fps)
    print(f"[MQTT] Sending 'start_stream' to {TARGET_CAMERA_ID}...")
    client.publish(CMD_TOPIC, json.dumps({
        "command": "start_stream", 
        "interval_ms": 200,
        "resolution": "VGA"
    }))

def on_message(client, userdata, msg):
    try:
        # รับภาพ JPEG Byte Array มาแปลงเป็นภาพของ OpenCV
        nparr = np.frombuffer(msg.payload, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            dev_id = msg.topic.split('/')[2]
            with frames_lock:
                latest_frames[dev_id] = img
    except Exception as e:
        print("Error decoding frame:", e)

if __name__ == "__main__":
    print("========================================")
    print(" WheelSense - MQTT Realtime Viewer")
    print("========================================")
    
    # Update to V2 API to remove deprecation warning
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    
    print(f"Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    
    # รัน MQTT รับค่าอยู่เบื้องหลัง
    client.loop_start()
    
    print("\n[INFO] Press 'q' in the video window to quit.")
    
    # Create the window immediately
    window_name = "Live MQTT Stream"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    
    # Create a blank image to show while waiting
    blank_image = np.zeros((480, 640, 3), np.uint8)
    cv2.putText(blank_image, "Waiting for video stream from MQTT...", 
                (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    
    try:
        while True:
            # ดึงภาพล่าสุดมาวนลูปแสดงผล
            with frames_lock:
                devices = list(latest_frames.keys())
                
            if len(devices) == 0:
                cv2.imshow(window_name, blank_image)
            else:
                for dev_id in devices:
                    with frames_lock:
                        frame = latest_frames[dev_id].copy()
                    cv2.imshow(f"Live MQTT Stream : {dev_id}", frame)
                
            # หน่วงเวลาเพื่อรอรับ Event คีย์บอร์ดและให้หน้าต่างแสดงภาพ
            if cv2.waitKey(20) & 0xFF == ord('q'):
                print("Quit requested!")
                break
    except KeyboardInterrupt:
        print("\nInterrupted by terminal.")
        pass
        
    print("Closing stream & sending 'stop_stream' command...")
    client.publish(CMD_TOPIC, json.dumps({"command": "stop_stream"}))
    client.loop_stop()
    client.disconnect()
    cv2.destroyAllWindows()
    print("Done!")
