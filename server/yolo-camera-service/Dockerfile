# CPU-friendly YOLO service for the physical model demo.
# Set YOLO_DEVICE=cuda and use a CUDA base image later if the demo machine has NVIDIA runtime.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

COPY models/ ./models/
COPY src/ ./src/

ENV PYTHONUNBUFFERED=1
EXPOSE 8020

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8020"]
