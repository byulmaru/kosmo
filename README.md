# kosmo

## Architecture

- [Core service boundary](docs/architecture/core-services.md)
- [Domain model and policies](docs/domain/README.md)

## Infrastructure

AWS Terraform root is documented in [apps/terraform/README.md](apps/terraform/README.md).

## Local Development

Install Docker and the Vault CLI, set `VAULT_ADDR`, and authenticate with Vault.
The wrapper runs `vault login -method=oidc` when the current token is unavailable.
An operator must set the following local-only values; repository scripts never
create, update, delete, copy, or print these credentials.

`secret/kubernetes/kosmo/local`:

- `PGHOST=127.0.0.1`
- `PGPORT=54328`
- `PGDATABASE=kosmo`
- `PGUSER=kosmo_runtime`
- `PGPASSWORD`: local application runtime password
- `FEDIFY_QUEUE_DATABASE_URL=postgres://kosmo_fedify_queue@127.0.0.1:54328/kosmo_fedify_queue`
- `FEDIFY_QUEUE_DATABASE_PASSWORD`: local Fedify queue role password
- `PUBLIC_ORIGIN`: existing local public origin, normally `http://localhost:5173`
- the existing local application keys required by API, Web, and App

`secret/kubernetes/kosmo/local/postgres-bootstrap`:

- `LOCAL_POSTGRES_ADMIN_PASSWORD`: local container administrator password
- `LOCAL_POSTGRES_OWNER_PASSWORD`: local migration owner `kosmo` password

Do not copy dev or production database credentials into either path. Application
processes use only canonical `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and
`PGPASSWORD`; they do not use `DATABASE_URL`. The migration owner, non-owner
`kosmo_runtime`, and `kosmo_fedify_queue` database/role remain separate as defined
by [ADR 0024](docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md).

For a new or empty PostgreSQL volume, run the explicit one-time preparation:

```sh
pnpm local:prepare
```

This starts local PostgreSQL and Temporal, prepares the roles and databases,
applies immutable migrations as owner `kosmo`, and creates the configured Local
Instance as `kosmo_runtime`. The command is idempotent, but it is not part of the
normal service startup path.

For everyday development, run:

```sh
pnpm dev
```

This starts the prepared PostgreSQL and ephemeral Temporal services, then API,
Web, App, Worker, and the Fedify queue consumer. It does not run migrations,
bootstrap the Local Instance, reset, seed, or delete database data. Run
`pnpm local:down` to stop PostgreSQL and Temporal while preserving the PostgreSQL
named volume. Removing that volume is an explicit destructive operation and is
not part of the normal local commands.

Before starting any application process, the command authenticates the runtime
and queue principals and checks the expected database, role attributes,
membership, ownership, and application table privileges. A wrong password or a
drifted role boundary fails before services start. Only database-using services
receive the runtime credentials; the Expo App process receives neither
PostgreSQL nor queue credentials. One interrupt stops every child service while
leaving the two Compose services available for the next run.

The API uses `MEDIA_STORAGE_SERVICE_ORIGIN` and `MEDIA_STORAGE_SERVICE_API_KEY`
to issue browser upload URLs and persist the completed public representation
reported by Media Storage Service. These are server-only values loaded through
the same Vault environment and must not be exposed to the browser bundle.

Run `pnpm dev`, then open `http://localhost:5173`. Local development uses Expo/Metro
on public port `5173`, the Hono web BFF on internal port `5174`, and the API on
`3000`. Metro proxies the BFF routes so the browser keeps the production same-origin
contract. Server deployments and tests override these defaults with `PORT`.

### Local Runtime Ports And Storage

PostgreSQL listens only on `127.0.0.1:54328` and stores data in the
`kosmo-local-postgres_postgres-data` named volume. Worker health/readiness uses
`127.0.0.1:8081`; Fedify consumer health/readiness uses `127.0.0.1:8082`.

Temporal listens on `127.0.0.1:7233`, with its UI at `http://localhost:8233`.
`docker-compose.temporal.local.yml` uses the official `start-dev` temporary store
and intentionally has no persistent SQLite volume. `pnpm temporal:down` therefore
does not promise Workflow history preservation; `pnpm temporal:up` starts it
separately. `pnpm dev:worker` starts the prepared local services and only the
Worker, so do not run it alongside `pnpm dev`.

## Test Postgres

Run a local PostgreSQL instance for tests with Docker Compose:

```sh
pnpm db:test:reset
pnpm db:test:push
```

The test database connection string is defined in `.env.test`:

```sh
DATABASE_URL=postgres://kosmo:kosmo@localhost:54329/kosmo_test
```

`db:test:push` applies the migration chain before synchronizing the Drizzle schema, so reset a legacy push-only test database before the first run after this change. `pnpm db:test:reset` recreates only the default `kosmo_test` database while keeping the shared Postgres server running. Use `pnpm db:test:down` to stop the server, or add `-- --volumes --remove-orphans` when the Docker volume must also be removed.

## Web E2E

Run the web E2E command with:

```sh
pnpm --filter @kosmo/app exec playwright install chromium
pnpm test:e2e
```

Install Playwright Chromium once, then run the E2E command. The command keeps the Docker Postgres server running, creates a unique `kosmo_test_*` database for the execution, pushes the Drizzle schema, runs the Playwright specs under `apps/web/e2e`, and drops only that database afterward. Concurrent root test commands therefore share the server without sharing schema, fixture state, or local API/web/OIDC ports. An explicit loopback `DATABASE_URL` in the `kosmo_test_*` namespace takes precedence over `.env.test`; other hosts or database names are rejected before destructive test operations. The wrapper derives a port offset from the isolated database name; set `KOSMO_TEST_PORT_OFFSET` only when a specific runner slot needs a fixed offset. The Playwright config manages the API server, Expo web export, Hono BFF, and local OIDC mock. Set `PLAYWRIGHT_BROWSER_CHANNEL` only when you intentionally want to run against another local browser channel such as `chrome`.
