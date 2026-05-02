FROM oven/bun:1.3.13 AS base

WORKDIR /app

FROM base AS workspace

COPY package.json bun.lock tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

FROM workspace AS deps

RUN bun install --frozen-lockfile

FROM deps AS expo-build

RUN cd apps/expo && bun run build:web

FROM workspace AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

RUN bun install --frozen-lockfile --production

COPY --from=expo-build /app/apps/expo/dist ./apps/expo/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && chown -R bun:bun /app

EXPOSE 8080

USER bun

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["expo"]
