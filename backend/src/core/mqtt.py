"""
WheelSense v2.0 MQTT Collector
Subscribes to MQTT and processes M5StickCPlus2 data using RSSI fingerprinting
"""

import asyncio
import json
from datetime import datetime
from typing import Optional, Dict, Any, Callable
import aiomqtt

from .config import settings
from .database import db


class MQTTCollector:
    """MQTT Client for collecting wheelchair data"""
    
    def __init__(self):
        self.client: Optional[aiomqtt.Client] = None
        self.connected = False
        self.on_data_callback: Optional[Callable] = None
        self._task: Optional[asyncio.Task] = None
    
    async def connect(self):
        """Connect to MQTT broker"""
        print(f"📡 Connecting to MQTT broker: {settings.MQTT_BROKER}:{settings.MQTT_PORT}")
        try:
            self.client = aiomqtt.Client(
                hostname=settings.MQTT_BROKER,
                port=settings.MQTT_PORT,
                username=settings.MQTT_USER,
                password=settings.MQTT_PASSWORD,
            )
            await self.client.__aenter__()
            self.connected = True
            print(f"✅ Connected to MQTT broker")
            
            # Subscribe to topic
            await self.client.subscribe(settings.MQTT_TOPIC)
            print(f"📋 Subscribed to topic: {settings.MQTT_TOPIC}")
            
            return True
        except Exception as e:
            print(f"❌ MQTT connection failed: {e}")
            self.connected = False
            return False
    
    async def disconnect(self):
        """Disconnect from MQTT broker"""
        if self.client:
            try:
                await self.client.__aexit__(None, None, None)
            except:
                pass
            self.connected = False
            print("⏹️ Disconnected from MQTT broker")

    async def publish(self, topic: str, payload: str):
        """Publish message to MQTT (for config push to devices)"""
        if not self.connected or not self.client:
            print("⚠️ MQTT not connected, cannot publish config")
            return
        try:
            await self.client.publish(topic, payload)
            print(f"📤 Published to {topic}")
        except Exception as e:
            print(f"❌ MQTT publish failed: {e}")
    
    async def start_listening(self):
        """Start listening for MQTT messages"""
        self._task = asyncio.create_task(self._listen_loop())
    
    async def stop_listening(self):
        """Stop listening for MQTT messages"""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
    
    async def _listen_loop(self):
        """Main listening loop with reconnection"""
        while True:
            try:
                if not self.connected:
                    await self.connect()
                    if not self.connected:
                        await asyncio.sleep(5)
                        continue
                
                async for message in self.client.messages:
                    try:
                        await self._process_message(message)
                    except Exception as e:
                        print(f"❌ Error processing message: {e}")
                        
            except aiomqtt.MqttError as e:
                print(f"⚠️ MQTT error: {e}, reconnecting in 5s...")
                self.connected = False
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ Unexpected error: {e}")
                await asyncio.sleep(5)
    
    async def _process_message(self, message):
        """Process incoming MQTT message"""
        try:
            payload = message.payload.decode()
            data = json.loads(payload)
            
            # Check message format (M5StickCPlus2 New System format)
            if "device_id" in data and "wheelchair" in data:
                await self._process_new_system_message(data)
            else:
                print(f"⚠️ Unknown message format")
                
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error: {e}")
    
    async def _process_new_system_message(self, data: Dict[str, Any]):
        """Process M5StickCPlus2 message format"""
        device_id = data.get("device_id", "")
        timestamp = data.get("timestamp", datetime.now().isoformat())
        wheelchair_data = data.get("wheelchair", {})
        selected_node = data.get("selected_node", {})
        nearby_nodes = data.get("nearby_nodes", [])
        
        print(f"📨 Received from {device_id}")
        
        # Parse status
        status_str = wheelchair_data.get("status", "OK")
        
        # Get wheelchair by MAC address
        wheelchair = await db.fetch_one(
            "SELECT * FROM wheelchairs WHERE mac_address = $1",
            (device_id,)
        )
        
        if not wheelchair:
            # Auto-create wheelchair if not exists
            wheelchair_id = f"WC-{device_id.replace('WheelSense_', '').replace('M5_', '')}"
            await db.execute(
                """INSERT INTO wheelchairs (id, name, mac_address, status, last_seen)
                   VALUES ($1, $2, $3, 'active', NOW())""",
                (wheelchair_id, f"Wheelchair {wheelchair_id}", device_id)
            )
            wheelchair = await db.fetch_one(
                "SELECT * FROM wheelchairs WHERE id = $1", (wheelchair_id,)
            )
            print(f"🆕 Auto-created wheelchair: {wheelchair_id}")
        
        wheelchair_id = wheelchair["id"]
        
        # Determine current room from selected node
        current_room_id = None
        current_node_id = None
        node_rssi = None
        
        if selected_node and "node_id" in selected_node:
            node_id_num = selected_node["node_id"]
            node_rssi = selected_node.get("rssi")
            
            # Find node by node_id (could be number or string)
            node_id_formatted = f"NODE-{node_id_num:02d}" if isinstance(node_id_num, int) else f"NODE-{node_id_num}"
            node_id_alt = f"NODE-0{node_id_num}" if isinstance(node_id_num, int) and node_id_num < 10 else f"NODE-{node_id_num}"
            
            node = await db.fetch_one(
                "SELECT * FROM nodes WHERE id = $1 OR id = $2",
                (node_id_formatted, node_id_alt)
            )
            
            if node:
                current_node_id = node["id"]
                current_room_id = node.get("room_id")
                
                # Update node status
                await db.execute(
                    """UPDATE nodes SET 
                       status = 'online', 
                       last_seen_by = $1,
                       rssi = $2,
                       updated_at = NOW()
                       WHERE id = $3""",
                    (device_id, node_rssi, current_node_id)
                )
        
        # Check if room changed
        old_room_id = wheelchair.get("current_room_id")
        if current_room_id and old_room_id != current_room_id:
            # Log room change event
            await self._log_room_change(
                wheelchair_id=wheelchair_id,
                patient_id=wheelchair.get("patient_id"),
                from_room_id=old_room_id,
                to_room_id=current_room_id
            )
        
        # Update wheelchair
        await db.execute(
            """UPDATE wheelchairs SET
               status = 'active',
               current_room_id = $1,
               current_node_id = $2,
               distance_m = $3,
               speed_ms = $4,
               status_message = $5,
               rssi = $6,
               stale = 0,
               last_seen = NOW(),
               updated_at = NOW()
               WHERE id = $7""",
            (
                current_room_id,
                current_node_id,
                wheelchair_data.get("distance_m", 0),
                wheelchair_data.get("speed_ms", 0),
                status_str,
                node_rssi,
                wheelchair_id
            )
        )
        
        # ─── Immediate safety check: speed ───
        speed_val = wheelchair_data.get("speed_ms", 0)
        if speed_val > 0:
            try:
                from .safety_monitor import check_speed_alert
                await check_speed_alert(
                    wheelchair_id=wheelchair_id,
                    patient_id=wheelchair.get("patient_id"),
                    speed_ms=speed_val,
                )
            except Exception as safety_err:
                print(f"⚠️ Safety check error: {safety_err}")
        
        # Insert into history
        await db.execute(
            """INSERT INTO wheelchair_history 
               (wheelchair_id, timestamp, room_id, node_id, distance_m, speed_ms, status, rssi)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            (
                wheelchair_id,
                timestamp,
                current_room_id,
                current_node_id,
                wheelchair_data.get("distance_m", 0),
                wheelchair_data.get("speed_ms", 0),
                status_str,
                node_rssi
            )
        )
        
        # Update nearby nodes status
        for nearby in nearby_nodes:
            if "node_id" in nearby:
                nearby_id = f"NODE-{nearby['node_id']:02d}" if isinstance(nearby['node_id'], int) else f"NODE-{nearby['node_id']}"
                nearby_id_like = f"%{nearby['node_id']}"
                await db.execute(
                    """UPDATE nodes SET 
                       status = 'online',
                       rssi = $1,
                       updated_at = NOW()
                       WHERE id = $2 OR id LIKE $3""",
                    (nearby.get("rssi"), nearby_id, nearby_id_like)
                )
        
        room_name = "Unknown"
        if current_room_id:
            room = await db.fetch_one("SELECT name FROM rooms WHERE id = $1", (current_room_id,))
            if room:
                room_name = room["name"]
        
        print(f"✅ Updated: {wheelchair_id} @ {room_name} (Node: {current_node_id}, RSSI: {node_rssi})")
        
        # Callback if set
        if self.on_data_callback:
            await self.on_data_callback({
                "wheelchair_id": wheelchair_id,
                "room_id": current_room_id,
                "node_id": current_node_id,
                "rssi": node_rssi,
                "distance_m": wheelchair_data.get("distance_m", 0),
                "speed_ms": wheelchair_data.get("speed_ms", 0),
                "status": status_str
            })
    
    async def _log_room_change(self, wheelchair_id: str, patient_id: str, from_room_id: str, to_room_id: str):
        """Log room change event to timeline"""
        await db.execute(
            """INSERT INTO timeline_events 
               (wheelchair_id, patient_id, event_type, from_room_id, to_room_id, description)
               VALUES ($1, $2, 'location_change', $3, $4, $5)""",
            (
                wheelchair_id,
                patient_id,
                from_room_id,
                to_room_id,
                f"Wheelchair moved from {from_room_id or 'unknown'} to {to_room_id}"
            )
        )
        print(f"📍 Room change: {wheelchair_id} moved to {to_room_id}")


# Global MQTT collector instance
mqtt_collector = MQTTCollector()
