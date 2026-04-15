FROM oven/bun:1-alpine AS base

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages/env/package.json ./packages/env/package.json

RUN bun install --frozen-lockfile --production

COPY apps/api/schema.graphql ./apps/api/schema.graphql
COPY apps/api/src ./apps/api/src
COPY packages/env ./packages/env
COPY schema.graphql ./schema.graphql

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
