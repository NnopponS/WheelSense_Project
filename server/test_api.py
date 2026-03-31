import requests
import time

BASE_URL = "http://localhost:8000/api"
DEVICE_ID = "WS_01"

print(f"Testing Start Recording for device {DEVICE_ID}...")
res = requests.post(f"{BASE_URL}/motion-record/start", json={
    "device_id": DEVICE_ID,
    "label": "forward_push"
})
print(res.status_code, res.json())

time.sleep(10)

print(f"Testing Stop Recording for device {DEVICE_ID}...")
res = requests.post(f"{BASE_URL}/motion-record/stop", json={
    "device_id": DEVICE_ID
})
print(res.status_code, res.json())
