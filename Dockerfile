# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.3.0
ARG PNPM_VERSION=11.10.0

FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS base

ARG NODE_VERSION

WORKDIR /app

ENV PATH=/pnpm/bin:$PATH

RUN pnpm runtime set node ${NODE_VERSION} -g

FROM base AS workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/fedify/package.json ./packages/fedify/package.json

FROM workspace AS deps

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts --store-dir=/var/cache/pnpm/store

RUN pnpm rebuild --pending

# pnpm install --ignore-scripts skips this package-name bin link, but app builds invoke it.
RUN test -e apps/app/node_modules/.bin/relay-compiler \
  || ln -s ../relay-compiler/cli.js apps/app/node_modules/.bin/relay-compiler

FROM deps AS app-build

COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm --filter @kosmo/app build
RUN find apps/app/dist -type f \( \
      -name '*.css' -o -name '*.html' -o -name '*.js' -o -name '*.json' \
      -o -name '*.mjs' -o -name '*.svg' -o -name '*.ttf' -o -name '*.wasm' \
    \) -exec gzip -9 -n -k {} +

FROM workspace AS runtime-files

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV EXPO_WEB_ROOT=/app/apps/app/dist

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown app:app /app

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm install --filter @kosmo/api... --filter @kosmo/web... --frozen-lockfile --prod --ignore-scripts --store-dir=/var/cache/pnpm/store

COPY --chown=app:app tsconfig.json ./
COPY --chown=app:app apps/api ./apps/api
COPY --chown=app:app drizzle ./drizzle
COPY --chown=app:app packages/core ./packages/core
COPY --chown=app:app packages/fedify ./packages/fedify
COPY --chown=app:app apps/web/src/server ./apps/web/src/server
COPY --chown=app:app --from=app-build /app/apps/app/dist ./apps/app/dist
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

FROM runtime-files AS runtime

RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

USER app

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]
