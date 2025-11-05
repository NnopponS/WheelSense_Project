"""
WheelSense MQTT Collector (Python)
Subscribes to MQTT broker and stores data in SQL database via FastAPI
"""

import paho.mqtt.client as mqtt
import json
import time
import os
import requests
from datetime import datetime
from typing import Dict, Any

# Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'broker.emqx.io')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'WheelSense/data')
MQTT_CLIENT_ID = f'wheelsense-collector-{int(time.time())}'

# FastAPI endpoint
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:8000/api')

# Status code mapping
STATUS_MAP = {
    'OK': 0,
    'IMU_NOT_WORKING': 1,
    'IMU_WRONG_ORIENTATION': 2,
    'SPINNING_TOO_FAST': 3,
    'SPEED_ABNORMAL': 4,
}

def parse_status_code(status_str: str) -> int:
    """Parse status string to status code"""
    if ';' in status_str:
        # Multiple status codes - return first non-OK
        codes = status_str.split(';')
        for code in codes:
            code = code.strip()
            if code in STATUS_MAP and STATUS_MAP[code] != 0:
                return STATUS_MAP[code]
    
    return STATUS_MAP.get(status_str, 0)

def process_new_system_message(data: Dict[str, Any]) -> None:
    """Process New System (M5StickC) message format"""
    try:
        device_id = data.get('device_id')
        wheelchair = data.get('wheelchair', {})
        selected_node = data.get('selected_node', {})
        nearby_nodes = data.get('nearby_nodes', [])
        
        print(f"📨 [New System] Received from {device_id}")
        
        # Parse status
        status_str = wheelchair.get('status', 'OK')
        status_code = parse_status_code(status_str)
        
        # Prepare wheelchair data
        wheelchair_data = {
            'device_id': device_id,
            'timestamp': data.get('timestamp', datetime.now().isoformat()),
            'distance_m': float(wheelchair.get('distance_m', 0)),
            'speed_ms': float(wheelchair.get('speed_ms', 0)),
            'status': status_code,
            'status_str': status_str,
            'current_node': selected_node.get('node_id'),
            'rssi': selected_node.get('rssi'),
            'stale': False
        }
        
        # Send to FastAPI
        response = requests.post(
            f'{API_BASE_URL}/wheelchairs',
            json=wheelchair_data,
            timeout=5
        )
        
        if response.status_code == 200:
            print(f"✅ Stored: {device_id} at Node {wheelchair_data['current_node'] or 'Unknown'} ({wheelchair_data['distance_m']:.2f}m)")
        else:
            print(f"❌ Failed to store wheelchair data: {response.text}")
        
        # Update selected node status
        if selected_node.get('node_id'):
            node_data = {
                'node_id': selected_node['node_id'],
                'name': f"Node {selected_node['node_id']}",
                'last_seen_by': device_id,
                'rssi': selected_node.get('rssi'),
                'status': 'online'
            }
            
            response = requests.post(
                f'{API_BASE_URL}/nodes',
                json=node_data,
                timeout=5
            )
            
            if response.status_code != 200:
                print(f"⚠️  Failed to update node: {response.text}")
        
        # Update nearby nodes
        for nearby in nearby_nodes:
            if nearby.get('node_id'):
                node_data = {
                    'node_id': nearby['node_id'],
                    'name': f"Node {nearby['node_id']}",
                    'last_seen_by': device_id,
                    'rssi': nearby.get('rssi'),
                    'status': 'online'
                }
                
                requests.post(f'{API_BASE_URL}/nodes', json=node_data, timeout=5)
        
    except Exception as e:
        print(f"❌ Error processing new system message: {e}")

def process_old_system_message(data: Dict[str, Any]) -> None:
    """Process Old System message format (backward compatibility)"""
    print(f"📨 [Old System] Received: Node {data.get('node')}, Wheel {data.get('wheel')}")
    print("⚠️  Old system format not fully supported - please use M5StickC (New System)")

def on_connect(client, userdata, flags, rc):
    """Callback when connected to MQTT broker"""
    if rc == 0:
        print(f"✅ Connected to MQTT broker: {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC)
        print(f"📡 Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"❌ Connection failed with code {rc}")

def on_message(client, userdata, msg):
    """Callback when message received"""
    try:
        data = json.loads(msg.payload.decode())
        
        # Detect message format
        if 'device_id' in data and 'wheelchair' in data:
            # New System (M5StickC)
            process_new_system_message(data)
        elif 'node' in data and 'wheel' in data:
            # Old System
            process_old_system_message(data)
        else:
            print(f"⚠️  Unknown message format: {data}")
            
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
    except Exception as e:
        print(f"❌ Error processing message: {e}")

def on_disconnect(client, userdata, rc):
    """Callback when disconnected from MQTT broker"""
    if rc != 0:
        print(f"⚠️  Unexpected disconnection. Reconnecting...")

def main():
    """Main function"""
    print("=" * 50)
    print("  WheelSense MQTT Collector (Python)")
    print("  Version: 2.0.0")
    print("=" * 50)
    print(f"📡 MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print(f"📋 MQTT Topic: {MQTT_TOPIC}")
    print(f"🌐 API Endpoint: {API_BASE_URL}")
    print("=" * 50)
    
    # Test API connection
    try:
        response = requests.get(f'{API_BASE_URL}/health', timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ API Server: {health['status']}")
            print(f"📊 Wheelchairs: {health['wheelchairs']}")
            print(f"📡 Online Nodes: {health['online_nodes']}")
        else:
            print(f"⚠️  API Server returned: {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot connect to API Server: {e}")
        print("⚠️  Make sure FastAPI server is running!")
        return
    
    print("=" * 50)
    
    # Create MQTT client
    client = mqtt.Client(client_id=MQTT_CLIENT_ID)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect
    
    # Connect to broker
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        print(f"🔄 Connecting to {MQTT_BROKER}...")
        
        # Blocking call that processes network traffic and dispatches callbacks
        client.loop_forever()
        
    except KeyboardInterrupt:
        print("\n⏹️  Shutting down...")
        client.disconnect()
        print("✅ Disconnected from MQTT broker")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()






