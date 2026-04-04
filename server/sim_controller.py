#!/usr/bin/env python3
"""
WheelSense Phase 10: Multi-Patient Nursing Home Simulation Engine

This script acts as a test harness. It reads a workspace from the database
extracts all patients, devices, and rooms, and then simulates real-world behavior
by broadcasting MQTT payloads. It inherently tests the full E2E flow (MQTT -> DB -> Timeline/Alerts).

Usage:
  python sim_controller.py [options]

Options:
  --routine      Run the routine simulation infinitely
  --event        Trigger a specific crisis event (e.g., fall)
  --workspace-id Select workspace ID explicitly (fallback: latest workspace)
"""

import sys
import os
import asyncio
import argparse
import random
import json
from datetime import datetime, timezone
import time

import httpx
import paho.mqtt.client as mqtt

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.db.session import AsyncSessionLocal
from app.models import Workspace, Room, Patient, Device, PatientDeviceAssignment

BROKER = "127.0.0.1"
PORT = 1883
API_BASE_URL = "http://127.0.0.1:8000/api"

class SimulationEngine:
    def __init__(self):
        self.workspace = None
        self.rooms = []
        self.patients = []
        self.devices = []
        self.assignments = []
        self.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.loop_task = None
        
        # State tracking for wandering simulation
        self.patient_positions = {} # device_id: current_room_idx

    async def initialize_data(self, workspace_id: int | None = None):
        print("[Init] Loading Workspace from Database...")
        async with AsyncSessionLocal() as session:
            if workspace_id is not None:
                result = await session.execute(
                    select(Workspace).where(Workspace.id == workspace_id)
                )
                ws = result.scalar_one_or_none()
            else:
                result = await session.execute(
                    select(Workspace).order_by(Workspace.id.desc()).limit(1)
                )
                ws = result.scalar_one_or_none()
            if not ws:
                print(
                    "[ERR] Workspace not found. Run seed script first "
                    "or pass --workspace-id."
                )
                sys.exit(1)
            self.workspace = ws
            print(f"[OK] Workspace: {ws.name} (id={ws.id})")

            # Get Rooms
            result = await session.execute(select(Room).where(Room.workspace_id == ws.id))
            self.rooms = result.scalars().all()
            print(f"[OK] Loaded {len(self.rooms)} Rooms.")

            # Get Patient Assignments
            result = await session.execute(
                select(PatientDeviceAssignment)
                .options(joinedload(PatientDeviceAssignment.patient))
                .where(PatientDeviceAssignment.workspace_id == ws.id, PatientDeviceAssignment.is_active == True)
            )
            self.assignments = result.scalars().all()
            print(f"[OK] Loaded {len(self.assignments)} Patient Device Assignments.")

            if not self.rooms or not self.assignments:
                print("[ERR] Not enough data to simulate. Check your database.")
                sys.exit(1)
                
            for assgn in self.assignments:
                self.patient_positions[assgn.device_id] = random.randint(0, len(self.rooms)-1)

    async def train_knn_model(self, api_token: str | None = None):
        """Send synthetic training data to the backend API so room predictions will work.

        If no token is provided, skip training explicitly (protected endpoint).
        """
        if not api_token:
            print("[WARN] Skipping KNN training: no API token provided (--api-token).")
            return
        print("[Init] Uploading synthetic RSSI fingerprints to KNN Engine...")
        training_data = []
        
        # Give each room a designated node name based on its index
        for idx, room in enumerate(self.rooms):
            node_id = f"NODE_ROOM_{idx}"
            # Create a perfect fingerprint for this room
            training_data.append({
                "room_id": room.id,
                "room_name": room.name,
                "rssi_vector": {node_id: -40}  # Very strong signal
            })
            
        payload = {"data": training_data}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    f"{API_BASE_URL}/localization/train",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_token}"},
                )
                if res.status_code in [200, 201]:
                    print("[OK] KNN Model trained successfully.")
                else:
                    print(f"[WARN] KNN Training failed ({res.status_code}): {res.text}")
        except Exception as e:
            print(f"[WARN] Could not reach API ({e}). RSSI room tracking will not work on backend unless API is running.")

    def connect_mqtt(self):
        print(f"[Init] Connecting to MQTT broker at {BROKER}:{PORT}...")
        try:
            self.mqtt_client.connect(BROKER, PORT, 60)
            self.mqtt_client.loop_start()
            print("[OK] MQTT Connected.")
        except Exception as e:
            print(f"[ERR] Failed to connect to MQTT: {e}")
            sys.exit(1)

    def generate_payload(self, device_id: str, room_idx: int, motion_state: str = "idle", is_fall: bool = False):
        """Generates the WheelSense telemetry payload mimicking the C++ firmware."""
        room = self.rooms[room_idx]
        node_id = f"NODE_ROOM_{room_idx}"
        
        ax, ay, az = 0.0, 0.0, 1.0
        velocity = 0.0
        
        if is_fall:
            az = 3.5  # Exceeds 3.0g threshold
            velocity = 0.01  # Near zero velocity
        elif motion_state == "moving":
            ax = random.uniform(-0.5, 0.5)
            ay = random.uniform(-0.5, 0.5)
            az = random.uniform(0.8, 1.2)
            velocity = random.uniform(0.5, 1.5)
            
        # Simulate Heart Rate for 80% of patients
        hr = None
        if random.random() < 0.8:
            hr = {
                "heart_rate_bpm": random.randint(60, 100),
                "rr_interval_ms": random.randint(600, 1000),
                "spo2": random.randint(95, 100),
                "skin_temperature": round(random.uniform(36.1, 37.2), 1),
                "sensor_battery": random.randint(50, 100)
            }

        return {
            "device_id": device_id,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "battery": {
                "percentage": random.randint(80, 100),
                "voltage_v": 4.10,
                "charging": False
            },
            "imu": {
                "ax": ax, "ay": ay, "az": az,
                "gx": 0.0, "gy": 0.0, "gz": 0.0
            },
            "motion": {
                "distance_m": 0.0,
                "velocity_ms": velocity,
                "accel_ms2": 0.0,
                "state": "idle" if is_fall else motion_state
            },
            "rssi": [
                {"node": node_id, "rssi": -45 + random.randint(-5, 5), "mac": f"00:11:22:33:44:{room_idx:02d}"}
            ],
            "polar_hr": hr
        }

    async def run_routine(self):
        """Infinitely simulates patients wandering and emitting vitals."""
        print("\n[START] Starting Routine Simulation... (Press Ctrl+C to stop)")
        try:
            while True:
                for assgn in self.assignments:
                    dev_id = assgn.device_id
                    current_room = self.patient_positions[dev_id]
                    
                    # 10% chance to move to an adjacent room
                    is_moving = False
                    if random.random() < 0.10:
                        new_room = (current_room + random.choice([-1, 1])) % len(self.rooms)
                        self.patient_positions[dev_id] = new_room
                        current_room = new_room
                        is_moving = True
                    
                    motion_state = "moving" if is_moving else "idle"
                    payload = self.generate_payload(dev_id, current_room, motion_state)
                    self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
                    
                    patient_name = f"{assgn.patient.first_name} {assgn.patient.last_name}"
                    hr_payload = payload.get("polar_hr") or {}
                    heart_rate = hr_payload.get("heart_rate_bpm", "N/A")
                    print(
                        f"[{datetime.now().strftime('%H:%M:%S')}] [PATIENT] "
                        f"{patient_name} ({dev_id}) - {self.rooms[current_room].name} - "
                        f"HR: {heart_rate}"
                    )
                    
                await asyncio.sleep(2.0)
        except asyncio.CancelledError:
            print("\n[STOP] Routine Stopped.")
            
    async def trigger_event(self):
        print("\n[WARN] --- INJECT CRISIS EVENT ---")
        for i, assgn in enumerate(self.assignments):
            print(f"  {i+1}. {assgn.patient.first_name} {assgn.patient.last_name} ({assgn.device_id})")
        
        choice = input("Enter patient number to simulate fall (or Q to cancel): ")
        if choice.lower() == 'q':
            return
            
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(self.assignments):
                target = self.assignments[idx]
                room_idx = self.patient_positions[target.device_id]
                
                print(f"\n[ALERT] Injecting FALL for {target.patient.first_name} in {self.rooms[room_idx].name} [ALERT]")
                payload = self.generate_payload(target.device_id, room_idx, is_fall=True)
                self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
                
                time.sleep(0.5)
                # Recover
                payload = self.generate_payload(target.device_id, room_idx, motion_state="idle")
                self.mqtt_client.publish("WheelSense/data", json.dumps(payload))
                print("[OK] Event dispatched. Check backend logs and dashboards.")
            else:
                print("Invalid choice.")
        except ValueError:
            print("Invalid input.")

    async def interactive_menu(self):
        print("\n========================================")
        print(" WheelSense NURSING HOME SIMULATOR      ")
        print("========================================")
        while True:
            print("\nOptions:")
            print("  1. Start Routine Simulation (Wandering & Vitals)")
            print("  2. Inject Crisis Event (Fall)")
            print("  3. Stop Routine Simulation")
            print("  Q. Quit")
            
            choice = input("\nSim Menu > ").strip().lower()
            if choice == 'q':
                if self.loop_task:
                    self.loop_task.cancel()
                break
            elif choice == '1':
                if self.loop_task and not self.loop_task.done():
                    print("Routine is already running.")
                else:
                    self.loop_task = asyncio.create_task(self.run_routine())
                    print("[OK] Routine started in background.")
            elif choice == '2':
                if self.loop_task and not self.loop_task.done():
                    print("Pausing routine...")
                    self.loop_task.cancel()
                    await asyncio.sleep(0.5)
                await self.trigger_event()
            elif choice == '3':
                if self.loop_task and not self.loop_task.done():
                    self.loop_task.cancel()
                    await asyncio.sleep(0.5)
                    print("[OK] Routine stopped.")
                else:
                    print("Routine is not running.")
            else:
                print("Invalid choice")


    def cleanup(self):
        self.mqtt_client.loop_stop()
        self.mqtt_client.disconnect()


