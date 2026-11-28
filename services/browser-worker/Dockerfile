# Isolated browser worker. Build from the repository root:  docker build -f services/browser-worker/Dockerfile -t avara-browser-worker .
# The Playwright base image version must match services/browser-worker/package.json (1.65.1).
FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
ENV NODE_ENV=production SUGAM_CHROME_CHANNEL=chromium
COPY services/browser-worker/package.json services/browser-worker/package-lock.json ./
RUN npm ci --omit=dev
# Only what the worker imports: the flow packages, the URL guard, the egress proxy and the server.
COPY packages ./packages
COPY lib/net ./lib/net
COPY lib/security/redact.ts ./lib/security/redact.ts
COPY scanner/egress-proxy.ts ./scanner/egress-proxy.ts
COPY services/browser-worker/server.ts ./services/browser-worker/server.ts
USER pwuser
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "services/browser-worker/server.ts"]
