"""WheelSense — XGBoost motion classifier.

Thread-safe wrapper around XGBClassifier for multi-class action
classification from IMU feature vectors.  Follows the same pattern
as localization.py (lock-guarded, train/predict/save/load).

Canonical labels:
    idle, straight, turn_left, turn_right, reverse, fall, stand_up
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger("wheelsense.motion")

# ── Module-level state (thread-safe via _lock) ────────────────────
_lock = threading.Lock()
_model: Any | None = None          # XGBClassifier instance
_label_encoder: LabelEncoder | None = None
_model_info: dict[str, Any] = {"trained": False}

# Default persistence path
_DEFAULT_MODEL_DIR = Path("data/models")
_DEFAULT_MODEL_PATH = _DEFAULT_MODEL_DIR / "motion_model.json"
_DEFAULT_ENCODER_PATH = _DEFAULT_MODEL_DIR / "motion_labels.json"


def is_motion_model_ready() -> bool:
    """Return True if a trained model is loaded."""
    with _lock:
        return _model is not None


def get_motion_model_info() -> dict[str, Any]:
    """Return metadata about the current model."""
    with _lock:
        return dict(_model_info)


def train_motion_model(
    feature_dicts: list[dict[str, float]],
    labels: list[str],
    test_size: float = 0.2,
) -> dict[str, Any]:
    """Train an XGBoost classifier on extracted feature vectors.

    Args:
        feature_dicts: List of feature dicts from feature_engineering.extract_features.
        labels: Corresponding action labels (same length).
        test_size: Fraction held out for evaluation (0–1).

    Returns:
        Dict with training stats (accuracy, n_samples, labels, etc.).

    Raises:
        ValueError: If inputs are empty or mismatched.
    """
    # Lazy import to avoid startup cost when model is not used
    import xgboost as xgb  # noqa: F811

    if not feature_dicts or not labels:
        raise ValueError("feature_dicts and labels must be non-empty")
    if len(feature_dicts) != len(labels):
        raise ValueError(
            f"feature_dicts ({len(feature_dicts)}) and labels ({len(labels)}) "
            "must have the same length"
        )

    # Build X matrix (consistent column order)
    feature_names = sorted(feature_dicts[0].keys())
    X = np.array([[fd[k] for k in feature_names] for fd in feature_dicts], dtype=np.float64)

    # Encode labels
    le = LabelEncoder()
    y = le.fit_transform(labels)
    n_classes = len(le.classes_)

    # Train/test split
    if len(X) < 5 or n_classes < 2:
        # Too few samples for split — train on all data
        X_train, X_test, y_train, y_test = X, X, y, y
        logger.warning("Too few samples (%d) for train/test split, training on all", len(X))
    else:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, stratify=y, random_state=42
        )

    # Train XGBoost
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

    # Evaluate
    accuracy = float(clf.score(X_test, y_test))
    predictions = clf.predict(X_test)

    # Per-class accuracy
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
    }

    with _lock:
        global _model, _label_encoder, _model_info
        _model = clf
        _label_encoder = le
        _model_info = info

    logger.info("Motion model trained: accuracy=%.3f, samples=%d, classes=%d", accuracy, len(X), n_classes)
    return info


def predict_motion(feature_dict: dict[str, float]) -> dict[str, Any] | None:
    """Predict action from a single feature vector.

    Returns:
        Dict with predicted_label, confidence, and all class probabilities,
        or None if model is not ready.
    """
    with _lock:
        model = _model
        le = _label_encoder
        info = _model_info

    if model is None or le is None:
        return None

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
    model_path: str | Path | None = None,
    encoder_path: str | Path | None = None,
) -> dict[str, str]:
    """Save trained model and label encoder to disk.

    Returns:
        Dict with saved file paths.

    Raises:
        RuntimeError: If no model is trained.
    """
    with _lock:
        model = _model
        le = _label_encoder

    if model is None or le is None:
        raise RuntimeError("No trained motion model to save")

    mp = Path(model_path or _DEFAULT_MODEL_PATH)
    ep = Path(encoder_path or _DEFAULT_ENCODER_PATH)

    mp.parent.mkdir(parents=True, exist_ok=True)
    ep.parent.mkdir(parents=True, exist_ok=True)

    model.save_model(str(mp))
    with open(ep, "w", encoding="utf-8") as f:
        json.dump({"classes": list(le.classes_)}, f)

    logger.info("Motion model saved to %s", mp)
    return {"model_path": str(mp), "encoder_path": str(ep)}


def load_model(
    model_path: str | Path | None = None,
    encoder_path: str | Path | None = None,
) -> dict[str, Any]:
    """Load model and label encoder from disk.

    Returns:
        Model info dict.

    Raises:
        FileNotFoundError: If files don't exist.
    """
    import xgboost as xgb

    mp = Path(model_path or _DEFAULT_MODEL_PATH)
    ep = Path(encoder_path or _DEFAULT_ENCODER_PATH)

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
    }

    with _lock:
        global _model, _label_encoder, _model_info
        _model = clf
        _label_encoder = le
        _model_info = info

    logger.info("Motion model loaded from %s", mp)
    return info
