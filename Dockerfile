# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.12.1
# 11.28.8 bundles undici 6.29.1; workspace overrides do not patch pnpm's own dependencies.
ARG PNPM_VERSION=11.28.8

FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS workspace

ARG NODE_VERSION

WORKDIR /app

ENV PATH=/pnpm/bin:$PATH

RUN --mount=type=cache,id=kosmo-pnpm-metadata,target=/root/.cache/pnpm \
  pnpm runtime set node ${NODE_VERSION} -g

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY apps/fedify-consumer/package.json ./apps/fedify-consumer/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/fedify/package.json ./packages/fedify/package.json

FROM workspace AS deps

# Keep the store in the cached deps layer so the app license check can read it.
RUN pnpm install --frozen-lockfile --ignore-scripts --store-dir=/var/cache/pnpm/store

RUN pnpm rebuild --pending

# pnpm install --ignore-scripts skips this package-name bin link, but app builds invoke it.
RUN test -e apps/app/node_modules/.bin/relay-compiler \
  || ln -s ../relay-compiler/cli.js apps/app/node_modules/.bin/relay-compiler

FROM deps AS app-build

ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE
ARG SENTRY_UPLOAD_REQUIRED=0

ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV EXPO_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE
ENV SENTRY_UPLOAD_REQUIRED=$SENTRY_UPLOAD_REQUIRED

COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Public client settings are selected from the channel configuration in the Web bundle.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN,required=false \
  PNPM_CONFIG_STORE_DIR=/var/cache/pnpm/store pnpm build:sentry-artifacts
RUN find apps/app/dist -type f \( \
      -name '*.css' -o -name '*.html' -o -name '*.js' -o -name '*.json' \
      -o -name '*.mjs' -o -name '*.svg' -o -name '*.ttf' -o -name '*.wasm' \
    \) -exec gzip -9 -n -k {} +

RUN pnpm --filter @kosmo/admin build

FROM workspace AS runtime-deps

ENV NODE_ENV=production

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  --mount=type=cache,id=kosmo-pnpm-metadata,target=/root/.cache/pnpm \
  set -eu; \
  pnpm install --filter @kosmo/admin --filter @kosmo/api... --filter @kosmo/web... --filter @kosmo/worker... --filter @kosmo/fedify-consumer... --frozen-lockfile --prod --ignore-scripts --store-dir=/var/cache/pnpm/store; \
  bridge_binary=$(cd apps/worker && node -p 'require("node:module").createRequire(require.resolve("@temporalio/worker"))("@temporalio/core-bridge/common").getPrebuiltPath()'); \
  target_release=$(dirname "$bridge_binary"); \
  find "$(dirname "$target_release")" -mindepth 1 -maxdepth 1 -type d ! -path "$target_release" -exec rm -rf -- {} +

FROM node:${NODE_VERSION}-trixie-slim AS runtime

RUN --mount=type=tmpfs,target=/run \
  set -eu; \
  touch /run/runtime-build-start; \
  apt-get update; \
  apt-get upgrade -y; \
  apt-get install -y --no-install-recommends ca-certificates curl libatomic1; \
  rm -rf /var/lib/apt/lists/*; \
  rm -f /var/cache/ldconfig/aux-cache /var/log/alternatives.log /var/log/apt/*.log /var/log/dpkg.log; \
  groupadd --system --gid 10001 app; \
  SOURCE_DATE_EPOCH=0 useradd --system --no-log-init --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app; \
  install -d -o app -g app /app; \
  find / -xdev -newer /run/runtime-build-start -exec touch -h -m -d @0 -- {} +

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV EXPO_WEB_ROOT=/app/apps/app/dist

COPY --link --from=runtime-deps /app/node_modules ./node_modules
COPY --link --from=runtime-deps /app/apps ./apps
COPY --link --from=runtime-deps /app/packages ./packages
COPY --chown=app:app package.json tsconfig.json ./
COPY --chown=app:app apps/api ./apps/api
COPY --chown=app:app apps/fedify-consumer ./apps/fedify-consumer
COPY --chown=app:app apps/worker ./apps/worker
COPY --chown=app:app drizzle ./drizzle
COPY --chown=app:app packages/core ./packages/core
COPY --chown=app:app packages/fedify ./packages/fedify
COPY --chown=app:app apps/web/src/server ./apps/web/src/server
COPY --link --chown=10001:10001 --from=app-build /app/apps/admin/build ./apps/admin/build
COPY --link --chown=10001:10001 --from=app-build /app/apps/app/dist ./apps/app/dist
COPY --chown=app:app --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

USER app

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]
