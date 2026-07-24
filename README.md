# kosmo

## Architecture

- [Core service boundary](docs/architecture/core-services.md)
- [Domain model and policies](docs/domain/README.md)

## Infrastructure

AWS Terraform root is documented in [apps/terraform/README.md](apps/terraform/README.md).

## Development Secrets

Dev scripts load environment variables from Vault through `scripts/vault-run.mjs`.
Install the Vault CLI and set `VAULT_ADDR`; if needed, the wrapper runs
`vault login -method=oidc` before reading secrets. Use normal workspace scripts
such as `pnpm dev`. The default secret path is
`secret/kubernetes/kosmo/local`; use
`node scripts/vault-run.mjs --env dev -- pnpm --recursive --parallel --if-present dev`
or `node scripts/vault-run.mjs --secret-path secret/kubernetes/kosmo/dev -- <command>`
to point at another path.

To use Vault PKI client authentication for PostgreSQL, store
`DATABASE_PKI_ROLE` and `DATABASE_PKI_COMMON_NAME` together in that KV path.
`DATABASE_PKI_MOUNT` defaults to `pki`, and `DATABASE_PKI_TTL` is optional. The
wrapper issues a certificate for the command, exposes it through `PGSSLCERT`,
`PGSSLKEY`, and `PGSSLROOTCERT`, and removes the owner-only temporary files when
the command exits. Partial PKI settings fail instead of falling back to password
authentication. The Vault PKI issuer, roles, ACLs, and a PostgreSQL server
certificate covering both its cluster Service and Tailnet hostname must already
be provisioned outside this repository. Kubernetes PKI values also require a
Vault role for CNPG's `streaming_replica` certificate because the cluster does
not receive the CA private key.

Run `pnpm dev`, then open `http://localhost:5173`. Local development uses Expo/Metro
on public port `5173`, the Hono web BFF on internal port `5174`, and the API on
`3000`. Metro proxies the BFF routes so the browser keeps the production same-origin
contract. Server deployments and tests override these defaults with `PORT`.

## Test Postgres

Run a local PostgreSQL instance for tests with Docker Compose:

```sh
pnpm db:test:up
pnpm db:test:push
```

The test database connection string is defined in `.env.test`:

```sh
DATABASE_URL=postgres://kosmo:kosmo@localhost:54329/kosmo_test
```

Use `pnpm db:test:reset` to recreate only the default `kosmo_test` database while keeping the shared Postgres server running. Use `pnpm db:test:down` to stop the server, or add `-- --volumes --remove-orphans` when the Docker volume must also be removed.

## Web E2E

Run the web E2E command with:

```sh
pnpm --filter @kosmo/app exec playwright install chromium
pnpm test:e2e
```

Install Playwright Chromium once, then run the E2E command. The command keeps the Docker Postgres server running, creates a unique `kosmo_test_*` database for the execution, pushes the Drizzle schema, runs the Playwright specs under `apps/web/e2e`, and drops only that database afterward. Concurrent root test commands therefore share the server without sharing schema, fixture state, or local API/web/OIDC ports. An explicit loopback `DATABASE_URL` in the `kosmo_test_*` namespace takes precedence over `.env.test`; other hosts or database names are rejected before destructive test operations. The wrapper derives a port offset from the isolated database name; set `KOSMO_TEST_PORT_OFFSET` only when a specific runner slot needs a fixed offset. The Playwright config manages the API server, Expo web export, Hono BFF, and local OIDC mock. Set `PLAYWRIGHT_BROWSER_CHANNEL` only when you intentionally want to run against another local browser channel such as `chrome`.
