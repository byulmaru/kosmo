FROM oven/bun:1-alpine AS base

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/expo/package.json ./apps/expo/package.json
COPY packages/env/package.json ./packages/env/package.json

RUN bun install --frozen-lockfile --production --filter '@kosmo/api'

COPY apps/api ./apps/api
COPY packages ./packages

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["bun", "run", "start"]
