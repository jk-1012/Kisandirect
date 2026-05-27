FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js standalone output (smallest bundle)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 kd && \
    adduser --system --uid 1001 --ingroup kd kd

# Only standalone output — much smaller image
COPY --from=builder --chown=kd:kd /app/.next/standalone ./
COPY --from=builder --chown=kd:kd /app/.next/static ./.next/static
COPY --from=builder --chown=kd:kd /app/public ./public

USER kd
EXPOSE 3001
ENV NODE_ENV=production PORT=3001 NEXT_TELEMETRY_DISABLED=1

CMD ["node", "server.js"]
