"""WheelSense Server — Room localization using KNN.

The model is trained on labeled RSSI fingerprint data and predicts rooms
from incoming RSSI vectors. Thread-safe for use from async MQTT handler.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger("wheelsense.localization")

_model_lock = threading.Lock()
_model: KNeighborsClassifier | None = None
_label_encoder: LabelEncoder | None = None
_node_order: list[str] = []
_room_id_map: dict[int, dict] = {}  # encoded_label -> {"room_id": ..., "room_name": ...}


def train_model(training_data: list[dict]) -> dict:
    """Train KNN model on labeled RSSI data.

    Args:
        training_data: List of dicts with keys:
            - room_id: int
            - room_name: str
            - rssi_vector: dict[str, int]  e.g. {"WSN_001": -65, "WSN_002": -72}

    Returns:
        dict with training stats: {"samples": N, "rooms": M, "nodes": K}
    """
    global _model, _label_encoder, _node_order, _room_id_map

    if not training_data:
        return {"error": "No training data provided"}

    # Collect all unique node IDs
    all_nodes: set[str] = set()
    for sample in training_data:
        all_nodes.update(sample.get("rssi_vector", {}).keys())

    node_order = sorted(all_nodes)
    if not node_order:
        return {"error": "No RSSI nodes found in training data"}

    # Build feature matrix and labels
    X = []
    y = []
    room_info: dict[str, dict] = {}

    for sample in training_data:
        rssi = sample.get("rssi_vector", {})
        # Build feature vector: RSSI value for each node, -100 if not visible
        features = [rssi.get(node, -100) for node in node_order]
        X.append(features)

        room_label = f"room_{sample['room_id']}"
        y.append(room_label)
        room_info[room_label] = {
            "room_id": sample["room_id"],
            "room_name": sample.get("room_name", ""),
        }

    X_arr = np.array(X, dtype=np.float32)
    y_arr = np.array(y)

    # Train KNN
    le = LabelEncoder()
    y_encoded = le.fit_transform(y_arr)

    k = min(5, len(X_arr))
    knn = KNeighborsClassifier(n_neighbors=k, weights="distance", metric="euclidean")
    knn.fit(X_arr, y_encoded)

    # Build room_id_map
    id_map = {}
    for encoded_val in range(len(le.classes_)):
        label = le.classes_[encoded_val]
        if label in room_info:
            id_map[encoded_val] = room_info[label]

    with _model_lock:
        _model = knn
        _label_encoder = le
        _node_order = node_order
        _room_id_map = id_map

    stats = {
        "samples": len(X_arr),
        "rooms": len(le.classes_),
        "nodes": len(node_order),
        "node_ids": node_order,
        "k": k,
    }
    logger.info("Model trained: %s", stats)
    return stats


def predict_room(rssi_vector: dict[str, int]) -> dict[str, Any] | None:
    """Predict room from an RSSI vector.

    Args:
        rssi_vector: {"WSN_001": -65, "WSN_002": -72, ...}

    Returns:
        {"room_id": 1, "room_name": "Living Room", "confidence": 0.87, "model_type": "knn"}
        or None if no model is trained.
    """
    with _model_lock:
        model = _model
        le = _label_encoder
        node_order = _node_order
        id_map = _room_id_map

    if model is None or le is None:
        return None

    # Build feature vector
    features = [rssi_vector.get(node, -100) for node in node_order]
    X = np.array([features], dtype=np.float32)

    # Predict
    predicted_encoded = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]
    confidence = float(probabilities[predicted_encoded])

    room = id_map.get(int(predicted_encoded), {"room_id": -1, "room_name": "Unknown"})

    return {
        "room_id": room["room_id"],
        "room_name": room["room_name"],
        "confidence": confidence,
        "model_type": "knn",
    }


def is_model_ready() -> bool:
    with _model_lock:
        return _model is not None


def get_model_info() -> dict:
    with _model_lock:
        if _model is None:
            return {"status": "not_trained"}
        return {
            "status": "ready",
            "nodes": _node_order,
            "rooms": len(_room_id_map),
            "k": _model.n_neighbors,
        }
