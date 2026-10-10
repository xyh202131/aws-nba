# Build later with --platform linux/arm64 after deployment authorization.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# Use system FFmpeg; skip platform binary downloads and all lifecycle hooks.
RUN npm ci --omit=dev --ignore-scripts
COPY agent ./agent
COPY shared ./shared
COPY src/data ./src/data
COPY docs/media-manifest.json ./docs/media-manifest.json
COPY public/media ./public/media
ENV AGENT_HOST=0.0.0.0 AGENT_PORT=8080 AGENT_RUNTIME_CONTAINER=true AGENT_PROVIDER=fixture ALLOW_PAID_MODEL_CALLS=false AGENT_DATA_DIR=/tmp/courtside FFMPEG_PATH=/usr/bin/ffmpeg AWS_REGION=us-east-1 AWS_PROFILE=nba
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "agent/server.ts"]
