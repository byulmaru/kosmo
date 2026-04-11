FROM oven/bun:1-alpine AS base

WORKDIR /app

FROM base AS build

COPY package.json bun.lock ./
COPY apps/expo/package.json ./apps/expo/package.json

RUN bun install --frozen-lockfile

COPY . .

RUN cd apps/expo && bun run build:web

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json bun.lock ./
COPY apps/expo/package.json ./apps/expo/package.json

RUN bun install --frozen-lockfile --production

WORKDIR /app/apps/expo

COPY --from=build /app/apps/expo/src/server ./src/server
COPY --from=build /app/apps/expo/dist ./dist

EXPOSE 8080

CMD ["bun", "run", "./src/server/index.ts"]
