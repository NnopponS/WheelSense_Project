from __future__ import annotations

"""WheelSense — IMU feature engineering for motion classification.

Transforms raw IMU time-series windows into feature vectors
suitable for XGBoost classification. Each window produces a single
feature vector with statistical and frequency-domain features.

IMU Rate: 20 Hz (50ms interval) — see firmware Config.h
Default window: 40 samples = 2 seconds
"""

from typing import Any

import numpy as np
from numpy.typing import NDArray

# Canonical axis names expected in the IMU data dicts
_IMU_AXES = ("ax", "ay", "az", "gx", "gy", "gz")

# Default window/overlap tuned for 20 Hz firmware sampling rate
DEFAULT_WINDOW_SIZE = 40   # 2 sec @ 20 Hz
DEFAULT_OVERLAP = 0.5      # 50 % overlap → stride of 20 samples

def extract_features(samples: list[dict[str, Any]]) -> dict[str, float]:
    """Extract features from a single window of IMU samples.

    Args:
        samples: List of dicts with keys ax, ay, az, gx, gy, gz
                 (and optionally distance_m, velocity_ms, accel_ms2).

    Returns:
        Feature dict with ~35 named features.

    Raises:
        ValueError: If samples is empty or missing required keys.
    """
    if not samples:
        raise ValueError("Cannot extract features from empty sample list")

    # Build axis arrays
    axes: dict[str, NDArray[np.float64]] = {}
    for axis in _IMU_AXES:
        axes[axis] = np.array([s.get(axis, 0.0) for s in samples], dtype=np.float64)

    features: dict[str, float] = {}

    # --- Per-axis statistical features ---
    for axis in _IMU_AXES:
        arr = axes[axis]
        features[f"{axis}_mean"] = float(np.mean(arr))
        features[f"{axis}_std"] = float(np.std(arr))
        features[f"{axis}_min"] = float(np.min(arr))
        features[f"{axis}_max"] = float(np.max(arr))
        features[f"{axis}_range"] = float(np.ptp(arr))  # max - min

    # --- Accelerometer magnitude ---
    accel_mag = np.sqrt(axes["ax"] ** 2 + axes["ay"] ** 2 + axes["az"] ** 2)
    features["accel_mag_mean"] = float(np.mean(accel_mag))
    features["accel_mag_std"] = float(np.std(accel_mag))
    features["accel_mag_max"] = float(np.max(accel_mag))

    # --- Gyroscope magnitude ---
    gyro_mag = np.sqrt(axes["gx"] ** 2 + axes["gy"] ** 2 + axes["gz"] ** 2)
    features["gyro_mag_mean"] = float(np.mean(gyro_mag))
    features["gyro_mag_std"] = float(np.std(gyro_mag))
    features["gyro_mag_max"] = float(np.max(gyro_mag))

    # --- Zero-crossing rate (accel X as proxy for oscillation) ---
    for axis in ("ax", "az", "gx", "gz"):
        arr = axes[axis]
        centered = arr - np.mean(arr)
        if len(centered) > 1:
            crossings = np.sum(np.diff(np.sign(centered)) != 0)
            features[f"{axis}_zcr"] = float(crossings / len(centered))
        else:
            features[f"{axis}_zcr"] = 0.0

    # --- Motion-derived features (if present) ---
    dist_arr = np.array([s.get("distance_m", 0.0) for s in samples], dtype=np.float64)
    vel_arr = np.array([s.get("velocity_ms", 0.0) for s in samples], dtype=np.float64)

    features["distance_total"] = float(np.sum(np.abs(np.diff(dist_arr)))) if len(dist_arr) > 1 else 0.0
    features["velocity_mean"] = float(np.mean(vel_arr))
    features["velocity_max"] = float(np.max(np.abs(vel_arr)))

    return features

def create_sliding_windows(
    samples: list[dict[str, Any]],
    window_size: int = DEFAULT_WINDOW_SIZE,
    overlap: float = DEFAULT_OVERLAP,
) -> list[list[dict[str, Any]]]:
    """Split a time-series into overlapping windows.

    Args:
        samples: Full list of IMU sample dicts, ordered by time.
        window_size: Number of samples per window (default 40 = 2 sec @ 20 Hz).
        overlap: Fraction of overlap between consecutive windows (0-1).

    Returns:
        List of windows, each window is a list of sample dicts.
    """
    if window_size <= 0:
        raise ValueError(f"window_size must be positive, got {window_size}")
    if not (0.0 <= overlap < 1.0):
        raise ValueError(f"overlap must be in [0, 1), got {overlap}")

    stride = max(1, int(window_size * (1 - overlap)))
    windows: list[list[dict[str, Any]]] = []

    for start in range(0, len(samples) - window_size + 1, stride):
        windows.append(samples[start : start + window_size])

    return windows

def extract_dataset(
    samples: list[dict[str, Any]],
    window_size: int = DEFAULT_WINDOW_SIZE,
    overlap: float = DEFAULT_OVERLAP,
) -> list[dict[str, float]]:
    """Convenience: create windows then extract features for each.

    Returns:
        List of feature dicts, one per window.
    """
    windows = create_sliding_windows(samples, window_size, overlap)
    return [extract_features(w) for w in windows]
