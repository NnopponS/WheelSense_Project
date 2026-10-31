"""Tests for app.feature_engineering module."""

import pytest
from app.feature_engineering import (
    extract_features,
    create_sliding_windows,
    extract_dataset,
    DEFAULT_WINDOW_SIZE,
)


def _make_samples(n: int, label: str = "test") -> list[dict]:
    """Create n synthetic IMU samples."""
    import math
    return [
        {
            "ax": math.sin(i * 0.1) * 2,
            "ay": math.cos(i * 0.1),
            "az": 9.8 + math.sin(i * 0.3) * 0.5,
            "gx": i * 0.01,
            "gy": -i * 0.005,
            "gz": math.sin(i * 0.2) * 10,
            "distance_m": i * 0.02,
            "velocity_ms": 0.5 + math.sin(i * 0.05) * 0.3,
        }
        for i in range(n)
    ]


class TestExtractFeatures:
    def test_basic_output(self):
        samples = _make_samples(40)
        features = extract_features(samples)
        assert isinstance(features, dict)
        # Per-axis stats: 6 axes × 5 stats = 30
        for axis in ("ax", "ay", "az", "gx", "gy", "gz"):
            assert f"{axis}_mean" in features
            assert f"{axis}_std" in features
            assert f"{axis}_min" in features
            assert f"{axis}_max" in features
            assert f"{axis}_range" in features
        # Magnitude features
        assert "accel_mag_mean" in features
        assert "gyro_mag_mean" in features
        # ZCR
        assert "ax_zcr" in features
        # Motion-derived
        assert "velocity_mean" in features
        assert "distance_total" in features

    def test_feature_count(self):
        samples = _make_samples(20)
        features = extract_features(samples)
        # 30 per-axis + 6 magnitude + 4 zcr + 3 motion = 43
        assert len(features) >= 35

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="empty"):
            extract_features([])

    def test_single_sample(self):
        features = extract_features([{"ax": 1, "ay": 2, "az": 3, "gx": 0, "gy": 0, "gz": 0}])
        assert features["ax_mean"] == 1.0
        assert features["ax_std"] == 0.0

    def test_all_zeros(self):
        samples = [{"ax": 0, "ay": 0, "az": 0, "gx": 0, "gy": 0, "gz": 0} for _ in range(10)]
        features = extract_features(samples)
        assert features["accel_mag_mean"] == 0.0
        assert features["velocity_mean"] == 0.0


class TestSlidingWindows:
    def test_basic(self):
        samples = _make_samples(80)
        windows = create_sliding_windows(samples, window_size=40, overlap=0.5)
        assert len(windows) == 3  # 0-39, 20-59, 40-79
        assert all(len(w) == 40 for w in windows)

    def test_no_overlap(self):
        samples = _make_samples(80)
        windows = create_sliding_windows(samples, window_size=40, overlap=0.0)
        assert len(windows) == 2  # 0-39, 40-79

    def test_not_enough_samples(self):
        samples = _make_samples(10)
        windows = create_sliding_windows(samples, window_size=40, overlap=0.5)
        assert len(windows) == 0

    def test_exact_fit(self):
        samples = _make_samples(40)
        windows = create_sliding_windows(samples, window_size=40, overlap=0.5)
        assert len(windows) == 1

    def test_invalid_window_size(self):
        with pytest.raises(ValueError):
            create_sliding_windows([], window_size=0)

    def test_invalid_overlap(self):
        with pytest.raises(ValueError):
            create_sliding_windows([], window_size=10, overlap=1.0)


class TestExtractDataset:
    def test_basic(self):
        samples = _make_samples(80)
        dataset = extract_dataset(samples, window_size=40, overlap=0.5)
        assert len(dataset) == 3
        assert all(isinstance(d, dict) for d in dataset)
