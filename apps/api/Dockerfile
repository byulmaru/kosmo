FROM oven/bun:1-alpine AS base

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json bun.lock tsconfig.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN bun install --frozen-lockfile --production --filter '@kosmo/api'

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["bun", "run", "start"]
