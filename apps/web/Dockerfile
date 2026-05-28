# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install compilation toolchains for node-gyp if necessary
RUN apk add --no-cache libc6-compat

RUN npm install -g pnpm@9.1.4

# Copy Turborepo monorepo configuration and package source directories
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json /app/
COPY packages/shared-types /app/packages/shared-types
COPY packages/ui /app/packages/ui
COPY apps/web /app/apps/web

# Install dependencies using workspaces
RUN pnpm install --frozen-lockfile

# Build the production assets
RUN pnpm --filter web build

# ==========================================
# Stage 2: Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

RUN npm install -g pnpm@9.1.4

# Harden security: Run under non-root user
RUN addgroup -g 10001 -S coverai && \
    adduser -u 10001 -S coverai -G coverai

# Copy constructed environment from builder and apply ownership inline to avoid slow RUN chown -R
COPY --chown=coverai:coverai --from=builder /app /app

USER coverai

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENV NODE_ENV production

CMD ["pnpm", "--filter", "web", "start"]
