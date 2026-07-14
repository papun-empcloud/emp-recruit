# Interview bot: headless Chromium + PulseAudio + espeak-ng so the bot can join
# a Jitsi call, speak, and capture audio. Runs as a non-root user (PulseAudio
# and Chromium both dislike running as root).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    pulseaudio \
    espeak-ng \
    ca-certificates \
    dbus \
    fonts-liberation \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 libgbm1 \
  && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    NODE_ENV=production \
    XDG_RUNTIME_DIR=/tmp/runtime-bot

RUN useradd -m -u 1001 bot

WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh && mkdir -p /tmp/runtime-bot && chown -R bot:bot /app /tmp/runtime-bot

USER bot
ENTRYPOINT ["./entrypoint.sh"]
