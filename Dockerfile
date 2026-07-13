# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time public env vars (Vite inlines these at build)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Install with bun for speed; fall back to npm if bun unavailable
RUN apk add --no-cache curl bash && \
    npm install -g bun@1.1.34

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun run build

# ---------- Stage 2: serve ----------
FROM nginx:1.27-alpine AS runner

# SPA-friendly nginx config
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Static assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
