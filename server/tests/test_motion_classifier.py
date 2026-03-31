"""Tests for app.motion_classifier module."""

import math
import pytest
from app.feature_engineering import extract_features
from app.motion_classifier import (
    train_motion_model,
    predict_motion,
    is_motion_model_ready,
    get_motion_model_info,
    save_model,
    load_model,
    _lock,
)


def _make_feature_set(label: str, n: int = 20, seed: float = 0.0) -> tuple[list[dict], list[str]]:
    """Create n feature dicts with distinct patterns per label."""
    features_list = []
    for i in range(n):
        # Vary by label to create separable clusters
        offset = {"idle": 0.0, "straight": 2.0, "turn_left": -2.0, "fall": 5.0}.get(label, 1.0)
        samples = [
            {
                "ax": math.sin(i * 0.1 + seed) * offset,
                "ay": math.cos(i * 0.1 + seed) * offset * 0.5,
                "az": 9.8 + math.sin(i * 0.3 + seed) * offset * 0.3,
                "gx": i * 0.01 * offset,
                "gy": -i * 0.005 * offset,
                "gz": math.sin(i * 0.2 + seed) * offset * 2,
                "distance_m": i * 0.02 * abs(offset),
                "velocity_ms": offset * 0.1,
            }
            for j in range(10)
        ]
        features_list.append(extract_features(samples))
    return features_list, [label] * n


@pytest.fixture(autouse=True)
def _reset_model():
    """Reset module-level model state before each test."""
    import app.motion_classifier as mc
    with mc._lock:
        mc._model = None
        mc._label_encoder = None
        mc._model_info = {"trained": False}
    yield
    with mc._lock:
        mc._model = None
        mc._label_encoder = None
        mc._model_info = {"trained": False}


class TestTrainMotionModel:
    def test_train_basic(self):
        f1, l1 = _make_feature_set("idle", 15, seed=0.0)
        f2, l2 = _make_feature_set("straight", 15, seed=1.0)
        result = train_motion_model(f1 + f2, l1 + l2)
        assert result["trained"] is True
        assert result["n_classes"] == 2
        assert result["accuracy"] >= 0.0
        assert "idle" in result["labels"]
        assert "straight" in result["labels"]
        assert is_motion_model_ready()

    def test_train_empty_raises(self):
        with pytest.raises(ValueError, match="non-empty"):
            train_motion_model([], [])

    def test_train_mismatched_raises(self):
        f1, _ = _make_feature_set("idle", 5)
        with pytest.raises(ValueError, match="same length"):
            train_motion_model(f1, ["idle"] * 3)


class TestPredictMotion:
    def test_predict_no_model(self):
        assert not is_motion_model_ready()
        f1, _ = _make_feature_set("idle", 1)
        result = predict_motion(f1[0])
        assert result is None

    def test_predict_after_train(self):
        f1, l1 = _make_feature_set("idle", 15, seed=0.0)
        f2, l2 = _make_feature_set("fall", 15, seed=3.0)
        train_motion_model(f1 + f2, l1 + l2)

        result = predict_motion(f1[0])
        assert result is not None
        assert result["predicted_label"] in ("idle", "fall")
        assert 0.0 <= result["confidence"] <= 1.0
        assert "probabilities" in result


class TestModelInfo:
    def test_info_before_train(self):
        info = get_motion_model_info()
        assert info["trained"] is False

    def test_info_after_train(self):
        f1, l1 = _make_feature_set("idle", 15)
        f2, l2 = _make_feature_set("straight", 15, seed=1.0)
        train_motion_model(f1 + f2, l1 + l2)
        info = get_motion_model_info()
        assert info["trained"] is True
        assert info["n_features"] > 0


class TestSaveLoadModel:
    def test_save_no_model_raises(self):
        with pytest.raises(RuntimeError, match="No trained"):
            save_model()

    def test_save_and_load(self, tmp_path):
        f1, l1 = _make_feature_set("idle", 15)
        f2, l2 = _make_feature_set("turn_left", 15, seed=2.0)
        train_motion_model(f1 + f2, l1 + l2)

        mp = tmp_path / "model.json"
        ep = tmp_path / "labels.json"
        paths = save_model(model_path=mp, encoder_path=ep)
        assert mp.exists()
        assert ep.exists()

        # Reset and reload
        import app.motion_classifier as mc
        with mc._lock:
            mc._model = None
            mc._label_encoder = None
        assert not is_motion_model_ready()

        info = load_model(model_path=mp, encoder_path=ep)
        assert is_motion_model_ready()
        assert "idle" in info["labels"]

    def test_load_missing_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_model(model_path=tmp_path / "nope.json", encoder_path=tmp_path / "nope2.json")
