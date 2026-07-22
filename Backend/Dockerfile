# ── Backend: Express + Puppeteer ─────────────────────────────────────────────
# Debian slim keeps the image small while still supporting Chromium, which
# Puppeteer needs for server-side PDF generation.
FROM node:22-slim

# Install the distro Chromium plus the fonts it needs to render PDFs properly.
# Using the system browser avoids Puppeteer downloading a second ~300MB copy.
# The apt cache is purged in the same layer so it never reaches the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Create the runtime user up front. --create-home matters: Chromium's crashpad
# handler writes to $HOME and fails to launch if that directory is missing.
# Note we deliberately do NOT `chown -R /app` later: that would rewrite every
# file and duplicate the whole node_modules layer (~230MB). npm installs
# world-readable files, which is all the app needs.
RUN useradd --system --uid 1001 --gid root --create-home --home-dir /home/appuser appuser \
    && chown -R appuser:root /home/appuser

WORKDIR /app

# Copy manifests first so Docker caches the dependency layer across code edits.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Run as an unprivileged user rather than root.
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
