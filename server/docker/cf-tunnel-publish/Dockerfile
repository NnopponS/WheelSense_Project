FROM python:3.12-slim-bookworm

ARG TARGETARCH=amd64
ARG CLOUDFLARED_VERSION=2025.6.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
  "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}" \
  -o /usr/local/bin/cloudflared \
  && chmod +x /usr/local/bin/cloudflared

RUN pip install --no-cache-dir aiomqtt==2.3.0

COPY docker/cf-tunnel-publish/run.py /app/run.py
WORKDIR /app

ENTRYPOINT ["python", "-u", "/app/run.py"]
