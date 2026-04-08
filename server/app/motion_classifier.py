from __future__ import annotations

"""WheelSense — XGBoost motion classifier.

Thread-safe wrapper around XGBClassifier for multi-class action
classification from IMU feature vectors. State is isolated per workspace_id.

Canonical labels:
    idle, straight, turn_left, turn_right, reverse, fall, stand_up
"""

import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger("wheelsense.motion")

_lock = threading.Lock()

_DEFAULT_MODEL_DIR = Path("data/models")

@dataclass
class _WorkspaceMotionState:
    model: Any
    label_encoder: LabelEncoder
    model_info: dict[str, Any] = field(default_factory=dict)

_ws_motion: dict[int, _WorkspaceMotionState] = {}

def _default_paths(workspace_id: int) -> tuple[Path, Path]:
    d = _DEFAULT_MODEL_DIR / f"ws_{workspace_id}"
    return d / "motion_model.json", d / "motion_labels.json"

def is_motion_model_ready(workspace_id: int | None = None) -> bool:
    """Return True if a trained model is loaded (optionally for one workspace)."""
    with _lock:
        if workspace_id is not None:
            return workspace_id in _ws_motion
        return len(_ws_motion) > 0

def get_motion_model_info(workspace_id: int | None = None) -> dict[str, Any]:
    """Return metadata about the current model."""
    with _lock:
        if workspace_id is not None:
            st = _ws_motion.get(workspace_id)
            if st is None:
                return {"trained": False, "workspace_id": workspace_id}
            return dict(st.model_info, workspace_id=workspace_id)
        if not _ws_motion:
            return {"trained": False}
        wids = sorted(_ws_motion.keys())
        return {"trained": True, "workspaces_trained": wids, "workspace_count": len(wids)}

def train_motion_model(
    feature_dicts: list[dict[str, float]],
    labels: list[str],
    workspace_id: int,
    test_size: float = 0.2,
) -> dict[str, Any]:
    """Train an XGBoost classifier on extracted feature vectors for a workspace."""
    import xgboost as xgb  # noqa: F811

    if not feature_dicts or not labels:
        raise ValueError("feature_dicts and labels must be non-empty")
    if len(feature_dicts) != len(labels):
        raise ValueError(
            f"feature_dicts ({len(feature_dicts)}) and labels ({len(labels)}) "
            "must have the same length"
        )

    feature_names = sorted(feature_dicts[0].keys())
    X = np.array([[fd[k] for k in feature_names] for fd in feature_dicts], dtype=np.float64)

    le = LabelEncoder()
    y = le.fit_transform(labels)
    n_classes = len(le.classes_)

    if len(X) < 5 or n_classes < 2:
        X_train, X_test, y_train, y_test = X, X, y, y
        logger.warning("Too few samples (%d) for train/test split, training on all", len(X))
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, stratify=y, random_state=42
        )

    clf_params: dict[str, Any] = {
        "n_estimators": 100,
        "max_depth": 6,
        "learning_rate": 0.1,
        "eval_metric": "mlogloss",
        "use_label_encoder": False,
        "verbosity": 0,
        "random_state": 42,
    }
    if n_classes > 2:
        clf_params["objective"] = "multi:softprob"
    else:
        clf_params["objective"] = "binary:logistic"

    clf = xgb.XGBClassifier(**clf_params)
    clf.fit(X_train, y_train)

    accuracy = float(clf.score(X_test, y_test))
    predictions = clf.predict(X_test)

    class_stats: dict[str, dict[str, Any]] = {}
    for cls_idx, cls_name in enumerate(le.classes_):
        mask = y_test == cls_idx
        if mask.sum() > 0:
            cls_acc = float((predictions[mask] == cls_idx).mean())
            class_stats[cls_name] = {"accuracy": cls_acc, "samples": int(mask.sum())}

    info = {
        "trained": True,
        "accuracy": accuracy,
        "n_samples": len(X),
        "n_train": len(X_train),
        "n_test": len(X_test),
        "n_classes": n_classes,
        "labels": list(le.classes_),
        "feature_names": feature_names,
        "n_features": len(feature_names),
        "class_stats": class_stats,
        "workspace_id": workspace_id,
    }

    with _lock:
        _ws_motion[workspace_id] = _WorkspaceMotionState(
            model=clf,
            label_encoder=le,
            model_info=info,
        )

    logger.info(
        "Motion model trained for workspace %s: accuracy=%.3f, samples=%d, classes=%d",
        workspace_id,
        accuracy,
        len(X),
        n_classes,
    )
    return info

