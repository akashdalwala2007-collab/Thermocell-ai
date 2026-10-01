# ==============================================================================
# ThermoCell-AI Production Dockerfile
# Multi-stage/lightweight Python 3.11-slim container for FastAPI ASGI backend
# ==============================================================================

FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    MODEL_DIR=/app/ml/saved_models \
    PORT=8000

WORKDIR /app

# Install system dependencies if required for scientific packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source code, model weights, and benchmark reference dataset
COPY backend/app /app/backend/app
COPY backend/data/processed /app/backend/data/processed
COPY ml/saved_models /app/ml/saved_models

# Expose service port
EXPOSE 8000

# Run Uvicorn ASGI server with proxy headers and multi-worker concurrency
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app/backend --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
