#!/usr/bin/env python3
"""WheelSense Virtual Simulator
Reads real physical RSSI testing data and streams it into the MQTT broker
to simulate authentic Wheelchair localization runs without hardware.
"""

import os
import time
import json
import csv
import secrets
from datetime import datetime
import paho.mqtt.client as mqtt

BROKER = "127.0.0.1"
PORT = 1883
TOPIC = "WheelSense/data"

# Adjust path assuming script runs from `server` directory
DATA_FILE = os.path.join(os.path.dirname(__file__), "../dataexample/outcome/case3/case3_train.csv")
DEVICE_ID = "SIM_DEVICE_01"

def on_connect(client, userdata, flags, rc):
    print(f"[MQTT] Connected with result code {rc}")

def simulate_episode(client, row):
    """Parses a single row (episode) from the CSV and publishes points at real-time intervals."""
    raw_data = row.get('time_based_rssi', '')
    label = row.get('label', '')
    
    print("\n[bold magenta]--- Playing Real Data Episode ---[/]")
    print(f"Recorded Trajectory sequence: {label}")
    print("Streaming packets to MQTT... (Press Ctrl+C to skip delay)")
    
    parts = raw_data.strip().split(';')
    prev_time = None
    
    for part in parts:
        if not part:
            continue
        # Example format: "2026-03-08 13:33:50.265,-40,-70,-64,-67"
        tokens = part.split(',')
        if len(tokens) < 5:
            continue
        
        ts_str = tokens[0]
        try:
            # Reconstruct datetime
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            dt = datetime.now() # Fallback if parsing fails
            
        # Real-time pacing
        if prev_time:
            delta = (dt - prev_time).total_seconds()
            if 0 < delta < 2.0:
                try:
                    time.sleep(delta)
                except KeyboardInterrupt:
                    print("\n[Skip pacing to fast-forward...]")
                    pass # Allow fast forwarding via Ctrl+C
        prev_time = dt
        
        # Build RSSI List (empty entries mean no reception)
        rssi_list = []
        for i in range(1, 5):
            val = tokens[i]
            if val.strip():
                # Hardcoded "SimRoom_i" matches the auto-seeding logic in CLI 3.1
                rssi_list.append({
                    "node": f"SimRoom_{i}", 
                    "rssi": int(val), 
                    "mac": f"00:SIM:NODE:0{i}"
                })
        
        # Build Mock Telemetry Payload
        payload = {
            "device_id": DEVICE_ID,
            "bat_v": 4.10,
            "bat_pct": 100,
            "charging": False,
            "imu": {
                "ax": 0.0, "ay": 0.0, "az": 1.0,
                "gx": 0.0, "gy": 0.0, "gz": 0.0
            },
            "motion": {
                "distance_m": 0.0,
                "velocity_ms": 0.0,
                "accel_ms2": 0.0,
                "state": "idle"
            },
            "rssi": rssi_list
        }
        
        client.publish(TOPIC, json.dumps(payload))
        short_rssi = {r['node']: r['rssi'] for r in rssi_list}
        print(f" => Published: {short_rssi}")

def main():
    print("========================================")
    print(" WheelSense Data-Driven ML Simulator ")
    print("========================================")
    
    if not os.path.exists(DATA_FILE):
        print(f"\n[Error] Could not find training data at {os.path.abspath(DATA_FILE)}")
        print("Please ensure you are running this from the `server` directory.")
        return
        
    client = mqtt.Client()
    client.on_connect = on_connect
    
    print(f"\nConnecting to local MQTT broker at {BROKER}:{PORT} ...")
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"Failed to connect: {e}\nIs Mosquitto running? (check docker-compose)")
        return
    
    client.loop_start()
    
    # Load Real Experimental Data
    episodes = []
    try:
        with open(DATA_FILE, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                episodes.append(row)
        print(f"[Success] Loaded {len(episodes)} authentic testing episodes from CSV.")
    except Exception as e:
        print(f"Failed to read CSV: {e}")
        return
    
    while True:
        try:
            print("\nOptions:")
            print("  1. Play a Random Episode")
            print("  2. Play 5 Random Episodes sequentially")
            print("  Q. Quit")
            
            choice = input("\nSim Menu > ").strip().lower()
            if choice == 'q':
                break
            elif choice == '1':
                ep = secrets.choice(episodes)
                simulate_episode(client, ep)
            elif choice == '2':
                for i in range(5):
                    print(f"\n--- Sequence {i+1}/5 ---")
                    ep = secrets.choice(episodes)
                    simulate_episode(client, ep)
                    time.sleep(1)
            else:
                print("Invalid choice")
        except KeyboardInterrupt:
            # Let the user Ctrl+C out of the menu gracefully
            print("\nExiting simulator.")
            break
            
    client.loop_stop()
    client.disconnect()
    print("\nDisconnected. Goodbye!")

if __name__ == "__main__":
    main()
