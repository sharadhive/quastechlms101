# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps
#   Install ALL dependencies (including devDeps) so the build can run prisma
#   generate and tsc.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat is needed by some native modules (bcrypt, pdfkit) on alpine
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy only the manifests first — this layer is cached unless they change
COPY package.json package-lock.json ./

# Install all deps (dev + prod) — needed for prisma generate + next build
RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
#   Generate Prisma client and build the Next.js production bundle.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Bring node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the full source
COPY . .

# Generate Prisma client (must run before `next build`)
RUN npx prisma generate

# Build Next.js — requires DATABASE_URL to be syntactically valid (not connected)
# We pass a placeholder so the build doesn't fail; the real URL is injected at runtime.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner (production image)
#   Only the artefacts required to run the app are copied in, keeping the image
#   as small as possible.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Run as non-root for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ── Next.js standalone output ────────────────────────────────────────────────
# next.config must set `output: 'standalone'` for this to be populated.
# If you haven't added that yet, copy the full .next + public dirs instead
# and switch the CMD to `node_modules/.bin/next start`.
#
# Current project uses default output, so we copy the full build:
COPY --from=builder /app/.next            ./.next
COPY --from=builder /app/node_modules     ./node_modules
COPY --from=builder /app/package.json     ./package.json
COPY --from=builder /app/public           ./public
COPY --from=builder /app/ca.pem           ./ca.pem

# Prisma schema + generated client (already inside node_modules, but schema
# is needed for `prisma migrate deploy` in the entrypoint)
COPY --from=builder /app/prisma           ./prisma

# Worker script (runs as a separate process / container)
COPY --from=builder /app/worker.ts        ./worker.ts
COPY --from=builder /app/src              ./src
COPY --from=builder /app/tsconfig.json    ./tsconfig.json

# Local storage volume mount point
RUN mkdir -p ./storage && chown -R nextjs:nodejs ./storage

# Entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown nextjs:nodejs ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# DATABASE_URL and other secrets must be injected via env vars / docker-compose
ENTRYPOINT ["./docker-entrypoint.sh"]
