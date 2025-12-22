# WheelSense MCP Server - Dockerfile
# Model Context Protocol server for Local LLM integration

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY mcp-server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy LLM service (shared module)
COPY llm/ ./llm/

# Copy application code
COPY mcp-server/src/ ./src/

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["python", "-m", "src.main"]

