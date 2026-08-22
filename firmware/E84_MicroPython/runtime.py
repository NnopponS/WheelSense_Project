import json
import os
import time
from binascii import hexlify
from machine import I2C, Pin, reset, unique_id

import node


VERSION = "0.2.0-micropython"
DEVICE_ID = "CAM_E84_" + hexlify(unique_id()).decode()[-8:].upper()
TOPICS = node.topics(DEVICE_ID)
MAINTENANCE_FILE = "/maintenance"
TASK_FILE = "/task.json"
CONFIG_FILE = "/config.py"
CONFIG_NAMES = {
    "wifi_ssid": "WIFI_SSID",
    "wifi_password": "WIFI_PASSWORD",
    "mqtt_broker": "MQTT_HOST",
    "mqtt_port": "MQTT_PORT",
    "mqtt_user": "MQTT_USER",
    "mqtt_password": "MQTT_PASSWORD",
    "node_id": "NODE_ID",
}


def load_config():
    try:
        import config

        return config
    except ImportError:
        return None


def load_task():
    try:
        with open(TASK_FILE) as source:
            return json.load(source)
    except (OSError, ValueError):
        return None


def save_task(task):
    with open(TASK_FILE, "w") as target:
        json.dump(task, target)


def save_config(config, update):
    values = {}
    for wire_name, python_name in CONFIG_NAMES.items():
        values[python_name] = update.get(wire_name, getattr(config, python_name, ""))
    values["NATIVE_BRIDGE"] = bool(getattr(config, "NATIVE_BRIDGE", False))
    with open(CONFIG_FILE, "w") as target:
        target.write("# Generated locally by WheelSense provisioning.\n")
        for name in (
            "WIFI_SSID",
            "WIFI_PASSWORD",
            "MQTT_HOST",
            "MQTT_PORT",
            "MQTT_USER",
            "MQTT_PASSWORD",
            "NODE_ID",
            "NATIVE_BRIDGE",
        ):
            target.write(name + " = " + repr(values[name]) + "\n")


def connect_wifi(config):
    if not config or not getattr(config, "WIFI_SSID", ""):
        return None
    import network

    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(config.WIFI_SSID, getattr(config, "WIFI_PASSWORD", ""))
    for _ in range(30):
        if wlan.isconnected():
            return wlan
        time.sleep(1)
    print(json.dumps({"event": "wifi_timeout", "ssid": config.WIFI_SSID}))
    return None


def start_bridge(config):
    if not config or not getattr(config, "NATIVE_BRIDGE", False):
        return None
    try:
        from native_bridge import NativeBridge

        return NativeBridge(True)
    except (ImportError, OSError, ValueError) as exc:
        print(json.dumps({"event": "native_bridge_unavailable", "error": repr(exc)}))
        return None


def _publish_json(client, topic, payload, retain=False):
    client.publish(topic.encode(), json.dumps(payload).encode(), retain=retain)


