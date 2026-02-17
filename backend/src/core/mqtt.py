"""
WheelSense v2.0 MQTT Collector
Subscribes to MQTT and processes M5StickCPlus2/TsimCam data.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Callable
import ipaddress
from urllib.parse import urlparse

import aiomqtt

from .config import settings
from .database import db
from .identity import id_candidates as _id_candidates, normalize_device_id as _normalize_device_id


def _parse_mqtt_timestamp(value: Any) -> datetime:
    """Accept ISO-8601 strings, epoch seconds, or fallback to now (UTC)."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (ValueError, OSError):
            return datetime.now(timezone.utc)

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return datetime.now(timezone.utc)

        try:
            epoch_val = float(raw)
            if epoch_val > 0:
                return datetime.fromtimestamp(epoch_val, tz=timezone.utc)
        except ValueError:
            pass

        try:
            iso_raw = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
            parsed = datetime.fromisoformat(iso_raw)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return datetime.now(timezone.utc)

    return datetime.now(timezone.utc)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_local_only_host(value: str) -> bool:
    lowered = (value or "").strip().lower()
    return lowered in {"", "localhost", "127.0.0.1", "0.0.0.0", "backend", "api"}


def _extract_host_port_from_url(raw_url: str) -> tuple[str, Optional[int], str]:
    value = (raw_url or "").strip()
    if not value:
        return "", None, "http"

    parsed = urlparse(value if "://" in value else f"http://{value}")
    host = (parsed.hostname or "").strip()
    port = parsed.port
    scheme = (parsed.scheme or "http").strip().lower()
    return host, port, scheme


def _same_private_subnet(ip_a: str, ip_b: str) -> Optional[bool]:
    try:
        a = ipaddress.ip_address(ip_a)
        b = ipaddress.ip_address(ip_b)
    except ValueError:
        return None

    if not isinstance(a, ipaddress.IPv4Address) or not isinstance(b, ipaddress.IPv4Address):
        return None
    if not (a.is_private and b.is_private):
        return False

    return str(a).split(".")[:3] == str(b).split(".")[:3]


