"""CM33 MicroPython to CM55 native-hardware command bridge."""

import struct
from binascii import crc32


CLIENT_CM33 = 3
CLIENT_CM55 = 5
COMMANDS = {
    "start_stream": 1,
    "stop_stream": 2,
    "capture": 3,
    "capture_frame": 3,
    "snapshot": 3,
    "set_resolution": 4,
    "assign_task": 5,
    "enter_config_mode": 6,
}
RESOLUTION_VALUES = {"QVGA": 1, "VGA": 2, "SVGA": 3, "XGA": 4}
MAILBOX_TX = 0x240FF000
MAILBOX_RX = 0x240FF800
MAILBOX_SIZE = 0x800
MAGIC = 0x38534557  # "WSE8" in little endian
VERSION = 1
HEADER = "<IHHIHHI"
HEADER_SIZE = 20
FIELD_IDS = {
    "command": 1,
    "command_id": 2,
    "interval_ms": 3,
    "resolution": 4,
    "task_id": 5,
    "task_title": 6,
    "room_name": 7,
    "caregiver_name": 8,
    "event": 9,
    "name": 10,
    "beacon_id": 11,
    "rssi": 12,
    "wifi_ssid": 13,
    "wifi_password": 14,
    "mqtt_broker": 15,
    "mqtt_port": 16,
    "mqtt_user": 17,
    "mqtt_password": 18,
    "node_id": 19,
    "sync_only": 20,
    "saved": 21,
}
FIELD_NAMES = {value: key for key, value in FIELD_IDS.items()}
INTEGER_FIELDS = {"interval_ms", "rssi", "mqtt_port"}


def encode_fields(payload):
    encoded = bytearray()
    for name, field_id in FIELD_IDS.items():
        if name not in payload:
            continue
        value = payload[name]
        if isinstance(value, bool):
            value = "1" if value else "0"
        data = str(value).encode()
        if len(data) > 65535:
            raise ValueError("native_field_too_large")
        encoded.extend(struct.pack("<BH", field_id, len(data)))
        encoded.extend(data)
    return bytes(encoded)


def decode_fields(data):
    result = {}
    offset = 0
    while offset < len(data):
        if len(data) - offset < 3:
            raise ValueError("native_field_header")
        field_id, length = struct.unpack("<BH", data[offset : offset + 3])
        offset += 3
        if length > len(data) - offset:
            raise ValueError("native_field_length")
        name = FIELD_NAMES.get(field_id)
        value = data[offset : offset + length].decode()
        offset += length
        if name:
            result[name] = int(value) if name in INTEGER_FIELDS else value
    return result


class NativeBridge:
    def __init__(self, enabled=False, ipc_factory=None, memory=None):
        self.ready = False
        self.last_reply = None
        if not enabled:
            return
        if ipc_factory is None:
            from machine import IPC, mem8

            ipc_factory = lambda: IPC(src_core=IPC.CM33, target_core=IPC.CM55)
            memory = mem8
        if memory is None:
            raise ValueError("memory_required")
        self.memory = memory
        self.sequence = 0
        self.event_sequence = 0
        self.ipc = ipc_factory()
        self.ipc.init()
        if not self.ipc.register_client(CLIENT_CM33, self._on_reply, 1, 1):
            raise OSError("CM55 IPC client registration failed")
        self.ipc.enable_core(1)
        self.ready = True

    def _write(self, address, command, payload):
        data = encode_fields(payload)
        if len(data) > MAILBOX_SIZE - HEADER_SIZE:
            raise ValueError("native_payload_too_large")
        self.sequence = (self.sequence + 1) & 0xFFFFFFFF
        checksum = crc32(data) & 0xFFFFFFFF
        header = struct.pack(HEADER, 0, VERSION, len(data), self.sequence, command, 0, checksum)
        for offset, value in enumerate(header + data):
            self.memory[address + offset] = value
        committed = struct.pack("<I", MAGIC)
        for offset, value in enumerate(committed):
            self.memory[address + offset] = value
        return self.sequence

    def _read(self, address):
        raw = bytes(self.memory[address + offset] for offset in range(HEADER_SIZE))
        magic, version, length, sequence, command, _flags, checksum = struct.unpack(HEADER, raw)
        if magic != MAGIC or version != VERSION or sequence == self.event_sequence:
            return None
        if length > MAILBOX_SIZE - HEADER_SIZE:
            raise ValueError("native_event_too_large")
        data = bytes(self.memory[address + HEADER_SIZE + offset] for offset in range(length))
        if crc32(data) & 0xFFFFFFFF != checksum:
            raise ValueError("native_event_crc")
        self.event_sequence = sequence
        event = decode_fields(data)
        event["native_command"] = command
        return event

    def _on_reply(self, client):
        self.last_reply = (client.cmd, client.value)

    def execute(self, command):
        if not self.ready:
            return False, "native_bridge_unavailable"
        name = command["command"]
        code = COMMANDS.get(name)
        if code is None:
            return False, "unsupported_native_command"
        sequence = self._write(MAILBOX_TX, code, command)
        try:
            self.ipc.send(code, sequence, CLIENT_CM55)
        except OSError:
            # CM55 also polls the mailbox; IPC is only a low-latency wake-up.
            pass
        return True, "queued_to_cm55"

    def poll_event(self):
        if not self.ready:
            return None
        return self._read(MAILBOX_RX)


def self_check():
    sent = []

    class FakeIPC:
        def init(self):
            pass

        def register_client(self, client_id, callback, endpoint_id, endpoint_addr):
            return (client_id, endpoint_id, endpoint_addr) == (3, 1, 1)

        def enable_core(self, core):
            assert core == 1

        def send(self, command, value, client):
            sent.append((command, value, client))

    memory = {}
    bridge = NativeBridge(True, FakeIPC, memory)
    assert bridge.execute({"command": "set_resolution", "resolution": "VGA"})[0]
    assert sent == [(4, 1, 5)]
    assert memory[MAILBOX_TX] == 0x57


if __name__ == "__main__":
    self_check()
    print("native bridge: PASS")
