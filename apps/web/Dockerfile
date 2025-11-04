FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @kosmo/web...

COPY apps/web ./apps/web
COPY apps/api/schema.graphql ./apps/web/schema.graphql
COPY turbo.json ./

WORKDIR /app/apps/web
ENV NODE_ENV=build
RUN pnpm build

FROM node:24-alpine AS runner
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/build ./build

WORKDIR /app

EXPOSE 3000

CMD ["node", "build"]

