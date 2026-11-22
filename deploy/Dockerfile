# Avara web server with the scanner (Playwright Chromium for scans, Google Chrome for Lighthouse). One image runs everything; Postgres
# and Caddy run beside it (deploy/docker-compose.yml). The base image's Playwright version must match package.json (1.65.1).
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --include=dev
# Lighthouse launches the Google Chrome channel; Chromium for the scans is already in the base image.
RUN npx playwright install chrome

COPY . .
RUN npm run build \
 && mkdir -p /data/objects \
 && chown -R pwuser:pwuser /data /app/.next

USER pwuser
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
