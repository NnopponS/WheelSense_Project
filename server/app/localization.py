from __future__ import annotations

"""WheelSense Server — Room localization using KNN.

The model is trained on labeled RSSI fingerprint data and predicts rooms
from incoming RSSI vectors. Models are isolated per workspace_id.
Thread-safe for use from async MQTT handler.
"""

import logging
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np

from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger("wheelsense.localization")

_model_lock = threading.Lock()

@dataclass
class _WorkspaceKnnState:
    model: KNeighborsClassifier
    label_encoder: LabelEncoder
    node_order: list[str]
    room_id_map: dict[int, dict]

# Per-workspace KNN state (workspace_id -> trained model bundle)
_ws_models: dict[int, _WorkspaceKnnState] = {}

def train_model(training_data: list[dict], workspace_id: int) -> dict:
    """Train KNN model on labeled RSSI data for a workspace.

    Args:
        training_data: List of dicts with keys:
            - room_id: int
            - room_name: str
            - rssi_vector: dict[str, int]  e.g. {"WSN_001": -65, "WSN_002": -72}
        workspace_id: Tenant scope for this model.

    Returns:
        dict with training stats: {"samples": N, "rooms": M, "nodes": K}
    """
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
    id_map: dict[int, dict] = {}
    for encoded_val in range(len(le.classes_)):
        label = le.classes_[encoded_val]
        if label in room_info:
            id_map[encoded_val] = room_info[label]

    state = _WorkspaceKnnState(
        model=knn,
        label_encoder=le,
        node_order=node_order,
        room_id_map=id_map,
    )

    with _model_lock:
        _ws_models[workspace_id] = state

    stats = {
        "samples": len(X_arr),
        "rooms": len(le.classes_),
        "nodes": len(node_order),
        "node_ids": node_order,
        "k": k,
        "workspace_id": workspace_id,
    }
    logger.info("KNN model trained for workspace %s: %s", workspace_id, stats)
    return stats

def predict_room(rssi_vector: dict[str, int], workspace_id: int) -> dict[str, Any] | None:
    """Predict room from an RSSI vector for the given workspace.

    Args:
        rssi_vector: {"WSN_001": -65, "WSN_002": -72, ...}
        workspace_id: Model scope.

    Returns:
        {"room_id": 1, "room_name": "Living Room", "confidence": 0.87, "model_type": "knn"}
        or None if no model is trained for this workspace.
    """
    with _model_lock:
        state = _ws_models.get(workspace_id)
        if state is None:
            return None
        model = state.model
        node_order = state.node_order
        id_map = state.room_id_map

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

def is_model_ready(workspace_id: int | None = None) -> bool:
    """Return True if a trained KNN model exists (optionally for one workspace)."""
    with _model_lock:
        if workspace_id is not None:
            return workspace_id in _ws_models
        return len(_ws_models) > 0

def get_model_info(workspace_id: int | None = None) -> dict:
    """Return model metadata; if workspace_id is set, scope to that workspace."""
    with _model_lock:
        if workspace_id is not None:
            state = _ws_models.get(workspace_id)
            if state is None:
                return {"status": "not_trained", "workspace_id": workspace_id}
            return {
                "status": "ready",
                "workspace_id": workspace_id,
                "nodes": state.node_order,
                "rooms": len(state.room_id_map),
                "k": state.model.n_neighbors,
            }
        if not _ws_models:
            return {"status": "not_trained"}
        # Aggregate summary when no workspace specified (e.g. legacy callers)
        wids = sorted(_ws_models.keys())
        return {
            "status": "ready",
            "workspaces_trained": wids,
            "workspace_count": len(wids),
        }
