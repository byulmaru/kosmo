# syntax=docker/dockerfile:1

FROM node:26.1.0-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends --only-upgrade libssl3 openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

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

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY --chown=node:node apps/api/package.json ./apps/api/package.json
COPY --chown=node:node apps/web/package.json ./apps/web/package.json
COPY --chown=node:node packages/core/package.json ./packages/core/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --chown=node:node apps/api ./apps/api
COPY --chown=node:node packages/core ./packages/core
COPY --chown=node:node --from=web-build /app/apps/web/build ./apps/web/build
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]