class MQTTCollector:
    """MQTT client for telemetry collection and device control."""

    def __init__(self):
        self.client: Optional[aiomqtt.Client] = None
        self.connected = False
        self.on_data_callback: Optional[Callable] = None
        self._task: Optional[asyncio.Task] = None
        self._history_cache: Dict[str, Dict[str, Any]] = {}
        self._metrics: Dict[str, Any] = {
            "connect_attempts": 0,
            "connect_successes": 0,
            "connect_failures": 0,
            "reconnect_events": 0,
            "publish_attempts": 0,
            "publish_successes": 0,
            "publish_failures": 0,
            "messages_received": 0,
            "messages_processed": 0,
            "messages_failed": 0,
            "config_requests": 0,
            "config_replies": 0,
            "config_sync_failures": 0,
            "history_inserts": 0,
            "history_skipped": 0,
            "last_error": "",
            "last_connected_at": None,
            "last_disconnected_at": None,
            "last_message_at": None,
        }

    def metrics_snapshot(self) -> Dict[str, Any]:
        """Return MQTT runtime counters for diagnostics/health."""
        snapshot = dict(self._metrics)
        snapshot["connected"] = self.connected
        snapshot["topic"] = settings.MQTT_TOPIC
        snapshot["broker"] = settings.MQTT_BROKER
        snapshot["port"] = settings.MQTT_PORT
        return snapshot

    def _set_error(self, message: str):
        self._metrics["last_error"] = str(message or "")

    async def _load_last_history_sample(self, wheelchair_id: str) -> Optional[Dict[str, Any]]:
        row = await db.fetch_one(
            """
            SELECT timestamp, room_id, node_id, status, distance_m, speed_ms, rssi
            FROM wheelchair_history
            WHERE wheelchair_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
            """,
            (wheelchair_id,),
        )
        if not row:
            return None

        ts = row.get("timestamp")
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            else:
                ts = ts.astimezone(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        return {
            "timestamp": ts,
            "room_id": row.get("room_id"),
            "node_id": row.get("node_id"),
            "status": row.get("status"),
            "distance_m": _to_float(row.get("distance_m"), 0.0),
            "speed_ms": _to_float(row.get("speed_ms"), 0.0),
            "rssi": row.get("rssi"),
        }

    async def _should_store_history_sample(
        self,
        wheelchair_id: str,
        timestamp: datetime,
        room_id: Optional[str],
        node_id: Optional[str],
        status: str,
        distance_m: float,
        speed_ms: float,
    ) -> bool:
        """Store on state-change, otherwise sampled interval."""
        previous = self._history_cache.get(wheelchair_id)
        if previous is None:
            previous = await self._load_last_history_sample(wheelchair_id)
            if previous:
                self._history_cache[wheelchair_id] = previous

        if previous is None:
            return True

        previous_ts = previous.get("timestamp")
        if not isinstance(previous_ts, datetime):
            return True

        elapsed_seconds = (timestamp - previous_ts).total_seconds()
        movement_now = speed_ms > 0.05
        movement_prev = _to_float(previous.get("speed_ms"), 0.0) > 0.05
        distance_delta = abs(distance_m - _to_float(previous.get("distance_m"), 0.0))

        state_changed = any(
            [
                previous.get("room_id") != room_id,
                previous.get("node_id") != node_id,
                str(previous.get("status") or "") != str(status or ""),
                movement_now != movement_prev,
            ]
        )
        significant_distance = distance_delta >= 0.75
        interval_elapsed = elapsed_seconds >= max(1, settings.HISTORY_SAMPLE_INTERVAL_SECONDS)

        return state_changed or significant_distance or interval_elapsed

    def _update_history_cache(
        self,
        wheelchair_id: str,
        timestamp: datetime,
        room_id: Optional[str],
        node_id: Optional[str],
        status: str,
        distance_m: float,
        speed_ms: float,
        rssi: Optional[int],
    ):
        self._history_cache[wheelchair_id] = {
            "timestamp": timestamp,
            "room_id": room_id,
            "node_id": node_id,
            "status": status,
            "distance_m": distance_m,
            "speed_ms": speed_ms,
            "rssi": rssi,
        }

    async def connect(self):
        """Connect to MQTT broker."""
        print(f"[MQTT] Connecting to {settings.MQTT_BROKER}:{settings.MQTT_PORT}")
        self._metrics["connect_attempts"] += 1
        try:
            self.client = aiomqtt.Client(
                hostname=settings.MQTT_BROKER,
                port=settings.MQTT_PORT,
                username=settings.MQTT_USER or None,
                password=settings.MQTT_PASSWORD or None,
            )
            await self.client.__aenter__()
            self.connected = True
            self._metrics["connect_successes"] += 1
            self._metrics["last_connected_at"] = datetime.now(timezone.utc).isoformat()
            self._set_error("")
            print("[MQTT] Connected")

            topics = [
                settings.MQTT_TOPIC,
                "WheelSense/camera/+/registration",
                "WheelSense/camera/+/status",
                "WheelSense/config/request/+",
            ]
            for topic in topics:
                await self.client.subscribe(topic)
                print(f"[MQTT] Subscribed: {topic}")

            return True
        except Exception as exc:
            print(f"[MQTT] Connection failed: {exc}")
            self.connected = False
            self._metrics["connect_failures"] += 1
            self._set_error(str(exc))
            return False

    async def disconnect(self):
        """Disconnect from MQTT broker."""
        if self.client:
            try:
                await self.client.__aexit__(None, None, None)
            except Exception:
                pass
        self.connected = False
        self._metrics["last_disconnected_at"] = datetime.now(timezone.utc).isoformat()
        print("[MQTT] Disconnected")

    async def publish(self, topic: str, payload: str) -> bool:
        """Publish message to MQTT."""
        self._metrics["publish_attempts"] += 1
        if not self.connected or not self.client:
            print("[MQTT] Publish skipped (disconnected)")
            self._metrics["publish_failures"] += 1
            if topic.startswith("WheelSense/config/"):
                self._metrics["config_sync_failures"] += 1
            self._set_error("publish requested while disconnected")
            return False

        try:
            await self.client.publish(topic, payload)
            self._metrics["publish_successes"] += 1
            print(f"[MQTT] Published: {topic}")
            return True
        except Exception as exc:
            print(f"[MQTT] Publish failed: {exc}")
            self._metrics["publish_failures"] += 1
            if topic.startswith("WheelSense/config/"):
                self._metrics["config_sync_failures"] += 1
            self._set_error(str(exc))
            return False

    async def start_listening(self):
        """Start listening for MQTT messages."""
        self._task = asyncio.create_task(self._listen_loop())

    async def stop_listening(self):
        """Stop listening for MQTT messages."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _listen_loop(self):
        """Main listening loop with auto reconnect."""
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
                    except Exception as exc:
                        print(f"[MQTT] Message process error: {exc}")

            except aiomqtt.MqttError as exc:
                if self.connected:
                    self._metrics["reconnect_events"] += 1
                self.connected = False
                self._set_error(str(exc))
                print(f"[MQTT] Broker error, reconnecting: {exc}")
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._set_error(str(exc))
                print(f"[MQTT] Unexpected loop error: {exc}")
                await asyncio.sleep(5)

    async def _process_message(self, message):
        """Process incoming MQTT message."""
        topic = str(message.topic)
        self._metrics["messages_received"] += 1
        self._metrics["last_message_at"] = datetime.now(timezone.utc).isoformat()

        try:
            payload = message.payload.decode(errors="ignore")

            if topic.startswith("WheelSense/config/request/"):
                await self._process_config_request(topic, payload)
                self._metrics["messages_processed"] += 1
                return

            if topic.startswith("WheelSense/camera/") and (
                topic.endswith("/registration") or topic.endswith("/status")
            ):
                await self._process_camera_message(topic, payload)
                self._metrics["messages_processed"] += 1
                return

            data = json.loads(payload)
            if "device_id" in data and "wheelchair" in data:
                await self._process_new_system_message(data)
                self._metrics["messages_processed"] += 1
            else:
                print(f"[MQTT] Unknown message format on {topic}")

        except json.JSONDecodeError as exc:
            self._metrics["messages_failed"] += 1
            self._set_error(str(exc))
            print(f"[MQTT] JSON decode error on {topic}: {exc}")

    async def _build_device_config_payload(
        self,
        device_id: str,
        device_type: str,
        device_ip: str,
    ) -> Dict[str, Any]:
        """Build MQTT config payload shared by HTTP and MQTT request flows."""
        rooms = await db.fetch_all("SELECT id, name FROM rooms ORDER BY name")
        nodes = await db.fetch_all("SELECT id, room_id, name FROM nodes ORDER BY id")

        room_id = ""
        room_name = ""
        if device_type == "camera":
            camera = await db.fetch_one(
                "SELECT room_id, room_name FROM camera_nodes WHERE device_id = $1",
                (device_id,),
            )
            if camera:
                room_id = str(camera.get("room_id") or "")
                room_name = str(camera.get("room_name") or "")

        if not room_id:
            mapped_node = await db.fetch_one("SELECT room_id FROM nodes WHERE id = $1", (device_id,))
            if mapped_node and mapped_node.get("room_id"):
                room_id = str(mapped_node["room_id"])

        if room_id and not room_name:
            mapped_room = await db.fetch_one("SELECT name FROM rooms WHERE id = $1", (room_id,))
            if mapped_room and mapped_room.get("name"):
                room_name = str(mapped_room["name"])

        configured_backend_url = (settings.DEVICE_BACKEND_URL or "").strip().rstrip("/")
        configured_server_ip = (settings.DEVICE_SERVER_IP or "").strip()
        configured_host, configured_port, configured_scheme = _extract_host_port_from_url(configured_backend_url)

        sync_row = await db.fetch_one(
            """
            SELECT request_host, server_ip, same_wifi, features_limited, device_ip
            FROM device_sync_status
            WHERE device_id = $1
            """,
            (device_id,),
        )

        resolved_server_ip = ""
        resolved_scheme = configured_scheme if configured_scheme in {"http", "https"} else "http"
        resolved_port = configured_port or settings.API_PORT

        if configured_server_ip and not _is_local_only_host(configured_server_ip):
            resolved_server_ip = configured_server_ip
        elif configured_host and not _is_local_only_host(configured_host):
            resolved_server_ip = configured_host
        elif sync_row:
            sync_server_ip = str(sync_row.get("server_ip") or "").strip()
            sync_request_host = str(sync_row.get("request_host") or "").strip()
            if sync_server_ip and not _is_local_only_host(sync_server_ip):
                resolved_server_ip = sync_server_ip
            elif sync_request_host and not _is_local_only_host(sync_request_host):
                resolved_server_ip = sync_request_host

        resolved_device_ip = (device_ip or "").strip()
        if not resolved_device_ip and sync_row:
            resolved_device_ip = str(sync_row.get("device_ip") or "").strip()

        subnet_match = _same_private_subnet(resolved_device_ip, resolved_server_ip) if resolved_server_ip else None
        network_check_known = subnet_match is not None
        same_wifi = bool(subnet_match) if network_check_known else (True if not resolved_server_ip else False)
        features_limited = bool(network_check_known and not same_wifi)
        if sync_row and not network_check_known and resolved_server_ip:
            same_wifi = bool(sync_row.get("same_wifi"))
            features_limited = bool(sync_row.get("features_limited"))

        backend_url = ""
        if configured_backend_url:
            backend_url = configured_backend_url
        elif resolved_server_ip:
            default_port = 443 if resolved_scheme == "https" else 80
            if resolved_port and resolved_port != default_port:
                backend_url = f"{resolved_scheme}://{resolved_server_ip}:{resolved_port}"
            else:
                backend_url = f"{resolved_scheme}://{resolved_server_ip}"

        ws_enabled = bool(
            device_type == "camera"
            and not features_limited
            and resolved_server_ip
            and not _is_local_only_host(resolved_server_ip)
        )

        payload: Dict[str, Any] = {
            "device_id": device_id,
            "node_id": device_id,
            "backend_url": backend_url,
            "server_ip": resolved_server_ip,
            "ws_enabled": ws_enabled,
            "ws_path": "/api/ws/camera",
            "mqtt_broker": settings.MQTT_BROKER,
            "mqtt_port": settings.MQTT_PORT,
            "mqtt_user": settings.MQTT_USER or "",
            "mqtt_password": settings.MQTT_PASSWORD or "",
            "rooms": [{"id": r["id"], "name": r["name"]} for r in rooms],
            "nodes": [{"id": n["id"], "room_id": n["room_id"], "name": n["name"]} for n in nodes],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "network_status": {
                "checked": network_check_known,
                "same_wifi": same_wifi,
                "features_limited": features_limited,
                "device_ip": resolved_device_ip,
                "server_ip": resolved_server_ip,
                "warning": (
                    "Different WiFi network detected. LAN-only features are limited."
                    if features_limited
                    else ""
                ),
            },
            "sync_only": True,
        }
        if room_id:
            payload["room_id"] = room_id
        if room_name:
            payload["room_name"] = room_name
            payload["room_type"] = room_name
        return payload

    async def _process_config_request(self, topic: str, payload: str):
        """Handle config request from firmware and reply via MQTT config topic."""
        self._metrics["config_requests"] += 1

        parts = topic.split("/")
        topic_device_id = parts[3].strip() if len(parts) >= 4 else ""

        request_data: Dict[str, Any] = {}
        if payload.strip():
            try:
                parsed = json.loads(payload)
                if isinstance(parsed, dict):
                    request_data = parsed
            except json.JSONDecodeError:
                request_data = {}

        requested_type = str(request_data.get("device_type") or "").strip().lower()
        raw_device_id = str(request_data.get("device_id") or topic_device_id).strip()
        if not raw_device_id:
            self._metrics["config_sync_failures"] += 1
            return

        if requested_type not in {"camera", "wheelchair"}:
            existing = await db.fetch_one(
                "SELECT device_type FROM device_sync_status WHERE device_id = ANY($1::text[]) LIMIT 1",
                (_id_candidates(raw_device_id),),
            )
            if existing and str(existing.get("device_type") or "").strip().lower() in {"camera", "wheelchair"}:
                requested_type = str(existing.get("device_type")).strip().lower()
            elif raw_device_id.upper().startswith("WSN"):
                requested_type = "camera"
            else:
                camera_hint = await db.fetch_one(
                    "SELECT device_id FROM camera_nodes WHERE device_id = ANY($1::text[]) LIMIT 1",
                    (_id_candidates(raw_device_id, device_type="camera"),),
                )
                requested_type = "camera" if camera_hint else "wheelchair"

        device_id = _normalize_device_id(raw_device_id, device_type=requested_type)
        if not device_id:
            self._metrics["config_sync_failures"] += 1
            return

        device_ip = str(request_data.get("device_ip") or "").strip()
        wifi_ssid = str(request_data.get("wifi_ssid") or "").strip()
        hinted_server_ip = str(
            request_data.get("server_ip")
            or request_data.get("config_server_ip")
            or ""
        ).strip()
        hinted_backend_url = str(request_data.get("backend_url") or "").strip()
        if not hinted_server_ip and hinted_backend_url:
            hinted_host, _, _ = _extract_host_port_from_url(hinted_backend_url)
            hinted_server_ip = hinted_host
        if _is_local_only_host(hinted_server_ip):
            hinted_server_ip = ""

        hinted_subnet = _same_private_subnet(device_ip, hinted_server_ip) if (device_ip and hinted_server_ip) else None
        same_wifi_hint = bool(hinted_subnet) if hinted_subnet is not None else True
        features_limited_hint = bool(hinted_subnet is not None and not same_wifi_hint)
        warning_hint = (
            "Different WiFi network detected. LAN-only features are limited."
            if features_limited_hint
            else ""
        )

        await db.execute(
            """
            INSERT INTO device_sync_status (
                device_id, device_type, device_ip, wifi_ssid,
                request_host, server_ip, same_wifi, features_limited,
                warning_message, last_seen, updated_at
            )
            VALUES ($1, $2, $3, $4, 'mqtt', $5, $6, $7, $8, NOW(), NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                device_type = COALESCE(NULLIF(EXCLUDED.device_type, ''), device_sync_status.device_type),
                device_ip = COALESCE(NULLIF(EXCLUDED.device_ip, ''), device_sync_status.device_ip),
                wifi_ssid = COALESCE(NULLIF(EXCLUDED.wifi_ssid, ''), device_sync_status.wifi_ssid),
                request_host = 'mqtt',
                server_ip = COALESCE(NULLIF(EXCLUDED.server_ip, ''), device_sync_status.server_ip),
                same_wifi = CASE
                    WHEN NULLIF(EXCLUDED.server_ip, '') IS NULL THEN COALESCE(device_sync_status.same_wifi, TRUE)
                    ELSE EXCLUDED.same_wifi
                END,
                features_limited = CASE
                    WHEN NULLIF(EXCLUDED.server_ip, '') IS NULL THEN COALESCE(device_sync_status.features_limited, FALSE)
                    ELSE EXCLUDED.features_limited
                END,
                warning_message = CASE
                    WHEN NULLIF(EXCLUDED.server_ip, '') IS NULL THEN COALESCE(device_sync_status.warning_message, '')
                    ELSE EXCLUDED.warning_message
                END,
                last_seen = NOW(),
                updated_at = NOW()
            """,
            (
                device_id,
                requested_type,
                device_ip,
                wifi_ssid,
                hinted_server_ip,
                same_wifi_hint,
                features_limited_hint,
                warning_hint,
            ),
        )

        config_payload = await self._build_device_config_payload(
            device_id=device_id,
            device_type=requested_type,
            device_ip=device_ip,
        )

        reply_topics = [f"WheelSense/config/{device_id}"]
        for alt in (topic_device_id.strip(), raw_device_id):
            if alt and alt != device_id:
                alt_topic = f"WheelSense/config/{alt}"
                if alt_topic not in reply_topics:
                    reply_topics.append(alt_topic)

        payload_json = json.dumps(config_payload, ensure_ascii=False)
        success_count = 0
        for reply_topic in reply_topics:
            if await self.publish(reply_topic, payload_json):
                success_count += 1

        if success_count == 0:
            self._metrics["config_sync_failures"] += 1
            print(f"[MQTT] Config reply failed for {device_id}")
        else:
            self._metrics["config_replies"] += 1
            print(f"[MQTT] Config reply sent to {device_id} ({success_count}/{len(reply_topics)})")

    async def _process_camera_message(self, topic: str, payload: str):
        """Process Node_Tsimcam registration/status payloads."""
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            print(f"[MQTT] Camera JSON decode error on {topic}: {exc}")
            self._metrics["messages_failed"] += 1
            self._set_error(str(exc))
            return

        if not isinstance(data, dict):
            return

        parts = topic.split("/")
        topic_device_id = parts[2] if len(parts) >= 4 else ""
        raw_device_id = str(data.get("device_id") or topic_device_id).strip()
        device_id = _normalize_device_id(raw_device_id, device_type="camera")
        if not device_id:
            return

        node_id = _normalize_device_id(str(data.get("node_id") or device_id).strip(), device_type="camera")
        room_id = str(data.get("room_id") or "").strip()
        room_name = str(data.get("room_name") or data.get("room") or "").strip()
        ip_address = str(data.get("ip_address") or data.get("ip") or "").strip()

        raw_status = str(data.get("status") or "").strip().lower()
        config_mode = bool(data.get("config_mode", False))
        ws_connected = bool(data.get("ws_connected", False))

        if config_mode:
            status = "config"
        elif raw_status in {"online", "offline", "config", "error", "unknown"}:
            status = raw_status
        else:
            status = "online"

        frames_sent = int(_to_float(data.get("frames_sent"), 0.0))
        frames_dropped = int(_to_float(data.get("frames_dropped"), 0.0))

        existing_camera = await db.fetch_one(
            "SELECT room_id, room_name FROM camera_nodes WHERE device_id = $1",
            (device_id,),
        )
        binding_changed = False
        if room_id:
            binding_changed = (not existing_camera) or (str(existing_camera.get("room_id") or "") != room_id)
        elif room_name:
            binding_changed = (not existing_camera) or (str(existing_camera.get("room_name") or "") != room_name)
        room_binding_last_updated = datetime.now(timezone.utc) if binding_changed else None

        await db.execute(
            """
            INSERT INTO camera_nodes (
                device_id, node_id, room_id, room_name, room_binding_last_updated, ip_address,
                status, config_mode, ws_connected, frames_sent, frames_dropped, last_seen, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            ON CONFLICT (device_id) DO UPDATE SET
                node_id = COALESCE(NULLIF(EXCLUDED.node_id, ''), camera_nodes.node_id),
                room_id = COALESCE(NULLIF(EXCLUDED.room_id, ''), camera_nodes.room_id),
                room_name = COALESCE(NULLIF(EXCLUDED.room_name, ''), camera_nodes.room_name),
                room_binding_last_updated = COALESCE(EXCLUDED.room_binding_last_updated, camera_nodes.room_binding_last_updated),
                ip_address = COALESCE(NULLIF(EXCLUDED.ip_address, ''), camera_nodes.ip_address),
                status = EXCLUDED.status,
                config_mode = EXCLUDED.config_mode,
                ws_connected = EXCLUDED.ws_connected,
                frames_sent = EXCLUDED.frames_sent,
                frames_dropped = EXCLUDED.frames_dropped,
                last_seen = NOW(),
                updated_at = NOW()
            """,
            (
                device_id,
                node_id,
                room_id,
                room_name,
                room_binding_last_updated,
                ip_address,
                status,
                config_mode,
                ws_connected,
                frames_sent,
                frames_dropped,
            ),
        )

        print(f"[MQTT] Camera update {device_id}: status={status} room={room_id or room_name or '-'} ws={ws_connected}")

    async def _process_new_system_message(self, data: Dict[str, Any]):
        """Process M5StickCPlus2 telemetry."""
        raw_device_id = str(data.get("device_id", "")).strip()
        device_id = _normalize_device_id(raw_device_id, device_type="wheelchair")
        if not device_id:
            return

        timestamp = _parse_mqtt_timestamp(data.get("timestamp"))
        wheelchair_data = data.get("wheelchair", {}) if isinstance(data.get("wheelchair"), dict) else {}
        selected_node = data.get("selected_node", {}) if isinstance(data.get("selected_node"), dict) else {}
        nearby_nodes = data.get("nearby_nodes", []) if isinstance(data.get("nearby_nodes"), list) else []

        status_str = str(wheelchair_data.get("status", "OK"))
        distance_m = _to_float(wheelchair_data.get("distance_m"), 0.0)
        speed_ms = _to_float(wheelchair_data.get("speed_ms"), 0.0)

        wheelchair = await db.fetch_one("SELECT * FROM wheelchairs WHERE mac_address = $1", (device_id,))
        if not wheelchair:
            digits = "".join(ch for ch in device_id if ch.isdigit())
            if digits:
                num = int(digits) % 100 or 1
                wheelchair_id = f"WC-{num:02d}"
            else:
                wheelchair_id = f"WC-{device_id}"
            await db.execute(
                """INSERT INTO wheelchairs (id, name, mac_address, status, last_seen)
                   VALUES ($1, $2, $3, 'active', NOW())""",
                (wheelchair_id, f"Wheelchair {wheelchair_id}", device_id),
            )
            wheelchair = await db.fetch_one("SELECT * FROM wheelchairs WHERE id = $1", (wheelchair_id,))
            print(f"[MQTT] Auto-created wheelchair: {wheelchair_id}")

        wheelchair_id = wheelchair["id"]

        current_room_id = None
        current_node_id = None
        node_rssi = selected_node.get("rssi")
        selected_node_id = str(selected_node.get("node_key") or selected_node.get("node_id") or "").strip()

        if selected_node_id:
            dedup_candidates = _id_candidates(selected_node_id, device_type="camera")

            node = await db.fetch_one(
                "SELECT * FROM nodes WHERE id = ANY($1::text[]) LIMIT 1",
                (dedup_candidates,),
            )
            if node:
                current_node_id = node["id"]
                current_room_id = node.get("room_id")
                await db.execute(
                    """UPDATE nodes SET
                       status = 'online',
                       last_seen_by = $1,
                       rssi = $2,
                       updated_at = NOW()
                       WHERE id = $3""",
                    (device_id, node_rssi, current_node_id),
                )
            else:
                camera = await db.fetch_one(
                    """
                    SELECT device_id, node_id, room_id, room_name
                    FROM camera_nodes
                    WHERE device_id = ANY($1::text[]) OR node_id = ANY($1::text[])
                    LIMIT 1
                    """,
                    (dedup_candidates,),
                )
                if camera:
                    current_node_id = str(camera.get("node_id") or camera.get("device_id") or selected_node_id)
                    current_room_id = camera.get("room_id")

        old_room_id = wheelchair.get("current_room_id")
        if current_room_id and old_room_id != current_room_id:
            await self._log_room_change(
                wheelchair_id=wheelchair_id,
                patient_id=wheelchair.get("patient_id"),
                from_room_id=old_room_id,
                to_room_id=current_room_id,
            )

        # Keep last known room/node when a packet has no selected node.
        resolved_room_id = current_room_id if current_room_id else wheelchair.get("current_room_id")
        resolved_node_id = current_node_id if current_node_id else wheelchair.get("current_node_id")

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
                resolved_room_id,
                resolved_node_id,
                distance_m,
                speed_ms,
                status_str,
                node_rssi,
                wheelchair_id,
            ),
        )

        if speed_ms > 0:
            try:
                from .safety_monitor import check_speed_alert

                await check_speed_alert(
                    wheelchair_id=wheelchair_id,
                    patient_id=wheelchair.get("patient_id"),
                    speed_ms=speed_ms,
                )
            except Exception as safety_err:
                print(f"[MQTT] Safety check error: {safety_err}")

        should_insert_history = await self._should_store_history_sample(
            wheelchair_id=wheelchair_id,
            timestamp=timestamp,
            room_id=resolved_room_id,
            node_id=resolved_node_id,
            status=status_str,
            distance_m=distance_m,
            speed_ms=speed_ms,
        )

        if should_insert_history:
            await db.execute(
                """INSERT INTO wheelchair_history
                   (wheelchair_id, timestamp, room_id, node_id, distance_m, speed_ms, status, rssi)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                (
                    wheelchair_id,
                    timestamp,
                    resolved_room_id,
                    resolved_node_id,
                    distance_m,
                    speed_ms,
                    status_str,
                    node_rssi,
                ),
            )
            self._metrics["history_inserts"] += 1
            self._update_history_cache(
                wheelchair_id=wheelchair_id,
                timestamp=timestamp,
                room_id=resolved_room_id,
                node_id=resolved_node_id,
                status=status_str,
                distance_m=distance_m,
                speed_ms=speed_ms,
                rssi=node_rssi,
            )
        else:
            self._metrics["history_skipped"] += 1

        for nearby in nearby_nodes:
            if not isinstance(nearby, dict):
                continue
            nearby_identity = str(nearby.get("node_key") or nearby.get("node_id") or "").strip()
            if nearby_identity:
                dedup_nearby = _id_candidates(nearby_identity, device_type="camera")
                await db.execute(
                    """UPDATE nodes SET
                       status = 'online',
                       rssi = $1,
                       updated_at = NOW()
                       WHERE id = ANY($2::text[])""",
                    (nearby.get("rssi"), dedup_nearby),
                )

        room_name = "Unknown"
        if resolved_room_id:
            room = await db.fetch_one("SELECT name FROM rooms WHERE id = $1", (resolved_room_id,))
            if room:
                room_name = room["name"]

        print(f"[MQTT] Updated: {wheelchair_id} @ {room_name} (Node: {resolved_node_id}, RSSI: {node_rssi})")

        if self.on_data_callback:
            await self.on_data_callback(
                {
                    "wheelchair_id": wheelchair_id,
                    "room_id": resolved_room_id,
                    "node_id": resolved_node_id,
                    "rssi": node_rssi,
                    "distance_m": distance_m,
                    "speed_ms": speed_ms,
                    "status": status_str,
                }
            )

    async def _log_room_change(self, wheelchair_id: str, patient_id: str, from_room_id: str, to_room_id: str):
        """Log room change event to timeline."""
        await db.execute(
            """INSERT INTO timeline_events
               (wheelchair_id, patient_id, event_type, from_room_id, to_room_id, description)
               VALUES ($1, $2, 'location_change', $3, $4, $5)""",
            (
                wheelchair_id,
                patient_id,
                from_room_id,
                to_room_id,
                f"Wheelchair moved from {from_room_id or 'unknown'} to {to_room_id}",
            ),
        )
        print(f"[MQTT] Room change: {wheelchair_id} -> {to_room_id}")


# Global MQTT collector instance
mqtt_collector = MQTTCollector()
