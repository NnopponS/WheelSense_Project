FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
# Upgrade pip first for better reliability
RUN pip install --upgrade pip

# Install large packages separately with increased timeout
RUN pip install --no-cache-dir --default-timeout=600 --retries=10 \
    opencv-python-headless>=4.8.0 \
    numpy>=1.24.0 \
    Pillow>=10.0.0

# Install remaining packages
RUN pip install --no-cache-dir --default-timeout=300 --retries=5 \
    paho-mqtt>=1.6.1 \
    pydantic>=2.5.0 \
    pydantic-settings>=2.1.0 \
    python-dotenv>=1.0.0 \
    structlog>=24.1.0

# Copy source code
COPY src/ ./src/

# Run the service
CMD ["python", "-m", "src.main"]
