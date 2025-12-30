"""
Xiao Wheel BLE Scanner - Receives gyro + motion data and sends to dashboard
No encryption, reads raw values from BLE advertisement
"""

import asyncio
import struct
import json
import logging
from datetime import datetime
from typing import Set, Optional
from collections import deque

from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from aiohttp import web
import websockets

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
WEBSOCKET_PORT = 8767
HTTP_PORT = 8768
TARGET_WHEEL_ID = 2  # Must match WHEEL_ID in firmware

# Data history for graphs
MAX_HISTORY = 1200

# Motion/Direction mappings
MOTION_NAMES = {0: "STOP", 1: "FORWARD", 2: "BACKWARD"}
DIRECTION_NAMES = {0: "STRAIGHT", 1: "LEFT", 2: "RIGHT"}


class XiaoWheelServer:
    """
    BLE Scanner + WebSocket server for Xiao Wheel sensor data.
    """
    
    def __init__(self):
        # Connected WebSocket clients
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        
        # Data history
        self.data_history: deque = deque(maxlen=MAX_HISTORY)
        
        # Latest data
        self.latest_data: Optional[dict] = None
        self.connected = False
        self.device_name = None
        self.streaming = False
        
        # Statistics
        self.stats = {
            "total_samples": 0,
            "start_time": None,
            "fall_count": 0
        }
        
        # Scanner
        self.scanner = None
        self._running = False
    
    def _parse_manufacturer_data(self, mfr_data: bytes) -> Optional[dict]:
        """
        Parse manufacturer data from BLE advertisement.
        Format (24 bytes):
        [0]     = wheel_id
        [1]     = packet type (0x02 = full data)
        [2-5]   = gx (float)
        [6-9]   = gy (float)
        [10-13] = gz (float)
        [14]    = motion
        [15]    = direction
        [16-17] = distance * 100
        [18-21] = reserved
        [22-23] = checksum
        """
        if len(mfr_data) < 24:
            logger.debug(f"Data too short: {len(mfr_data)} bytes")
            return None
        
        wheel_id = mfr_data[0]
        packet_type = mfr_data[1]
        
        # Check wheel ID
        if wheel_id != TARGET_WHEEL_ID:
            return None
        
        # Check packet type (0x02 = full data)
        if packet_type != 0x02:
            logger.debug(f"Unknown packet type: {packet_type}")
            return None
        
        # Verify checksum
        expected_checksum = sum(mfr_data[:22]) & 0xFFFF
        actual_checksum = mfr_data[22] | (mfr_data[23] << 8)
        
        if expected_checksum != actual_checksum:
            logger.warning(f"Checksum mismatch: expected {expected_checksum}, got {actual_checksum}")
            return None
        
        # Parse float values (little-endian)
        gx = struct.unpack('<f', mfr_data[2:6])[0]
        gy = struct.unpack('<f', mfr_data[6:10])[0]
        gz = struct.unpack('<f', mfr_data[10:14])[0]
        
        # Parse motion/direction
        motion = mfr_data[14]
        direction = mfr_data[15]
        
        # Parse distance (uint16 * 100)
        distance_raw = mfr_data[16] | (mfr_data[17] << 8)
        distance_m = distance_raw / 100.0
        
        return {
            "wheel_id": wheel_id,
            "gyro": {"x": gx, "y": gy, "z": gz},
            "accel": {"x": 0, "y": 0, "z": 0},  # Not sent in current format
            "processed": {
                "motion": MOTION_NAMES.get(motion, "STOP"),
                "direction": DIRECTION_NAMES.get(direction, "STRAIGHT"),
                "distance_m": distance_m,
                "fall_detected": False
            },
            "heart_rate": 0,
            "timestamp": datetime.now().isoformat()
        }
    
    def _detection_callback(self, device: BLEDevice, advertisement_data: AdvertisementData):
        """Called when a BLE device is detected."""
        # Debug: log all devices with names starting with Wheel
        if device.name and device.name.startswith("Wheel"):
            logger.debug(f"Found Wheel device: {device.name} ({device.address})")
        
        # Check for Wheel device by name
        if device.name and device.name.startswith("Wheel_"):
            # Get manufacturer data
            for company_id, mfr_data in advertisement_data.manufacturer_data.items():
                data = self._parse_manufacturer_data(bytes(mfr_data))
                
                if data:
                    self.connected = True
                    self.device_name = device.name
                    self.streaming = True
                    
                    # Update latest data
                    self.latest_data = data
                    self.data_history.append(data)
                    self.stats["total_samples"] += 1
                    
                    # Log every 10 samples
                    if self.stats["total_samples"] % 10 == 0:
                        logger.info(
                            f"[{device.name}] GX:{data['gyro']['x']:.1f} "
                            f"GY:{data['gyro']['y']:.1f} GZ:{data['gyro']['z']:.1f} | "
                            f"{data['processed']['motion']} {data['processed']['direction']} "
                            f"D:{data['processed']['distance_m']:.2f}m"
                        )
                    
                    # Broadcast to clients (async)
                    asyncio.create_task(self._broadcast_data(data))
    
    async def _broadcast_data(self, data: dict):
        """Broadcast sensor data to all connected WebSocket clients."""
        if not self.clients:
            return
        
        # Send raw data (for gyro graphs)
        raw_msg = json.dumps({
            "type": "raw_data",
            "data": {
                "gyro": data["gyro"],
                "accel": data["accel"],
                "timestamp": data["timestamp"]
            }
        })
        await self._broadcast(raw_msg)
        
        # Send processed data (for motion/direction/distance)
        processed_msg = json.dumps({
            "type": "processed_data",
            "data": {
                "processed": data["processed"],
                "heart_rate": data["heart_rate"],
                "stats": self.stats
            }
        })
        await self._broadcast(processed_msg)
    
    async def _broadcast(self, message: str):
        """Broadcast message to all connected clients."""
        if not self.clients:
            return
        
        clients_snapshot = list(self.clients)
        disconnected = set()
        
        for client in clients_snapshot:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
            except Exception as e:
                logger.warning(f"Broadcast error: {e}")
                disconnected.add(client)
        
        self.clients -= disconnected
    
    async def websocket_handler(self, websocket):
        """Handle WebSocket connections."""
        self.clients.add(websocket)
        try:
            client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        except:
            client_id = "unknown"
        
        logger.info(f"Client connected: {client_id} (total: {len(self.clients)})")
        
        try:
            # Send current status
            await websocket.send(json.dumps({
                "type": "status",
                "data": {
                    "connected": self.connected,
                    "streaming": self.streaming,
                    "device_name": self.device_name,
                    "stats": self.stats
                }
            }))
            
            # Send recent history
            if self.data_history:
                history_data = list(self.data_history)[-100:]
                await websocket.send(json.dumps({
                    "type": "history",
                    "data": history_data
                }))
            
            # Keep connection open
            async for message in websocket:
                try:
                    cmd = json.loads(message)
                    await self._handle_command(websocket, cmd)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON"
                    }))
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.warning(f"WebSocket error: {e}")
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected: {client_id} (total: {len(self.clients)})")
    
    async def _handle_command(self, websocket, cmd: dict):
        """Handle incoming WebSocket commands."""
        action = cmd.get("action")
        
        if action == "get_status":
            await websocket.send(json.dumps({
                "type": "status",
                "data": {
                    "connected": self.connected,
                    "streaming": self.streaming,
                    "device_name": self.device_name,
                    "stats": self.stats
                }
            }))
        elif action == "acknowledge_fall":
            await websocket.send(json.dumps({
                "type": "fall_acknowledged"
            }))
        elif action == "reset_distance":
            # Note: This would need firmware support to actually reset
            await websocket.send(json.dumps({
                "type": "distance_reset"
            }))
    
    # === HTTP API ===
    
    async def handle_status(self, request):
        """GET /status"""
        return web.json_response({
            "connected": self.connected,
            "streaming": self.streaming,
            "device_name": self.device_name,
            "stats": self.stats,
            "clients_connected": len(self.clients)
        })
    
    async def handle_latest(self, request):
        """GET /data/latest"""
        if not self.latest_data:
            return web.json_response({"error": "No data available"}, status=404)
        return web.json_response(self.latest_data)
    
    async def handle_history(self, request):
        """GET /data/history"""
        limit = int(request.query.get("limit", 100))
        data = list(self.data_history)[-limit:]
        return web.json_response({
            "count": len(data),
            "data": data
        })
    
    def create_http_app(self) -> web.Application:
        """Create aiohttp application."""
        app = web.Application()
        
        # CORS middleware
        async def cors_middleware(app, handler):
            async def middleware_handler(request):
                if request.method == "OPTIONS":
                    response = web.Response()
                else:
                    response = await handler(request)
                response.headers["Access-Control-Allow-Origin"] = "*"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type"
                return response
            return middleware_handler
        
        app.middlewares.append(cors_middleware)
        
        # Routes
        app.router.add_get("/status", self.handle_status)
        app.router.add_get("/data/latest", self.handle_latest)
        app.router.add_get("/data/history", self.handle_history)
        
        return app
    
    async def start(self):
        """Start BLE scanner and servers."""
        self.stats["start_time"] = datetime.now().isoformat()
        self._running = True
        
        # Start BLE scanner
        self.scanner = BleakScanner(detection_callback=self._detection_callback)
        await self.scanner.start()
        logger.info("BLE Scanner started - looking for Wheel devices...")
        
        # Start WebSocket server
        ws_server = await websockets.serve(
            self.websocket_handler,
            "0.0.0.0",
            WEBSOCKET_PORT
        )
        logger.info(f"WebSocket server started on ws://0.0.0.0:{WEBSOCKET_PORT}")
        
        # Start HTTP server
        app = self.create_http_app()
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", HTTP_PORT)
        await site.start()
        logger.info(f"HTTP server started on http://0.0.0.0:{HTTP_PORT}")
        
        print("\n" + "=" * 60)
        print("🎯 Xiao Wheel Sensor Service")
        print("=" * 60)
        print(f"  WebSocket: ws://localhost:{WEBSOCKET_PORT}/")
        print(f"  REST API:  http://localhost:{HTTP_PORT}/")
        print(f"  Target:    Wheel_{TARGET_WHEEL_ID:02d}")
        print("=" * 60)
        print("\n📡 Scanning for BLE advertisements...")
        print("    Data: Gyro X/Y/Z + Motion + Direction + Distance")
        print("    Waiting for Xiao device...\n")
        
        try:
            await asyncio.Future()  # Run forever
        except asyncio.CancelledError:
            pass
        finally:
            await self.scanner.stop()
            ws_server.close()
            await runner.cleanup()


async def main():
    """Main entry point."""
    server = XiaoWheelServer()
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
