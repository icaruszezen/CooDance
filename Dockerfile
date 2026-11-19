FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    chromium \
    fonts-noto-cjk \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV COODANCE_HOST=0.0.0.0
ENV COODANCE_PORT=4170
ENV COODANCE_WORKSPACE=/workspace
ENV COODANCE_CONFIG_DIR=/config

WORKDIR /app
COPY . .

RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund && npm run build

VOLUME ["/workspace", "/config"]
EXPOSE 4170

CMD ["node", "apps/server/dist/index.js"]
