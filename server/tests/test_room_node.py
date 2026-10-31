import asyncio
import json

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.models.activity import Alert
from app.models.core import Device, DeviceCommandDispatch, Room, SmartDevice, Workspace
from app.services import room_node
from app.services.activity import alert_service
from app.mqtt_handler import _handle_camera_event
from tests.conftest import _get_session_factory

_SessionFactory = _get_session_factory()


@pytest.fixture(autouse=True)
def _reset_fall_cooldown():
    room_node._fall_event_mono.clear()
    yield
    room_node._fall_event_mono.clear()


@pytest_asyncio.fixture
async def active_workspace():
    async with _SessionFactory() as session:
        ws = Workspace(name="E84 Test WS", is_active=True)
        session.add(ws)
        await session.commit()
        await session.refresh(ws)
        return ws


async def _make_room_and_node(
    ws_id: int,
    *,
    room_name: str = "Living Room",
    node_id: str = "CAM_E84_0001",
    bind_via: str = "config",
) -> tuple[int, str]:
    """Create a room + E84 screen device; returns (room_id, device_id)."""
    async with _SessionFactory() as session:
        room = Room(
            workspace_id=ws_id,
            name=room_name,
            node_device_id="MODEL_NODE_01" if bind_via == "config" else node_id,
        )
        session.add(room)
        await session.flush()
        cfg: dict = {"e84_room_node": True}
        if bind_via == "config":
            cfg["room_id"] = room.id
        device = Device(
            workspace_id=ws_id,
            device_id=node_id,
            device_type="camera",
            hardware_type="node",
            display_name="E84 Room Screen",
            config=cfg,
        )
        session.add(device)
        await session.commit()
        return room.id, device.device_id


async def _add_smart_device(
    ws_id: int, room_id: int, *, name="Ceiling light", dtype="light", state="off"
) -> int:
    async with _SessionFactory() as session:
        sd = SmartDevice(
            workspace_id=ws_id,
            room_id=room_id,
            name=name,
            ha_entity_id=f"{dtype}.{name.lower().replace(' ', '_')}",
            device_type=dtype,
            is_active=True,
            state=state,
            config={"seed": True},
        )
        session.add(sd)
        await session.commit()
        await session.refresh(sd)
        return sd.id


async def _get_device(ws_id: int, device_id: str) -> Device:
    async with _SessionFactory() as session:
        q = await session.execute(
            select(Device).where(
                Device.workspace_id == ws_id, Device.device_id == device_id
            )
        )
        return q.scalar_one()


def _published(pub: AsyncMock) -> list[tuple[str, dict]]:
    return [(c.args[0], c.args[1]) for c in pub.await_args_list]


