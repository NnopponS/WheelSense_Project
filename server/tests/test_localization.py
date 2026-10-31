import pytest
from app.localization import (
    train_model,
    predict_room,
    is_model_ready,
    get_model_info,
    _model_lock,
    _ws_models,
)

WS_ID = 1


@pytest.fixture(autouse=True)
def reset_model():
    with _model_lock:
        _ws_models.clear()
    yield
    with _model_lock:
        _ws_models.clear()


def test_train_model_empty():
    stats = train_model([], workspace_id=WS_ID)
    assert "error" in stats
    assert stats["error"] == "No training data provided"


def test_train_model_no_rssi():
    stats = train_model([{"room_id": 1, "room_name": "Living"}], workspace_id=WS_ID)
    assert "error" in stats
    assert stats["error"] == "No RSSI nodes found in training data"


def test_train_model_success():
    data = [
        {"room_id": 1, "room_name": "Kitchen", "rssi_vector": {"N1": -50, "N2": -80}},
        {"room_id": 1, "room_name": "Kitchen", "rssi_vector": {"N1": -45, "N2": -85}},
        {"room_id": 2, "room_name": "Bed", "rssi_vector": {"N1": -90, "N2": -40}},
        {"room_id": 2, "room_name": "Bed", "rssi_vector": {"N1": -85, "N2": -45}},
    ]
    stats = train_model(data, workspace_id=WS_ID)
    assert stats["samples"] == 4
    assert stats["rooms"] == 2
    assert "N1" in stats["node_ids"]
    assert is_model_ready(WS_ID)


def test_predict_room_no_model():
    assert predict_room({"N1": -50}, workspace_id=WS_ID) is None


def test_predict_room_success():
    data = [
        {"room_id": 1, "room_name": "Kitchen", "rssi_vector": {"N1": -50, "N2": -80}},
        {"room_id": 2, "room_name": "Bed", "rssi_vector": {"N1": -90, "N2": -40}},
    ]
    train_model(data, workspace_id=WS_ID)

    pred = predict_room({"N1": -52, "N2": -82}, workspace_id=WS_ID)
    assert pred is not None
    assert pred["room_id"] == 1
    assert pred["room_name"] == "Kitchen"
    assert "confidence" in pred
    assert pred["confidence"] > 0.5

    pred2 = predict_room({"N1": -88, "N2": -42}, workspace_id=WS_ID)
    assert pred2 is not None
    assert pred2["room_id"] == 2


def test_get_model_info():
    info = get_model_info(WS_ID)
    assert info["status"] == "not_trained"

    data = [
        {"room_id": 1, "room_name": "Kitchen", "rssi_vector": {"N1": -50}},
    ]
    train_model(data, workspace_id=WS_ID)
    info2 = get_model_info(WS_ID)
    assert info2["status"] == "ready"
    assert info2["rooms"] == 1
    assert "N1" in info2["nodes"]