def connect_mqtt(config, wlan, bridge, runtime):
    if not wlan or not getattr(config, "MQTT_HOST", ""):
        return None
    from umqtt.simple import MQTTClient

    user = getattr(config, "MQTT_USER", "") or None
    password = getattr(config, "MQTT_PASSWORD", "") or None
    client = MQTTClient(
        DEVICE_ID,
        config.MQTT_HOST,
        port=getattr(config, "MQTT_PORT", 1883),
        user=user,
        password=password,
        keepalive=45,
    )

    def on_message(topic, message):
        try:
            payload = json.loads(message)
        except (ValueError, AttributeError) as exc:
            print(json.dumps({"event": "mqtt_payload_error", "error": repr(exc)}))
            return
        topic_name = topic.decode()
        if topic_name != TOPICS["control"]:
            try:
                update = node.parse_config(payload)
                save_config(config, update)
                if bridge:
                    bridge.execute({"command": "enter_config_mode", "saved": True})
                print(json.dumps({"event": "config_saved", "topic": topic_name}))
                if not update["sync_only"]:
                    time.sleep_ms(100)
                    reset()
            except (node.CommandError, OSError) as exc:
                print(json.dumps({"event": "config_error", "error": repr(exc)}))
            return
        try:
            command = node.parse_control(payload)
            name = command["command"]
            if name == "ping":
                ok, response = True, "pong"
            elif name == "enter_config_mode":
                with open(MAINTENANCE_FILE, "w") as marker:
                    marker.write("mqtt")
                _publish_json(
                    client,
                    TOPICS["ack"],
                    node.ack(DEVICE_ID, command, time.ticks_ms(), "ok", "entering_config_mode"),
                )
                time.sleep_ms(100)
                reset()
                return
            elif name in ("restart", "reboot"):
                _publish_json(client, TOPICS["ack"], node.ack(DEVICE_ID, command, time.ticks_ms(), "ok", "rebooting"))
                time.sleep_ms(100)
                reset()
                return
            elif name == "assign_task":
                runtime["task"] = node.task_view(command)
                save_task(runtime["task"])
                if bridge:
                    ok, response = bridge.execute(command)
                else:
                    ok, response = False, "native_bridge_unavailable"
            else:
                if bridge:
                    ok, response = bridge.execute(command)
                else:
                    ok, response = False, "native_bridge_unavailable"
        except node.CommandError as exc:
            command = payload if isinstance(payload, dict) else {}
            command["command"] = command.get("command", command.get("cmd", ""))
            ok, response = False, str(exc)
        if command.get("command_id"):
            _publish_json(
                client,
                TOPICS["ack"],
                node.ack(DEVICE_ID, command, time.ticks_ms(), "ok" if ok else "error", response),
            )

    client.set_callback(on_message)
    client.set_last_will(
        TOPICS["status"].encode(),
        json.dumps({"device_id": DEVICE_ID, "online": False}).encode(),
        retain=True,
    )
    client.connect(timeout=10)
    client.subscribe(TOPICS["control"].encode())
    client.subscribe(TOPICS["config"].encode())
    client.subscribe(TOPICS["config_all"].encode())
    ip_address = wlan.ifconfig()[0] if wlan else ""
    registration = node.registration(
        DEVICE_ID,
        getattr(config, "NODE_ID", "") or DEVICE_ID,
        VERSION,
        ip_address,
        ble_mac=runtime.get("ble_mac", ""),
        native_bridge=bool(bridge and bridge.ready),
    )
    _publish_json(client, TOPICS["registration"], registration, retain=True)
    return client


def read_sample(sht4x, dps368, bmi270):
    temperature, humidity = sht4x.read()
    _, pressure = dps368.read()
    accel, gyro, orientation = bmi270.read()
    return {
        "device_id": DEVICE_ID,
        "uptime_ms": time.ticks_ms(),
        "temperature_c": round(temperature, 2),
        "humidity_rh": round(humidity, 2),
        "pressure_hpa": round(pressure, 2),
        "accel_g": [round(value, 4) for value in accel],
        "gyro_dps": [round(value, 3) for value in gyro],
        "roll_deg": round(orientation[0], 2),
        "pitch_deg": round(orientation[1], 2),
    }


def handle_native_event(event, runtime, mqtt):
    event_name = event.get("event", "")
    if event_name == "staff_detected":
        runtime["nearby_staff"] = {
            "name": str(event.get("name", ""))[:64],
            "beacon_id": str(event.get("beacon_id", ""))[:64],
            "rssi": int(event.get("rssi", -127)),
        }
    elif event_name in ("task_confirmed", "task_dismissed") and runtime.get("task"):
        task = runtime["task"]
        task["status"] = "confirmed" if event_name == "task_confirmed" else "dismissed"
        save_task(task)
        if mqtt and task.get("command_id"):
            command = {"command_id": task["command_id"], "command": "assign_task"}
            _publish_json(
                mqtt,
                TOPICS["ack"],
                node.ack(DEVICE_ID, command, time.ticks_ms(), "ok", event_name),
            )
    elif event_name == "save_config":
        return event
    return None


