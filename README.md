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

This starts local PostgreSQL, prepares the roles and databases, applies
immutable migrations as owner `kosmo`, and creates the configured Local
Instance as `kosmo_runtime`. The command is idempotent, but it is not part of the
normal service startup path.

For everyday development, run:

```sh
pnpm dev
```

This starts the prepared PostgreSQL, reuses the repository's existing ephemeral
Temporal development server, then runs API, Web, App, Worker, and the Fedify
queue consumer. It does not run migrations, bootstrap the Local Instance, reset,
seed, or delete database data. Run `pnpm local:down` to stop PostgreSQL while
preserving its named volume. Temporal stops with the development process.
Removing the PostgreSQL volume is an explicit destructive operation and is not
part of the normal local commands.

Before starting application processes, the command validates the fixed local
PostgreSQL and queue targets and required credential keys. Authentication and
connection errors are reported by the API, Worker, or Fedify consumer that owns
the connection. Role, ownership, and ACL invariants are established by
`pnpm local:prepare` and covered by focused integration tests; normal `pnpm dev`
does not repeat that privileged probe.
Only database-using services receive runtime credentials; the Expo App and
Temporal helper processes receive neither PostgreSQL nor queue credentials.
pnpm owns the child process lifecycle and one interrupt stops the development
processes.

New uploads send bytes through the existing Media HTTP upload service. It
enforces a shared 16 MiB per-file limit using the bytes actually received
before storing them in the Media service's private staging R2. Staged bytes stay
private until the explicit completion confirms the Media Storage Service's
final result. Preserve the Media ingress CORS policy for browser uploads;
browser-to-R2 CORS and direct-to-R2 upload URLs are not part of the client path.

The Kosmo API and Worker use `MEDIA_STORAGE_SERVICE_ORIGIN` and
`MEDIA_STORAGE_SERVICE_API_KEY` in their server-only Vault environments for
Media operations, including completion of previously issued uploads. The Media
service owns staging R2 access; Kosmo does not need staging R2 credentials. Keep
staging reads private and do not put Media credentials in the browser bundle.

Before deploying the Kosmo API or Worker, deploy Media service instances that
all support upload-ticket issuance, byte upload, and private staging metadata
checks. Roll back Kosmo before rolling back Media. An older Media instance can
return 404 for a staging metadata check, which appears to Kosmo as a missing
source.

A staged source is accepted only when its storage `LastModified` timestamp is
within 24 hours. Repeated completion requests join the stable workflow while it
is running, and already Ready Media is returned directly. A terminally failed
workflow is not restarted for the same Media ID. A caller timeout or disconnect,
including the 30-second request timeout, does not cancel that workflow. The
Media Storage Service workflow removes a source it consumes. A missing or
expired source, or another failure before Ready is persisted, leaves Media in
Uploading with its final URL, Media Type, and Ready At unset; the existing UI
retry starts a new upload session. Configure and verify a 48-hour lifecycle rule
for unconsumed staging objects before rollout.

The API also reads optional `KOSMO_LOCAL_TIMELINE_INSTANCE_IDS` from its
existing server-only Vault environment. For local development, set it in
`secret/kubernetes/kosmo/local`. Use a comma-separated list of Instance UUIDs;
entries are trimmed and blank entries are ignored. The configured Local Instance
is always included. If the value is absent or blank, no additional Instances are
included. A malformed nonblank UUID causes `localTimeline` resolution to error.

Run `pnpm dev`, then open `http://localhost:5173`. Local development uses Expo/Metro
on public port `5173`, the Hono web BFF on internal port `5174`, and the API on
`3000`. Metro proxies the BFF routes so the browser keeps the production same-origin
contract. Server deployments and tests override these defaults with `PORT`.

### Local Runtime Ports And Storage

PostgreSQL listens only on `127.0.0.1:54328` and stores data in the
`kosmo-local-postgres_postgres-data` named volume. Worker health/readiness uses
`127.0.0.1:8081`; Fedify consumer health/readiness uses `127.0.0.1:8082`.

Temporal listens on `127.0.0.1:7233`; its coordinator-only health endpoint uses
`127.0.0.1:8083`. `pnpm dev` reuses
`apps/worker/src/temporal-test-server.ts`, which starts the existing ephemeral
local server without a UI or persistent storage and stops with the development
process. `pnpm dev:worker` starts that server and only the Worker, so do not run
it alongside `pnpm dev`.

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
