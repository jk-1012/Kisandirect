# ── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: Production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Security: create non-root user
RUN addgroup --system --gid 1001 kd && \
    adduser --system --uid 1001 --ingroup kd kd

# Copy only what's needed
COPY --from=deps --chown=kd:kd /app/node_modules ./node_modules
COPY --from=builder --chown=kd:kd /app/dist ./dist
COPY --chown=kd:kd package.json ./

USER kd

EXPOSE 3000
ENV NODE_ENV=production PORT=3000

# Graceful shutdown
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health/live || exit 1

CMD ["node", "dist/index.js"]
