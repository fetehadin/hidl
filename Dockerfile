# Production image for the Contabo server (deploy/README.md). Vercel doesn't use this file.
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so they're build args.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The server-only allowlist is read at runtime; this placeholder only satisfies build-time validation.
RUN ALLOWED_EMAIL=build@example.com pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S hidl && adduser -S hidl -G hidl
COPY --from=build --chown=hidl:hidl /app/.next/standalone ./
COPY --from=build --chown=hidl:hidl /app/.next/static ./.next/static
COPY --from=build --chown=hidl:hidl /app/public ./public
# The commit this image was built from, shown on the admin panel's System tab. Declared after the
# RUN above so a new commit doesn't rebuild that layer.
ARG GIT_SHA=unknown
ENV HIDL_VERSION=$GIT_SHA
USER hidl
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
