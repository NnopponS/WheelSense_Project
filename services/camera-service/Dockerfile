FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (cached unless system deps change)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip first for better reliability (cached)
RUN pip install --upgrade pip

# Copy requirements first (this layer is cached unless requirements.txt changes)
COPY requirements.txt .

# Install all packages from requirements.txt
# This layer is cached unless requirements.txt changes
# Install large packages separately with increased timeout
RUN pip install --no-cache-dir --default-timeout=600 --retries=10 \
    opencv-python-headless>=4.8.0 \
    numpy>=1.24.0 \
    Pillow>=10.0.0 \
    && pip install --no-cache-dir --default-timeout=300 --retries=5 \
    -r requirements.txt

# Copy models (cached unless models change)
# Models are typically static, so this layer is cached most of the time
COPY models/ ./models/

# Copy source code LAST (this invalidates cache only when source changes)
# This way, dependency installation is cached when only source code changes
COPY src/ ./src/

# Run the service
CMD ["python", "-m", "src.main"]
