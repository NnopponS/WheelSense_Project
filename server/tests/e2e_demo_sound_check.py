import json, time, threading
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
got = {"control": [], "alerts": []}

def on_msg(c, u, m):
    try:
        p = json.loads(m.payload)
    except Exception:
        p = m.payload.decode(errors="replace")[:200]
    print(f"[{m.topic}] {json.dumps(p)[:220]}", flush=True)
    if "/control" in m.topic:
        got["control"].append(p)
    if "/alerts/" in m.topic:
        got["alerts"].append(p)

sub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="e2e-demo-check")
sub.on_message = on_msg
sub.connect(BROKER, 1883, 30)
sub.subscribe("WheelSense/camera/CAM_E84_0001/control")
sub.subscribe("WheelSense/alerts/5")
sub.loop_start()

pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="e2e-demo-pub")
pub.connect("mosquitto", 1883, 30)
pub.loop_start()
time.sleep(1.5)

telemetry = {
    "device_id": "WS_BELT_02",
    "gateway_payload": {
        "event": "fall_detected", "source": "device_button",
        "peak_g": 3.4, "reason": "impact+stillness", "tilt_deg": 78, "battery_pct": 92,
    },
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
pub.publish("WheelSense/mobile/WS_BELT_02/telemetry", json.dumps(telemetry), qos=1)
print(">> fall_detected sent", flush=True)
time.sleep(6)

ack = {"type": "alert_ack", "device_id": "CAM_E84_0001"}
pub.publish("WheelSense/camera/CAM_E84_0001/event", json.dumps(ack), qos=1)
print(">> alert_ack sent", flush=True)
time.sleep(6)

pub.loop_stop()
sub.loop_stop()
print("control msgs:", len(got["control"]), "| alert msgs:", len(got["alerts"]))
