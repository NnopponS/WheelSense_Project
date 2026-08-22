"""BLE name advertisement used by the WheelSense mobile scanner."""


def advertising_payload(name):
    encoded = name.encode()[:26]
    return b"\x02\x01\x06" + bytes((len(encoded) + 1, 0x09)) + encoded


def start(name):
    try:
        import bluetooth
    except ImportError:
        print('{"event":"ble_unavailable"}')
        return None
    ble = bluetooth.BLE()
    ble.active(True)
    ble.config(gap_name=name)
    ble.gap_advertise(500000, adv_data=advertising_payload(name))
    return ble


def mac_address(ble):
    if not ble:
        return ""
    value = ble.config("mac")
    raw = value[1] if isinstance(value, tuple) else value
    return ":".join("{:02X}".format(byte) for byte in raw)


def self_check():
    payload = advertising_payload("CAM_E84_12345678")
    assert payload[0:3] == b"\x02\x01\x06"
    assert payload[5:] == b"CAM_E84_12345678"


if __name__ == "__main__":
    self_check()
    print("BLE payload: PASS")
