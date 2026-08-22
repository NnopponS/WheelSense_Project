import unittest
import sys
import types


class FakePin:
    board = types.SimpleNamespace(USER_BUTTON=0)
    IN = PULL_UP = 0

    def __init__(self, *_args):
        pass

    def value(self):
        return 0


sys.modules.setdefault(
    "machine",
    types.SimpleNamespace(I2C=object, Pin=FakePin, reset=lambda: None, unique_id=lambda: b"\0" * 8),
)

import native_bridge
import node
import provision
import runtime


class NodeContractTest(unittest.TestCase):
    def test_registration_matches_node_contract(self):
        payload = node.registration("E84_1", "NODE_1", "0.2", "10.0.0.2", native_bridge=True)
        self.assertEqual(payload["device_type"], "camera")
        self.assertEqual(payload["hardware_type"], "node")
        self.assertIn("camera", payload["capabilities"])

    def test_status_contains_e84_extension(self):
        sample = {
            "temperature_c": 25.0,
            "humidity_rh": 55.0,
            "pressure_hpa": 1005.0,
            "accel_g": (0.0, 0.0, 1.0),
            "gyro_dps": (1.0, 2.0, 3.0),
        }
        payload = node.status(
            "E84_1",
            "NODE_1",
            "0.2",
            123,
            sample,
            task={"task_id": "7", "status": "assigned"},
            nearby_staff={"name": "Nurse A"},
        )
        self.assertEqual(payload["protocolVersion"], 1)
        self.assertEqual(payload["timestampUs"], 123000)
        self.assertEqual(payload["environment"]["validMask"], 7)
        self.assertEqual(payload["task"]["task_id"], "7")
        self.assertEqual(payload["nearby_staff"]["name"], "Nurse A")

    def test_control_validation(self):
        self.assertEqual(node.parse_control({"cmd": "capture_frame"})["command"], "capture_frame")
        with self.assertRaisesRegex(node.CommandError, "invalid_interval"):
            node.parse_control({"command": "start_stream", "interval_ms": 20})
        with self.assertRaisesRegex(node.CommandError, "missing_task_title"):
            node.parse_control({"command": "assign_task", "task_id": "1"})
        task = node.parse_control(
            {
                "command": "assign_task",
                "task_id": 7,
                "task_title": "Check patient",
                "room_name": "Room 101",
                "assigned_person_name": "Nurse A",
            }
        )
        self.assertEqual(task["task_id"], "7")
        self.assertEqual(task["caregiver_name"], "Nurse A")

    def test_config_validation(self):
        self.assertEqual(
            node.parse_config({"mqtt_broker": "broker", "mqtt_port": 1883}),
            {"mqtt_broker": "broker", "mqtt_port": 1883, "sync_only": False},
        )
        with self.assertRaisesRegex(node.CommandError, "invalid_mqtt_port"):
            node.parse_config({"mqtt_port": 70000})

    def test_native_bridge_maps_command(self):
        sent = []

        class FakeIPC:
            def init(self):
                pass

            def register_client(self, *_args):
                return True

            def enable_core(self, core):
                self.core = core

            def send(self, command, value, client):
                sent.append((command, value, client))

        memory = {}
        bridge = native_bridge.NativeBridge(True, FakeIPC, memory)
        self.assertEqual(bridge.execute({"command": "start_stream", "interval_ms": 250}), (True, "queued_to_cm55"))
        self.assertEqual(sent, [(1, 1, 5)])
        self.assertEqual(memory[native_bridge.MAILBOX_TX], 0x57)

    def test_provision_form_validation(self):
        values = provision.decode_form("ssid=Ward+WiFi&password=a%2Bb&mqtt=broker.emqx.io&port=1883")
        self.assertEqual(values["ssid"], "Ward WiFi")
        self.assertEqual(values["password"], "a+b")
        self.assertTrue(provision._valid(values))
        values["port"] = "70000"
        self.assertFalse(provision._valid(values))

    def test_headless_mode_does_not_start_cm55(self):
        config = types.SimpleNamespace(NATIVE_BRIDGE=False)
        self.assertIsNone(runtime.start_bridge(config))


if __name__ == "__main__":
    unittest.main()
