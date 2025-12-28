# GPU-enabled Camera Service for YOLO Wheelchair Detection
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

WORKDIR /app

# Install Python 3.10 and system dependencies
# Ubuntu 22.04 comes with Python 3.10 by default
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Set Python alias
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Upgrade pip
RUN python -m pip install --upgrade pip

# Copy requirements first (this layer is cached unless requirements.txt changes)
COPY requirements.txt .

# Install PyTorch with CUDA support first (for GPU acceleration)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install other packages from requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy models (cached unless models change)
COPY models/ ./models/

# Copy source code LAST (this invalidates cache only when source changes)
COPY src/ ./src/

# Environment variable to ensure CUDA is used
ENV CUDA_VISIBLE_DEVICES=0
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Run the service
CMD ["python", "-m", "src.main"]
