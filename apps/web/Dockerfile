# Use Node.js LTS

# Default Node heap cap (override via Railway env `NODE_OPTIONS` if needed)
ARG NODE_OPTIONS="--max-old-space-size=768"

# ── deps ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NODE_OPTIONS
ENV NODE_OPTIONS=$NODE_OPTIONS

COPY package.json package-lock.json* ./
RUN npm ci

# ── builder ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NODE_OPTIONS
ENV NODE_OPTIONS=$NODE_OPTIONS

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the Next.js application + compile the custom server for production.
# This avoids running `tsx` in production.
RUN npm run build && npm run build:server

# ── runner ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NODE_OPTIONS
ENV NODE_OPTIONS=$NODE_OPTIONS

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.server ./.server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts

# Make entrypoint executable
RUN chmod +x scripts/entrypoint.sh

EXPOSE 3000

CMD ["/bin/sh", "scripts/entrypoint.sh"]
