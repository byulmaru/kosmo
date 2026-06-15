# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.3.0
ARG PNPM_VERSION=11.6.0

FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS base

ARG NODE_VERSION

WORKDIR /app

RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

RUN pnpm runtime set node ${NODE_VERSION} -g

FROM base AS workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

FROM workspace AS deps

RUN pnpm install --frozen-lockfile

FROM deps AS web-build

ARG PUBLIC_ENV_HASH

RUN --mount=type=secret,id=web_build_env,required=true,mode=0400 \
  : "${PUBLIC_ENV_HASH}" \
  && set -a \
  && . /run/secrets/web_build_env \
  && set +a \
  && pnpm --filter @kosmo/web build

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && chown app:app /app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY --chown=app:app apps/api/package.json ./apps/api/package.json
COPY --chown=app:app apps/web/package.json ./apps/web/package.json
COPY --chown=app:app packages/core/package.json ./packages/core/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --chown=app:app apps/api ./apps/api
COPY --chown=app:app packages/core ./packages/core
COPY --chown=app:app --from=web-build /app/apps/web/build ./apps/web/build
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER app

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]