def predict_motion(
    feature_dict: dict[str, float],
    workspace_id: int,
) -> dict[str, Any] | None:
    """Predict action from a single feature vector for the given workspace."""
    with _lock:
        st = _ws_motion.get(workspace_id)
        if st is None:
            return None
        model = st.model
        le = st.label_encoder
        info = st.model_info

    feature_names = info.get("feature_names", sorted(feature_dict.keys()))
    X = np.array([[feature_dict.get(k, 0.0) for k in feature_names]], dtype=np.float64)

    proba = model.predict_proba(X)[0]
    pred_idx = int(np.argmax(proba))
    pred_label = le.inverse_transform([pred_idx])[0]

    return {
        "predicted_label": pred_label,
        "confidence": float(proba[pred_idx]),
        "probabilities": {
            label: float(proba[i]) for i, label in enumerate(le.classes_)
        },
    }

def save_model(
    workspace_id: int,
    model_path: str | Path | None = None,
    encoder_path: str | Path | None = None,
) -> dict[str, str]:
    """Save trained model and label encoder to disk for a workspace."""
    with _lock:
        st = _ws_motion.get(workspace_id)
        if st is None:
            raise RuntimeError("No trained motion model to save for this workspace")
        model = st.model
        le = st.label_encoder

    mp = Path(model_path) if model_path else _default_paths(workspace_id)[0]
    ep = Path(encoder_path) if encoder_path else _default_paths(workspace_id)[1]

    mp.parent.mkdir(parents=True, exist_ok=True)
    ep.parent.mkdir(parents=True, exist_ok=True)

    model.save_model(str(mp))
    with open(ep, "w", encoding="utf-8") as f:
        json.dump({"classes": list(le.classes_)}, f)

    logger.info("Motion model saved for workspace %s to %s", workspace_id, mp)
    return {"model_path": str(mp), "encoder_path": str(ep), "workspace_id": str(workspace_id)}

def load_model(
    workspace_id: int,
    model_path: str | Path | None = None,
    encoder_path: str | Path | None = None,
) -> dict[str, Any]:
    """Load model and label encoder from disk into workspace scope."""
    import xgboost as xgb

    mp = Path(model_path) if model_path else _default_paths(workspace_id)[0]
    ep = Path(encoder_path) if encoder_path else _default_paths(workspace_id)[1]

    if not mp.exists():
        raise FileNotFoundError(f"Model file not found: {mp}")
    if not ep.exists():
        raise FileNotFoundError(f"Encoder file not found: {ep}")

    clf = xgb.XGBClassifier()
    clf.load_model(str(mp))

    with open(ep, encoding="utf-8") as f:
        data = json.load(f)

    le = LabelEncoder()
    le.classes_ = np.array(data["classes"])

    info: dict[str, Any] = {
        "trained": True,
        "labels": list(le.classes_),
        "n_classes": len(le.classes_),
        "loaded_from": str(mp),
        "workspace_id": workspace_id,
    }

    with _lock:
        _ws_motion[workspace_id] = _WorkspaceMotionState(
            model=clf,
            label_encoder=le,
            model_info=info,
        )

    logger.info("Motion model loaded for workspace %s from %s", workspace_id, mp)
    return info
