"""WheelSense Node MQTT contract, kept independent of MicroPython hardware."""


PROTOCOL_VERSION = 1
CAMERA_COMMANDS = {
    "start_stream",
    "stop_stream",
    "capture",
    "capture_frame",
    "snapshot",
    "set_resolution",
}
RESOLUTIONS = ("QVGA", "VGA", "SVGA", "XGA")
CONFIG_LIMITS = {
    "wifi_ssid": 32,
    "wifi_password": 63,
    "mqtt_broker": 253,
    "mqtt_user": 128,
    "mqtt_password": 128,
    "node_id": 32,
}


class CommandError(ValueError):
    pass


def topics(device_id):
    root = "WheelSense/camera/" + device_id
    return {
        "root": root,
        "control": root + "/control",
        "registration": root + "/registration",
        "status": root + "/status",
        "ack": root + "/ack",
        "config": "WheelSense/config/" + device_id,
        "config_all": "WheelSense/config/all",
    }


def registration(device_id, node_id, firmware, ip_address="", ble_mac="", native_bridge=False):
    capabilities = ["environment", "orientation", "wifi", "mqtt", "cm55_ipc"]
    if native_bridge:
        capabilities.extend(("camera", "display", "touch"))
    if ble_mac:
        capabilities.append("ble")
    payload = {
        "type": "device_registration",
        "device_id": device_id,
        "node_id": node_id or device_id,
        "device_type": "camera",
        "hardware_type": "node",
        "ip_address": ip_address,
        "firmware": firmware,
        "capabilities": capabilities,
    }
    if ble_mac:
        payload["ble_mac"] = ble_mac
    return payload


def status(
    device_id,
    node_id,
    firmware,
    uptime_ms,
    sample=None,
    native_bridge=False,
    online=True,
    task=None,
    nearby_staff=None,
):
    payload = {
        "device_id": device_id,
        "node_id": node_id or device_id,
        "online": online,
        "firmware": firmware,
        "protocolVersion": PROTOCOL_VERSION,
        "timestampUs": int(uptime_ms) * 1000,
        "displayOrientation": "landscape",
        "deviceHealth": "ok",
        "nativeBridge": "ready" if native_bridge else "unavailable",
    }
    if sample:
        payload["environment"] = {
            "temperatureC": sample["temperature_c"],
            "humidityPct": sample["humidity_rh"],
            "pressureHpa": sample["pressure_hpa"],
            "validMask": 7,
        }
        payload["imu"] = {
            "accelX": sample["accel_g"][0],
            "accelY": sample["accel_g"][1],
            "accelZ": sample["accel_g"][2],
            "gyroX": sample["gyro_dps"][0],
            "gyroY": sample["gyro_dps"][1],
            "gyroZ": sample["gyro_dps"][2],
        }
    if task:
        payload["task"] = task
    if nearby_staff:
        payload["nearby_staff"] = nearby_staff
    return payload


def parse_config(payload):
    if not isinstance(payload, dict):
        raise CommandError("invalid_config_payload")
    result = {}
    for field, limit in CONFIG_LIMITS.items():
        if field not in payload:
            continue
        value = payload[field]
        if not isinstance(value, str) or len(value) > limit:
            raise CommandError("invalid_" + field)
        result[field] = value
    if "mqtt_port" in payload:
        port = payload["mqtt_port"]
        if type(port) is not int or not 1 <= port <= 65535:
            raise CommandError("invalid_mqtt_port")
        result["mqtt_port"] = port
    result["sync_only"] = payload.get("sync_only") is True
    if len(result) == 1:
        raise CommandError("empty_config")
    return result


def parse_control(payload):
    if not isinstance(payload, dict):
        raise CommandError("invalid_payload")
    command = payload.get("command", payload.get("cmd", ""))
    if not isinstance(command, str) or not command:
        raise CommandError("missing_command")
    command = command.lower()
    result = dict(payload)
    result["command"] = command

    if command == "start_stream":
        interval = result.get("interval_ms", 200)
        if type(interval) is not int or not 100 <= interval <= 60000:
            raise CommandError("invalid_interval")
        result["interval_ms"] = interval
    elif command == "set_resolution":
        resolution = result.get("resolution", "VGA")
        if resolution not in RESOLUTIONS:
            raise CommandError("invalid_resolution")
        result["resolution"] = resolution
    elif command == "assign_task":
        task_id = result.get("task_id")
        if not isinstance(task_id, (str, int)) or isinstance(task_id, bool) or not str(task_id).strip():
            raise CommandError("missing_task_id")
        result["task_id"] = str(task_id)
        for field in ("task_title", "room_name"):
            if not isinstance(result.get(field), str) or not result[field].strip():
                raise CommandError("missing_" + field)
        caregiver = result.get("caregiver_name", result.get("assigned_person_name", ""))
        if not isinstance(caregiver, str) or not caregiver.strip():
            raise CommandError("missing_caregiver_name")
        result["caregiver_name"] = caregiver
        result["task_status"] = "assigned"
    elif command not in CAMERA_COMMANDS and command not in (
        "ping",
        "restart",
        "reboot",
        "enter_config_mode",
        "assign_task",
    ):
        raise CommandError("unknown_command")
    return result


def ack(device_id, command, uptime_ms, status_name, message):
    return {
        "command_id": command.get("command_id", ""),
        "device_id": device_id,
        "command": command.get("command", ""),
        "status": status_name,
        "message": message,
        "timestamp_ms": int(uptime_ms),
    }


def task_view(command, status_name="assigned"):
    return {
        "task_id": command["task_id"],
        "title": command["task_title"],
        "room_name": command["room_name"],
        "caregiver_name": command["caregiver_name"],
        "status": status_name,
        "command_id": command.get("command_id", ""),
    }


def self_check():
    command = parse_control({"cmd": "START_STREAM"})
    assert command["command"] == "start_stream" and command["interval_ms"] == 200
    assert registration("E84", "NODE", "1")["hardware_type"] == "node"
    assert parse_config({"mqtt_broker": "host", "mqtt_port": 1883})["mqtt_port"] == 1883
    try:
        parse_control({"command": "set_resolution", "resolution": "4K"})
    except CommandError as exc:
        assert str(exc) == "invalid_resolution"
    else:
        raise AssertionError("invalid resolution accepted")


if __name__ == "__main__":
    self_check()
    print("node contract: PASS")
