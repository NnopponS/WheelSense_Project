import sys
import json
import time
from datetime import datetime
import paho.mqtt.client as mqtt

try:
    import msvcrt
except ImportError:
    print("This simulation controller requires Windows (msvcrt) for keyboard input.")
    sys.exit(1)

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
TOPIC_DATA = "WheelSense/data"

class VirtualWheelchair:
    def __init__(self, device_id):
        self.device_id = device_id
        self.seq = 0
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.running = True
        
        # Simulated Physical State
        self.ax = self.ay = self.az = 0.0
        self.distance = 0.0
        self.velocity = 0.0
        self.direction = "STOP"
        
        # Mqtt Commands
        self.is_recording = False
        self.action_label = ""
        self.session_id = ""

    def on_connect(self, client, userdata, flags, rc):
        print(f"\n[+] {self.device_id} connected to local MQTT Broker.")
        self.client.subscribe(f"WheelSense/{self.device_id}/control")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            cmd = payload.get("cmd")
            if cmd == "start_record":
                self.is_recording = True
                self.action_label = payload.get("label", "unknown")
                self.session_id = payload.get("session_id", "sim-session")
                print(f"\n[API] Backend triggered RECORD START! Label={self.action_label}")
            elif cmd == "stop_record":
                self.is_recording = False
                print("\n[API] Backend triggered RECORD STOP.")
        except Exception:
            pass

    def start(self):
        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
            
            print("="*60)
            print(f" Controller Ready: {self.device_id}")
            print("="*60)
            print(" W : Move Forward    (simulates positive accel)")
            print(" S : Move Backward   (simulates negative accel)")
            print(" A : Turn Left")
            print(" D : Turn Right")
            print(" SPACE : Stop")
            print(" Q : Quit Simulation")
            print("="*60)

            self._input_loop()
        except KeyboardInterrupt:
            self.running = False
        finally:
            self.client.loop_stop()
            self.client.disconnect()
            print("\nSimulation stopped.")
            
    def publish_data(self):
        self.seq += 1
        payload = {
            "device_id": self.device_id,
            "firmware": "sim_controller_v1",
            "seq": self.seq,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "imu": {
                "ax": self.ax, "ay": self.ay, "az": 0.98,
                "gx": 0.0, "gy": 0.0, "gz": 0.0
            },
            "motion": {
                "distance_m": self.distance,
                "velocity_ms": self.velocity,
                "accel_ms2": self.ay,
                "direction": self.direction
            },
            "battery": {
                "percentage": 100,
                "voltage_v": 4.20,
                "charging": False
            },
            "rssi": [
                # Simulated dummy RSSI values to keep structure valid
                {"node": "WSN_001", "rssi": -65, "mac": "aa:bb:cc"}
            ],
            "is_recording": self.is_recording,
            "action_label": self.action_label,
            "session_id": self.session_id
        }
        self.client.publish(TOPIC_DATA, json.dumps(payload))
        
        # Accumulate distance simply
        if self.direction != "STOP":
            self.distance += abs(self.velocity * 0.1)
            
        # Clear transient IMU peaks
        self.ax = self.ay = 0.0

    def _input_loop(self):
        last_pub = time.time()
        while self.running:
            if msvcrt.kbhit():
                key = msvcrt.getch().decode('utf-8', 'ignore').lower()
                if key == 'w':
                    self.direction = "FORWARD"
                    self.velocity = 1.0
                    self.ay = 1.0
                    print("\r[Status] Moving Forward...  ", end="")
                elif key == 's':
                    self.direction = "BACKWARD"
                    self.velocity = -0.5
                    self.ay = -1.0
                    print("\r[Status] Moving Backward... ", end="")
                elif key == 'a':
                    self.direction = "TURN_LEFT"
                    self.ax = -0.5
                    print("\r[Status] Turning Left...    ", end="")
                elif key == 'd':
                    self.direction = "TURN_RIGHT"
                    self.ax = 0.5
                    print("\r[Status] Turning Right...   ", end="")
                elif key == ' ':
                    self.velocity = 0.0
                    self.direction = "STOP"
                    print("\r[Status] STOPPED.           ", end="")
                elif key == 'q':
                    self.running = False
                    break
            
            # Pub loop ~10Hz
            if time.time() - last_pub > 0.1:
                self.publish_data()
                last_pub = time.time()
            time.sleep(0.01)

if __name__ == '__main__':
    device_id = sys.argv[1] if len(sys.argv) > 1 else "sim-wheelchair-1"
    bot = VirtualWheelchair(device_id)
    bot.start()
