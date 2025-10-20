# syntax=docker/dockerfile:1
FROM node:20-bullseye-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.base.json yarn.lock* ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN yarn install --non-interactive

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN yarn workspace @wheelsense/shared build
RUN yarn workspace @wheelsense/web build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
