import os
from binascii import hexlify
from machine import Pin, unique_id


MAINTENANCE_FILE = "/maintenance"
DEVICE_ID = "CAM_E84_" + hexlify(unique_id()).decode()[-8:].upper()


def maintenance_requested():
    try:
        os.stat(MAINTENANCE_FILE)
        return True
    except OSError:
        button = Pin(Pin.board.USER_BUTTON, Pin.IN, Pin.PULL_UP)
        return button.value() == 0


def load_config():
    try:
        import config

        return config
    except ImportError:
        return None


def provision():
    bridge = None
    try:
        from native_bridge import NativeBridge

        bridge = NativeBridge(True)
        bridge.execute({"command": "enter_config_mode"})
    except (ImportError, OSError, ValueError) as exc:
        print({"event": "native_bridge_unavailable", "error": repr(exc)})
    import provision as portal

    portal.run(DEVICE_ID, bridge)


config = load_config()
if maintenance_requested():
    print("WheelSense maintenance mode; remove /maintenance then reset to run")
elif not config or not getattr(config, "WIFI_SSID", ""):
    provision()
else:
    import runtime
