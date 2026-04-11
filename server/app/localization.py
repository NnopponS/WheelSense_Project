from __future__ import annotations

"""WheelSense room localization with workspace KNN and max-RSSI fallback."""

import logging
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import LabelEncoder

from app.models.core import Room
from app.models.telemetry import LocalizationConfig

logger = logging.getLogger("wheelsense.localization")

LOCALIZATION_STRATEGIES = {"knn", "max_rssi"}
DEFAULT_LOCALIZATION_STRATEGY = "max_rssi"

_model_lock = threading.Lock()


@dataclass
class _WorkspaceKnnState:
    model: KNeighborsClassifier
    label_encoder: LabelEncoder
    node_order: list[str]
    room_id_map: dict[int, dict]


_ws_models: dict[int, _WorkspaceKnnState] = {}


def normalize_strategy(raw: str | None) -> str:
    if raw is None:
        return DEFAULT_LOCALIZATION_STRATEGY
    value = str(raw).strip().lower()
    if value not in LOCALIZATION_STRATEGIES:
        return DEFAULT_LOCALIZATION_STRATEGY
    return value


async def get_or_create_localization_config(
    session: AsyncSession,
    workspace_id: int,
) -> LocalizationConfig:
    row = (
        await session.execute(
            select(LocalizationConfig).where(LocalizationConfig.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    row = LocalizationConfig(
        workspace_id=workspace_id,
        strategy=DEFAULT_LOCALIZATION_STRATEGY,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def get_localization_strategy(
    session: AsyncSession,
    workspace_id: int,
) -> str:
    row = await get_or_create_localization_config(session, workspace_id)
    return normalize_strategy(row.strategy)


async def set_localization_strategy(
    session: AsyncSession,
    workspace_id: int,
    *,
    strategy: str,
    updated_by_user_id: int | None = None,
) -> LocalizationConfig:
    row = await get_or_create_localization_config(session, workspace_id)
    row.strategy = normalize_strategy(strategy)
    row.updated_by_user_id = updated_by_user_id
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


def train_model(training_data: list[dict], workspace_id: int) -> dict:
    if not training_data:
        return {"error": "No training data provided"}

    all_nodes: set[str] = set()
    for sample in training_data:
        all_nodes.update(sample.get("rssi_vector", {}).keys())

    node_order = sorted(all_nodes)
    if not node_order:
        return {"error": "No RSSI nodes found in training data"}

    X = []
    y = []
    room_info: dict[str, dict] = {}

    for sample in training_data:
        rssi = sample.get("rssi_vector", {})
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

    le = LabelEncoder()
    y_encoded = le.fit_transform(y_arr)

    k = min(5, len(X_arr))
    knn = KNeighborsClassifier(n_neighbors=k, weights="distance", metric="euclidean")
    knn.fit(X_arr, y_encoded)

    id_map: dict[int, dict] = {}
    for encoded_val in range(len(le.classes_)):
        label = le.classes_[encoded_val]
        if label in room_info:
            id_map[encoded_val] = room_info[label]

    with _model_lock:
        _ws_models[workspace_id] = _WorkspaceKnnState(
            model=knn,
            label_encoder=le,
            node_order=node_order,
            room_id_map=id_map,
        )

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
    with _model_lock:
        state = _ws_models.get(workspace_id)
        if state is None:
            return None
        model = state.model
        node_order = state.node_order
        id_map = state.room_id_map

    features = [rssi_vector.get(node, -100) for node in node_order]
    X = np.array([features], dtype=np.float32)

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


async def predict_room_max_rssi(
    session: AsyncSession,
    workspace_id: int,
    rssi_vector: dict[str, int],
) -> dict[str, Any] | None:
    if not rssi_vector:
        return None
    node_device_id, strongest_rssi = max(rssi_vector.items(), key=lambda item: item[1])
    room = (
        await session.execute(
            select(Room).where(
                Room.workspace_id == workspace_id,
                Room.node_device_id == node_device_id,
            )
        )
    ).scalar_one_or_none()
    room_id = room.id if room else None
    room_name = room.name if room else ""
    confidence = max(0.0, min(1.0, (float(strongest_rssi) + 100.0) / 60.0))
    return {
        "room_id": room_id,
        "room_name": room_name,
        "confidence": confidence,
        "model_type": "max_rssi",
        "strongest_node_id": node_device_id,
        "strongest_rssi": strongest_rssi,
    }


async def predict_room_with_strategy(
    session: AsyncSession,
    workspace_id: int,
    rssi_vector: dict[str, int],
    *,
    strategy: str | None = None,
) -> dict[str, Any] | None:
    strategy_name = normalize_strategy(strategy or await get_localization_strategy(session, workspace_id))
    if strategy_name == "knn":
        result = predict_room(rssi_vector, workspace_id=workspace_id)
        if result is not None:
            result["strategy"] = "knn"
            return result
        fallback = await predict_room_max_rssi(session, workspace_id, rssi_vector)
        if fallback is not None:
            fallback["strategy"] = "knn"
            fallback["fallback_reason"] = "knn_not_trained"
        return fallback

    result = await predict_room_max_rssi(session, workspace_id, rssi_vector)
    if result is not None:
        result["strategy"] = "max_rssi"
    return result


def is_model_ready(workspace_id: int | None = None) -> bool:
    with _model_lock:
        if workspace_id is not None:
            return workspace_id in _ws_models
        return len(_ws_models) > 0


def get_model_info(workspace_id: int | None = None) -> dict:
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
        wids = sorted(_ws_models.keys())
        return {
            "status": "ready",
            "workspaces_trained": wids,
            "workspace_count": len(wids),
        }
