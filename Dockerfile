# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.5.1
ARG PNPM_VERSION=11.22.0
ARG SENTRY_RELEASE

FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS base

ARG NODE_VERSION

WORKDIR /app

ENV PATH=/pnpm/bin:$PATH

RUN pnpm runtime set node ${NODE_VERSION} -g

FROM base AS workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/app/package.json ./apps/app/package.json
COPY apps/fedify-consumer/package.json ./apps/fedify-consumer/package.json
COPY apps/worker/package.json ./apps/worker/package.json
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

ARG EXPO_PUBLIC_ENVIRONMENT
ARG EXPO_PUBLIC_OPENPANEL_CLIENT_ID
ARG EXPO_PUBLIC_RELEASE_TAG
ARG EXPO_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE
ARG SENTRY_UPLOAD_REQUIRED=0

ENV EXPO_PUBLIC_ENVIRONMENT=$EXPO_PUBLIC_ENVIRONMENT
ENV EXPO_PUBLIC_OPENPANEL_CLIENT_ID=$EXPO_PUBLIC_OPENPANEL_CLIENT_ID
ENV EXPO_PUBLIC_RELEASE_TAG=$EXPO_PUBLIC_RELEASE_TAG
ENV EXPO_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV SENTRY_UPLOAD_REQUIRED=$SENTRY_UPLOAD_REQUIRED

COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

# Docker COPY replaces the ignored workspace node_modules entries. Restore the
# dependency links from the immutable deps stage so build tools resolve from
# their owning workspace without another install or lifecycle run.
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/app/node_modules ./apps/app/node_modules
COPY --from=deps /app/apps/fedify-consumer/node_modules ./apps/fedify-consumer/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/fedify/node_modules ./packages/fedify/node_modules

RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN,required=false \
  pnpm build:sentry-artifacts
RUN find apps/app/dist -type f \( \
      -name '*.css' -o -name '*.html' -o -name '*.js' -o -name '*.json' \
      -o -name '*.mjs' -o -name '*.svg' -o -name '*.ttf' -o -name '*.wasm' \
    \) -exec gzip -9 -n -k {} +

# Keep the artifact contract in a named stage so every split image consumes the
# exact output that passed the Sentry build (including server source-map
# handling). The final images copy only their entry module, never this stage's
# workspace or node_modules.
FROM app-build AS server-artifacts

RUN set -eux; \
  for artifact in web api fedify-consumer migration worker; do \
    test -s "/app/server-dist/${artifact}/index.mjs"; \
    test ! -e "/app/server-dist/${artifact}/runtime-package.json"; \
  done; \
  test -s /app/server-dist/worker/workflow-bundle.js

# Deploy each production dependency tree directly from the workspace lockfile.
# Public hoisting lets the external imports in each JavaScript artifact resolve
# from /app/node_modules without a generated runtime manifest.
FROM app-build AS web-runtime-deps

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm --offline --filter @kosmo/web "--config.public-hoist-pattern=*" deploy --legacy --prod \
    --ignore-scripts --store-dir=/var/cache/pnpm/store /runtime-deploy

FROM app-build AS api-runtime-deps

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm --offline --filter @kosmo/api "--config.public-hoist-pattern=*" deploy --legacy --prod \
    --ignore-scripts --store-dir=/var/cache/pnpm/store /runtime-deploy

FROM app-build AS fedify-consumer-runtime-deps

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm --offline --filter @kosmo/fedify-consumer "--config.public-hoist-pattern=*" deploy --legacy --prod \
    --ignore-scripts --store-dir=/var/cache/pnpm/store /runtime-deploy

FROM app-build AS migration-runtime-deps

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm --offline --filter @kosmo/core "--config.public-hoist-pattern=*" deploy --legacy --prod \
    --ignore-scripts --store-dir=/var/cache/pnpm/store /runtime-deploy

FROM app-build AS worker-runtime-deps

ARG TARGETOS
ARG TARGETARCH

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store set -eux; \
  test "${TARGETOS}" = linux; \
  test "${TARGETARCH}" = arm64; \
  pnpm --offline --filter @kosmo/worker "--config.public-hoist-pattern=*" deploy --legacy --prod \
    --ignore-scripts --store-dir=/var/cache/pnpm/store /runtime-deploy; \
  cd /runtime-deploy; \
  pnpm rebuild --pending