def main():
    config = load_config()
    bridge = start_bridge(config)
    if not config or not getattr(config, "WIFI_SSID", ""):
        import provision

        if bridge:
            bridge.execute({"command": "enter_config_mode"})
        provision.run(DEVICE_ID, bridge)
        return
    from sensors import BMI270, DPS368, SHT4X

    led = Pin(Pin.board.USER_LED1, Pin.OUT, value=0)
    i2c = I2C(scl=Pin.board.I2C_SCL_1V8, sda=Pin.board.I2C_SDA_1V8, freq=100000)
    missing = {0x44, 0x68, 0x77}.difference(i2c.scan())
    if missing:
        raise OSError("required I2C sensors missing: " + ",".join(hex(address) for address in missing))
    sht4x, dps368, bmi270 = SHT4X(i2c), DPS368(i2c), BMI270(i2c)
    from ble_node import mac_address, start as start_ble

    ble = start_ble(DEVICE_ID)
    wlan = connect_wifi(config)
    if not wlan:
        if bridge:
            bridge.execute({"command": "enter_config_mode"})
        import provision

        provision.run(DEVICE_ID, bridge)
        return
    runtime = {"task": load_task(), "nearby_staff": None, "ble_mac": mac_address(ble)}
    try:
        mqtt = connect_mqtt(config, wlan, bridge, runtime)
    except OSError as exc:
        print(json.dumps({"event": "mqtt_connect_error", "error": repr(exc)}))
        mqtt = None
    if mqtt:
        _publish_json(
            mqtt,
            TOPICS["status"],
            node.status(
                DEVICE_ID,
                getattr(config, "NODE_ID", ""),
                VERSION,
                time.ticks_ms(),
                native_bridge=bool(bridge and bridge.ready),
                task=runtime["task"],
                nearby_staff=runtime["nearby_staff"],
            ),
            retain=True,
        )
    print(json.dumps({"event": "ready", "device_id": DEVICE_ID, "ble": bool(ble), "i2c": [hex(x) for x in i2c.scan()]}))
    last_status = time.ticks_ms()
    next_mqtt_attempt = last_status
    while True:
        if bridge:
            try:
                native_event = bridge.poll_event()
                if native_event:
                    native_config = handle_native_event(native_event, runtime, mqtt)
                    if native_config:
                        update = node.parse_config(native_config)
                        save_config(config, update)
                        reset()
            except (OSError, ValueError, node.CommandError) as exc:
                print(json.dumps({"event": "native_event_error", "error": repr(exc)}))
        try:
            sample = read_sample(sht4x, dps368, bmi270)
            print(json.dumps(sample))
        except (OSError, ValueError) as exc:
            print(json.dumps({"event": "sensor_error", "error": repr(exc)}))
            sample = None
            led.value(0)
        now = time.ticks_ms()
        if not mqtt and time.ticks_diff(now, next_mqtt_attempt) >= 0:
            try:
                mqtt = connect_mqtt(config, wlan, bridge, runtime)
            except OSError as exc:
                print(json.dumps({"event": "mqtt_connect_error", "error": repr(exc)}))
                next_mqtt_attempt = time.ticks_add(now, 5000)
        if mqtt:
            try:
                if sample:
                    mqtt.publish(("WheelSense/sensor/" + DEVICE_ID + "/telemetry").encode(), json.dumps(sample).encode())
                mqtt.check_msg()
                if time.ticks_diff(now, last_status) >= 5000:
                    _publish_json(
                        mqtt,
                        TOPICS["status"],
                        node.status(
                            DEVICE_ID,
                            getattr(config, "NODE_ID", ""),
                            VERSION,
                            now,
                            sample,
                            bool(bridge and bridge.ready),
                            task=runtime["task"],
                            nearby_staff=runtime["nearby_staff"],
                        ),
                    )
                    last_status = now
            except OSError as exc:
                print(json.dumps({"event": "mqtt_error", "error": repr(exc)}))
                try:
                    mqtt.disconnect()
                except OSError:
                    pass
                mqtt = None
                next_mqtt_attempt = time.ticks_add(now, 5000)
        if sample:
            led.value(not led.value())
        time.sleep(1)


def maintenance_requested():
    try:
        os.stat(MAINTENANCE_FILE)
        return True
    except OSError:
        pass
    button = Pin(Pin.board.USER_BUTTON, Pin.IN, Pin.PULL_UP)
    return button.value() == 0


if maintenance_requested():
    print("WheelSense maintenance mode; remove /maintenance then reset to run")
else:
    main()