@pytest.mark.asyncio
async def test_fall_detected_creates_alert_and_pushes_control(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    device = await _get_device(active_workspace.id, device_id)

    event = {
        "event_id": "CAM_E84_0001-5a1c-3",
        "type": "fall_detected",
        "source": "test",
        "sitting_confidence_pct": 31,
    }
    async with _SessionFactory() as session:
        with patch(
            "app.services.room_node.mqtt_publish_json", new_callable=AsyncMock
        ) as pub:
            await room_node.handle_room_node_event(session, device, event)

        calls = _published(pub)
        assert len(calls) == 1
        topic, body = calls[0]
        assert topic == f"WheelSense/camera/{device_id}/control"
        assert body["command"] == "alert"
        assert body["status"] == "active"
        assert body["type"] == "fall"
        assert body["command_id"]

    async with _SessionFactory() as session:
        alert = (
            await session.execute(select(Alert).where(Alert.workspace_id == active_workspace.id))
        ).scalar_one()
        assert alert.alert_type == "fall"
        assert alert.severity == "critical"
        assert alert.status == "active"
        assert alert.data["room_id"] == room_id
        assert alert.data["event_id"] == "CAM_E84_0001-5a1c-3"
        assert alert.data["source"] == "e84_test"
        assert alert.id == body["alert_id"]


@pytest.mark.asyncio
async def test_fall_detected_duplicate_event_id_dedupes(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    device = await _get_device(active_workspace.id, device_id)
    event = {
        "event_id": "CAM_E84_0001-dup-1",
        "type": "fall_detected",
        "source": "edge_ai",
    }

    with patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub:
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(session, device, event)
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(session, device, dict(event))

    async with _SessionFactory() as session:
        alerts = (
            await session.execute(select(Alert).where(Alert.workspace_id == active_workspace.id))
        ).scalars().all()
        assert len(alerts) == 1
    # Both deliveries still answer the node with the same alert_id.
    pushed = [b["alert_id"] for t, b in _published(pub) if b.get("command") == "alert"]
    assert pushed == [alerts[0].id, alerts[0].id]


@pytest.mark.asyncio
async def test_alert_ack_resolves_alert_and_clears_screen(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    async with _SessionFactory() as session:
        alert = Alert(
            workspace_id=active_workspace.id,
            patient_id=None,
            device_id=device_id,
            alert_type="fall",
            severity="critical",
            title="Fall Detected in Living Room",
            data={"room_id": room_id, "event_id": "CAM_E84_0001-fall-9"},
            status="active",
        )
        session.add(alert)
        await session.commit()
        alert_id = alert.id

    device = await _get_device(active_workspace.id, device_id)
    with patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub:
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(
                session,
                device,
                {"type": "alert_ack", "alert_id": alert_id, "fall_event_id": "CAM_E84_0001-fall-9"},
            )

    async with _SessionFactory() as session:
        alert = await session.get(Alert, alert_id)
        assert alert.status == "resolved"
        assert "room node" in (alert.resolution_note or "")

    calls = _published(pub)
    assert any(
        body.get("command") == "alert" and body.get("status") == "none"
        for _, body in calls
    )


@pytest.mark.asyncio
async def test_alert_ack_matches_on_fall_event_id_when_alert_id_zero(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    async with _SessionFactory() as session:
        alert = Alert(
            workspace_id=active_workspace.id,
            alert_type="fall",
            severity="critical",
            title="Fall",
            data={"room_id": room_id, "event_id": "CAM_E84_0001-ev-77"},
            status="active",
        )
        session.add(alert)
        await session.commit()
        alert_id = alert.id

    device = await _get_device(active_workspace.id, device_id)
    with patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock):
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(
                session,
                device,
                {"type": "alert_ack", "alert_id": 0, "fall_event_id": "CAM_E84_0001-ev-77"},
            )

    async with _SessionFactory() as session:
        assert (await session.get(Alert, alert_id)).status == "resolved"


@pytest.mark.asyncio
async def test_home_command_controls_room_device_and_confirms(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    light_id = await _add_smart_device(active_workspace.id, room_id)
    device = await _get_device(active_workspace.id, device_id)

    with (
        patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub,
        patch(
            "app.hardware_bridge.hardware_bridge.publish_cucumber_control",
            new_callable=AsyncMock,
            return_value=True,
        ),
    ):
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(
                session,
                device,
                {
                    "type": "home_command",
                    "smart_device_id": light_id,
                    "action": "turn_on",
                },
            )

    async with _SessionFactory() as session:
        sd = await session.get(SmartDevice, light_id)
        assert sd.state == "on"

    home_states = [
        body for _, body in _published(pub) if body.get("command") == "home_state"
    ]
    assert len(home_states) == 1
    entry = home_states[0]["devices"][0]
    assert entry["id"] == light_id
    assert entry["state"] == "on"
    assert entry["type"] == "light"


@pytest.mark.asyncio
async def test_home_command_rejects_device_outside_room(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    other_light_id = await _add_smart_device(
        active_workspace.id, room_id, name="Room light"
    )
    # A device in a different room must not be controllable through this node.
    async with _SessionFactory() as session:
        other_room = Room(workspace_id=active_workspace.id, name="Bedroom")
        session.add(other_room)
        await session.flush()
        sd = SmartDevice(
            workspace_id=active_workspace.id,
            room_id=other_room.id,
            name="Bedroom light",
            ha_entity_id="light.bedroom",
            device_type="light",
            is_active=True,
            state="off",
            config={"seed": True},
        )
        session.add(sd)
        await session.commit()
        foreign_id = sd.id

    device = await _get_device(active_workspace.id, device_id)
    with patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub:
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(
                session,
                device,
                {"type": "home_command", "smart_device_id": foreign_id, "action": "turn_on"},
            )

    async with _SessionFactory() as session:
        assert (await session.get(SmartDevice, foreign_id)).state == "off"

    # Node still gets the confirmed home_state so it reverts its optimistic tile.
    home_states = [
        body for _, body in _published(pub) if body.get("command") == "home_state"
    ]
    assert len(home_states) == 1


@pytest.mark.asyncio
async def test_resync_sends_assignment_alert_and_home_state(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    await _add_smart_device(active_workspace.id, room_id, name="Air conditioner", dtype="climate", state="cool")
    async with _SessionFactory() as session:
        session.add(
            Alert(
                workspace_id=active_workspace.id,
                alert_type="fall",
                severity="critical",
                title="Fall",
                data={"room_id": room_id},
                status="active",
            )
        )
        await session.commit()

    with patch(
        "app.services.room_node.AsyncSessionLocal", new=_SessionFactory
    ), patch(
        "app.services.room_node.mqtt_publish_json", new_callable=AsyncMock
    ) as pub:
        await room_node.resync_room_node(active_workspace.id, device_id)

    calls = _published(pub)
    topics = {t.split("/")[-1] for t, _ in calls}
    assert topics == {"assignment", "control"}

    assignment = next(b for t, b in calls if t.endswith("/assignment"))
    assert assignment["room_name"] == "Living Room"
    assert assignment["room_id"] == room_id
    assert "occupancy" in assignment
    assert "patient_name" in assignment
    # assignment is retained so the node survives broker restarts.
    retain_flags = [c.kwargs.get("retain") for c in pub.await_args_list if c.args[0].endswith("/assignment")]
    assert retain_flags == [True]

    controls = [b for t, b in calls if t.endswith("/control")]
    commands = {b["command"] for b in controls}
    assert commands == {"alert", "home_state"}
    alert_cmd = next(b for b in controls if b["command"] == "alert")
    assert alert_cmd["status"] == "active"
    home = next(b for b in controls if b["command"] == "home_state")
    assert home["devices"][0]["type"] == "climate"
    assert "temperature" not in home["devices"][0] or home["devices"][0]["temperature"]


@pytest.mark.asyncio
async def test_web_resolve_clears_node_screen(active_workspace):
    """Resolving on the web sends `alert status:none` to the room's screens."""
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    async with _SessionFactory() as session:
        alert = Alert(
            workspace_id=active_workspace.id,
            alert_type="fall",
            severity="critical",
            title="Fall",
            data={"room_id": room_id},
            status="active",
        )
        session.add(alert)
        await session.commit()
        alert_id = alert.id

    with (
        patch("app.services.room_node.AsyncSessionLocal", new=_SessionFactory),
        patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub,
    ):
        async with _SessionFactory() as session:
            await alert_service.resolve(session, ws_id=active_workspace.id, alert_id=alert_id)
        await asyncio.sleep(0.05)

    assert any(
        body.get("command") == "alert" and body.get("status") == "none"
        for _, body in _published(pub)
    )


@pytest.mark.asyncio
async def test_camera_event_topic_routes_by_node_id(active_workspace):
    """_handle_camera_event resolves the node from the topic and handles it."""
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    payload = json.dumps(
        {"event_id": f"{device_id}-e1", "type": "fall_detected", "source": "test"}
    ).encode()

    with (
        patch("app.mqtt_handler.AsyncSessionLocal", new=_SessionFactory),
        patch("app.services.room_node.AsyncSessionLocal", new=_SessionFactory),
        patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock) as pub,
    ):
        await _handle_camera_event(f"WheelSense/camera/{device_id}/event", payload)

    async with _SessionFactory() as session:
        alerts = (
            await session.execute(select(Alert).where(Alert.workspace_id == active_workspace.id))
        ).scalars().all()
        assert len(alerts) == 1
        assert alerts[0].device_id == device_id
        # The node is flagged as a screen-capable room node for future pushes.
        device = (
            await session.execute(
                select(Device).where(Device.device_id == device_id)
            )
        ).scalar_one()
        assert (device.config or {}).get("e84_room_node") is True

    assert any(
        body.get("command") == "alert" and body.get("status") == "active"
        for _, body in _published(pub)
    )


@pytest.mark.asyncio
async def test_node_bound_via_room_node_device_id_also_works(active_workspace):
    """An E84 that IS the room's node_device_id resolves the room too."""
    room_id, device_id = await _make_room_and_node(
        active_workspace.id, node_id="CAM_E84_0002", bind_via="node_device_id"
    )
    device = await _get_device(active_workspace.id, device_id)
    async with _SessionFactory() as session:
        room = await room_node.resolve_node_room(session, device)
        assert room is not None and room.id == room_id


@pytest.mark.asyncio
async def test_dispatch_rows_record_node_control(active_workspace):
    room_id, device_id = await _make_room_and_node(active_workspace.id)
    device = await _get_device(active_workspace.id, device_id)
    with patch("app.services.room_node.mqtt_publish_json", new_callable=AsyncMock):
        async with _SessionFactory() as session:
            await room_node.handle_room_node_event(
                session,
                device,
                {"event_id": f"{device_id}-e2", "type": "fall_detected"},
            )
    async with _SessionFactory() as session:
        rows = (
            await session.execute(
                select(DeviceCommandDispatch).where(
                    DeviceCommandDispatch.device_id == device_id
                )
            )
        ).scalars().all()
        assert len(rows) >= 1
        assert rows[0].topic == f"WheelSense/camera/{device_id}/control"
        assert rows[0].payload["command"] == "alert"
