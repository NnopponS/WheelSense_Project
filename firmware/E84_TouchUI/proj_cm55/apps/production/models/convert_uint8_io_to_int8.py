"""Convert only a quantized TFLite model's uint8 I/O boundary to int8."""

from pathlib import Path
import sys

import flatbuffers
from tensorflow.lite.python import schema_py_generated as schema


def convert(source: Path, destination: Path) -> None:
    raw = source.read_bytes()
    model = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(raw, 0))
    graph = model.subgraphs[0]

    for tensor_index in (*graph.inputs, *graph.outputs):
        tensor = graph.tensors[tensor_index]
        if tensor.type != schema.TensorType.UINT8:
            raise ValueError(f"tensor {tensor_index} is not uint8")
        tensor.type = schema.TensorType.INT8
        tensor.quantization.zeroPoint = [int(value) - 128
                                         for value in tensor.quantization.zeroPoint]

    builder = flatbuffers.Builder(0)
    builder.Finish(model.Pack(builder), file_identifier=b"TFL3")
    destination.write_bytes(bytes(builder.Output()))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: convert_uint8_io_to_int8.py SOURCE DESTINATION")
    convert(Path(sys.argv[1]), Path(sys.argv[2]))