RUN set -eux; \
  bridge_entrypoint="$(cd /runtime-deploy && node -e "const { createRequire } = require('node:module'); const workerRequire = createRequire(require.resolve('@temporalio/worker/package.json')); process.stdout.write(workerRequire.resolve('@temporalio/core-bridge'))")"; \
  bridge_root="$(dirname "${bridge_entrypoint}")"; \
  test -d "${bridge_root}/releases/aarch64-unknown-linux-gnu"; \
  find "${bridge_root}/releases" -mindepth 1 -maxdepth 1 \
    ! -name aarch64-unknown-linux-gnu -exec rm -rf {} +; \
  test "$(find "${bridge_root}/releases" -mindepth 2 -maxdepth 2 -type f -name index.node | wc -l | tr -d ' ')" = 1

FROM base AS split-runtime-base

ARG SENTRY_RELEASE

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080 \
  SENTRY_RELEASE=${SENTRY_RELEASE}

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown app:app /app

RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

FROM split-runtime-base AS web-runtime

ENV EXPO_WEB_ROOT=/app/apps/app/dist

COPY --from=server-artifacts --chown=app:app /app/server-dist/web/index.mjs /app/server-dist/web/index.mjs
COPY --from=app-build --chown=app:app /app/apps/app/dist /app/apps/app/dist
COPY --from=web-runtime-deps --chown=app:app /runtime-deploy/node_modules /app/node_modules

USER app

EXPOSE 8080

ENTRYPOINT ["node", "/app/server-dist/web/index.mjs"]

FROM split-runtime-base AS api-runtime

COPY --from=server-artifacts --chown=app:app /app/server-dist/api/index.mjs /app/server-dist/api/index.mjs
COPY --from=api-runtime-deps --chown=app:app /runtime-deploy/node_modules /app/node_modules

USER app

EXPOSE 8080

ENTRYPOINT ["node", "/app/server-dist/api/index.mjs"]

FROM split-runtime-base AS worker-runtime

ENV TEMPORAL_WORKFLOW_BUNDLE_PATH=/app/server-dist/worker/workflow-bundle.js

COPY --from=server-artifacts --chown=app:app /app/server-dist/worker/index.mjs /app/server-dist/worker/index.mjs
COPY --from=server-artifacts --chown=app:app /app/server-dist/worker/workflow-bundle.js /app/server-dist/worker/workflow-bundle.js
COPY --from=worker-runtime-deps --chown=app:app /runtime-deploy/node_modules /app/node_modules

USER app

EXPOSE 8080

ENTRYPOINT ["node", "/app/server-dist/worker/index.mjs"]

FROM split-runtime-base AS fedify-consumer-runtime

COPY --from=server-artifacts --chown=app:app /app/server-dist/fedify-consumer/index.mjs /app/server-dist/fedify-consumer/index.mjs
COPY --from=fedify-consumer-runtime-deps --chown=app:app /runtime-deploy/node_modules /app/node_modules

USER app

EXPOSE 8080

ENTRYPOINT ["node", "/app/server-dist/fedify-consumer/index.mjs"]

FROM split-runtime-base AS migration-runtime

COPY --from=server-artifacts --chown=app:app /app/server-dist/migration/index.mjs /app/server-dist/migration/index.mjs
COPY --from=migration-runtime-deps --chown=app:app /runtime-deploy/node_modules /app/node_modules
COPY --chown=app:app drizzle /app/drizzle

USER app

ENTRYPOINT ["node", "/app/server-dist/migration/index.mjs"]

FROM workspace AS runtime-files

ARG SENTRY_RELEASE

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV EXPO_WEB_ROOT=/app/apps/app/dist
ENV SENTRY_RELEASE=$SENTRY_RELEASE

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown app:app /app

RUN --mount=type=cache,id=kosmo-pnpm-store,target=/var/cache/pnpm/store \
  pnpm install --filter @kosmo/api... --filter @kosmo/web... --filter @kosmo/worker... --filter @kosmo/fedify-consumer... --frozen-lockfile --prod --ignore-scripts --store-dir=/var/cache/pnpm/store

COPY --chown=app:app tsconfig.json ./
COPY --chown=app:app apps/api ./apps/api
COPY --chown=app:app apps/fedify-consumer ./apps/fedify-consumer
COPY --chown=app:app apps/worker ./apps/worker
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
