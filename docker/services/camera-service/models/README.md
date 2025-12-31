# Teachable Machine Model

This directory contains the Teachable Machine model for wheelchair detection.

## Model Structure

The model should be placed in the `tm-my-image-model` subdirectory with the following structure:

```
tm-my-image-model/
  ├── keras_model.h5    # Keras model file
  └── labels.txt        # Class labels (one per line)
```

## Model Information

- **Type**: Image Classification
- **Classes**: Wheelchair, NoWheelChair
- **Image Size**: 224x224 pixels
- **Framework**: TensorFlow/Keras

## Usage

The model is automatically loaded by the `WheelchairDetector` class in `src/detector.py`.

The model path is configured as:
- `/app/models/tm-my-image-model` (Docker container)
- `tm-my-image-model` (local development fallback)

## Exporting from Teachable Machine

1. Train your model on [Teachable Machine](https://teachablemachine.withgoogle.com/)
2. Export the model:
   - Choose "TensorFlow" format
   - Select "Keras" option
   - Download the model files
3. Extract and place in this directory as `tm-my-image-model/`

## Notes

- The model uses TensorFlow for inference
- Ensure TensorFlow is installed: `pip install tensorflow`
- Model is loaded automatically when the camera service starts