def _configure_console_utf8() -> None:
    """Avoid UnicodeEncodeError on Windows when printing Thai room/patient names."""
    out = getattr(sys.stdout, "reconfigure", None)
    if callable(out):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass


async def main():
    _configure_console_utf8()
    parser = argparse.ArgumentParser()
    parser.add_argument("--routine", action="store_true", help="Start routine immediately in headless mode")
    parser.add_argument("--event", type=str, help="Inject fall for specific device_id and exit")
    parser.add_argument("--workspace-id", type=int, default=None, help="Workspace ID to simulate")
    parser.add_argument("--api-token", type=str, default=None, help="JWT bearer token for protected API calls")
    args = parser.parse_args()

    engine = SimulationEngine()
    await engine.initialize_data(args.workspace_id)
    await engine.train_knn_model(args.api_token)
    engine.connect_mqtt()

    try:
        if args.routine:
            await engine.run_routine()
        elif args.event:
            # Find assignment
            target = next((a for a in engine.assignments if a.device_id == args.event), None)
            if target:
                room_idx = engine.patient_positions[target.device_id]
                print(f"[ALERT] Injecting FALL for {args.event} [ALERT]")
                payload = engine.generate_payload(target.device_id, room_idx, is_fall=True)
                engine.mqtt_client.publish("WheelSense/data", json.dumps(payload))
                time.sleep(1)
            else:
                print(f"Device {args.event} not found.")
        else:
            await engine.interactive_menu()
    except KeyboardInterrupt:
        print("\nExiting gracefully...")
    finally:
        engine.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
