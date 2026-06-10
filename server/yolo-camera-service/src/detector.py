from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DetectionResult:
    detected: bool
    confidence: float
    bbox: list[int] | None
    frame_size: dict[str, int]
    method: str
    class_name: str | None
    detections: list[dict[str, Any]]


class YoloFallDetector:
    """YOLOv8 detector adapted from archive/model-mockup.

    The old mockup model detects the physical target in a room. In this unified
    demo, any positive detection is converted into Robert's physical-model fall
    emergency by the service layer.
    """

    def __init__(self, *, model_path: str, confidence_threshold: float, device: str) -> None:
        self.model_path = Path(model_path)
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.model: Any | None = None
        self.model_loaded = False

    def load(self) -> None:
        if not self.model_path.exists():
            raise FileNotFoundError(f"YOLO model file not found: {self.model_path}")

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("ultralytics is required for real YOLO detection") from exc

        logger.info("Loading YOLO model from %s on %s", self.model_path, self.device)
        self.model = YOLO(str(self.model_path))
        if self.device and self.device != "cpu":
            self.model.to(self.device)
        self.model_loaded = True
        logger.info("YOLO model loaded")

    def detect_jpeg(self, image_bytes: bytes) -> DetectionResult:
        frame = self._decode_jpeg(image_bytes)
        return self.detect_frame(frame)

    def detect_frame(self, frame: np.ndarray) -> DetectionResult:
        if frame is None or frame.size == 0:
            raise ValueError("Frame is empty")
        if self.model is None or not self.model_loaded:
            raise RuntimeError("YOLO model is not loaded")

        height, width = frame.shape[:2]
        results = self.model(
            frame,
            conf=self.confidence_threshold,
            verbose=False,
            device=self.device,
        )

        detections: list[dict[str, Any]] = []
        best_conf = 0.0
        best_bbox: list[int] | None = None
        best_class: str | None = None

        if results:
            result = results[0]
            boxes = getattr(result, "boxes", None)
            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf = float(box.conf[0].cpu().numpy())
                    cls = int(box.cls[0].cpu().numpy())
                    class_name = self._class_name(cls)
                    bbox = [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]
                    item = {"bbox": bbox, "confidence": round(conf, 3), "class": class_name}
                    detections.append(item)
                    if conf > best_conf:
                        best_conf = conf
                        best_bbox = bbox
                        best_class = class_name

        return DetectionResult(
            detected=bool(detections),
            confidence=round(best_conf, 3),
            bbox=best_bbox,
            frame_size={"width": int(width), "height": int(height)},
            method="yolo",
            class_name=best_class,
            detections=detections,
        )

    def _class_name(self, cls: int) -> str:
        names = getattr(self.model, "names", None)
        if isinstance(names, dict):
            return str(names.get(cls, cls))
        if isinstance(names, list) and 0 <= cls < len(names):
            return str(names[cls])
        return str(cls)

    @staticmethod
    def _decode_jpeg(image_bytes: bytes) -> np.ndarray:
        if not image_bytes:
            raise ValueError("Frame payload is empty")
        frame_array = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode JPEG frame")
        return frame
