"""Minimal Wi-Fi setup portal used only when config.py is absent."""


FORM = b"""HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n
<!doctype html><meta name=viewport content='width=device-width'>
<title>WheelSense E84 setup</title><style>body{font:18px sans-serif;max-width:32rem;margin:2rem auto;padding:1rem}input,button{box-sizing:border-box;width:100%;padding:.7rem;margin:.35rem 0}</style>
<h1>WheelSense E84</h1><form method=post action=/save>
<input name=ssid placeholder='Wi-Fi SSID' maxlength=32 required>
<input name=password type=password placeholder='Wi-Fi password' maxlength=63>
<input name=mqtt value='broker.emqx.io' placeholder='MQTT broker' maxlength=128 required>
<input name=port value=1883 type=number min=1 max=65535 required>
<input name=node placeholder='Node ID' maxlength=32>
<button>Save and restart</button></form>"""
SAVED = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nSaved. Restarting."


def decode_form(body):
    result = {}
    for item in body.split("&"):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        value = value.replace("+", " ")
        out = bytearray()
        index = 0
        while index < len(value):
            if value[index] == "%" and index + 2 < len(value):
                try:
                    out.append(int(value[index + 1 : index + 3], 16))
                    index += 3
                    continue
                except ValueError:
                    pass
            out.extend(value[index].encode())
            index += 1
        result[key] = out.decode()
    return result


def _valid(values):
    try:
        port = int(values.get("port", "1883"))
    except ValueError:
        return False
    return (
        0 < len(values.get("ssid", "")) <= 32
        and len(values.get("password", "")) <= 63
        and 0 < len(values.get("mqtt", "")) <= 128
        and 0 < port <= 65535
        and len(values.get("node", "")) <= 32
    )


def _save(values):
    lines = (
        ("WIFI_SSID", values["ssid"]),
        ("WIFI_PASSWORD", values.get("password", "")),
        ("MQTT_HOST", values["mqtt"]),
        ("MQTT_PORT", int(values.get("port", "1883"))),
        ("MQTT_USER", ""),
        ("MQTT_PASSWORD", ""),
        ("NODE_ID", values.get("node", "")),
        ("NATIVE_BRIDGE", False),
    )
    with open("/config.py", "w") as config:
        for key, value in lines:
            config.write(key + " = " + repr(value) + "\n")


def _save_native(values):
    mapped = {
        "ssid": values.get("wifi_ssid", ""),
        "password": values.get("wifi_password", ""),
        "mqtt": values.get("mqtt_broker", ""),
        "port": str(values.get("mqtt_port", "1883")),
        "node": values.get("node_id", ""),
    }
    if not _valid(mapped):
        return False
    _save(mapped)
    return True


def run(device_id, bridge=None):
    import network
    import socket
    import time
    from machine import reset

    ap = network.WLAN(network.AP_IF)
    ap.config(ssid="WS-" + device_id)
    ap.active(True)
    address = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(address)
    server.listen(1)
    server.settimeout(0.25)
    print("Setup AP: WS-{} http://{}".format(device_id, ap.ifconfig()[0]))
    while True:
        if bridge:
            try:
                event = bridge.poll_event()
            except (OSError, ValueError) as exc:
                print("Touch setup event error:", repr(exc))
                event = None
            if event and event.get("event") == "save_config" and _save_native(event):
                time.sleep_ms(100)
                reset()
        try:
            client, _ = server.accept()
        except OSError:
            continue
        try:
            request = client.recv(4096)
            head, _, body = request.partition(b"\r\n\r\n")
            if head.startswith(b"POST /save "):
                values = decode_form(body.decode())
                if _valid(values):
                    _save(values)
                    client.send(SAVED)
                    time.sleep(1)
                    reset()
            client.send(FORM)
        finally:
            client.close()


def self_check():
    values = decode_form("ssid=My+WiFi&password=a%2Bb&mqtt=broker.emqx.io&port=1883")
    assert values["ssid"] == "My WiFi" and values["password"] == "a+b"
    assert _valid(values)


if __name__ == "__main__":
    self_check()
    print("provision parser: PASS")
