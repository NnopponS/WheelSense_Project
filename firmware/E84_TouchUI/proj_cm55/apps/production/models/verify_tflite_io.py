"""Verify uint8 and boundary-converted int8 TFLite models are equivalent."""

from pathlib import Path
import sys

import numpy as np
import tensorflow as tf


def infer(path: Path, value: np.ndarray) -> np.ndarray:
    interpreter = tf.lite.Interpreter(model_path=str(path))
    interpreter.allocate_tensors()
    input_detail = interpreter.get_input_details()[0]
    output_detail = interpreter.get_output_details()[0]
    interpreter.set_tensor(input_detail["index"], value)
    interpreter.invoke()
    return interpreter.get_tensor(output_detail["index"])


def verify(uint8_path: Path, int8_path: Path) -> None:
    rng = np.random.default_rng(84)
    samples = [
        np.zeros((1, 128, 128, 3), dtype=np.uint8),
        np.full((1, 128, 128, 3), 255, dtype=np.uint8),
        rng.integers(0, 256, (1, 128, 128, 3), dtype=np.uint8),
    ]
    for sample in samples:
        original = infer(uint8_path, sample).astype(np.int16)
        signed_input = (sample.astype(np.int16) - 128).astype(np.int8)
        converted = infer(int8_path, signed_input).astype(np.int16) + 128
        np.testing.assert_array_equal(original, converted)
    print("PASS: uint8/int8 boundary conversion is output-equivalent")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_tflite_io.py UINT8_MODEL INT8_MODEL")
    verify(Path(sys.argv[1]), Path(sys.argv[2]))
