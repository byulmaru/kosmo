# kosmo

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

Use `pnpm db:test:reset` to recreate the container with an empty data directory, and `pnpm db:test:down` to stop it.

## Web E2E

Run the web E2E command with:

```sh
pnpm --filter @kosmo/app exec playwright install chromium
pnpm test:e2e
```

Install Playwright Chromium once, then run the E2E command. The command recreates the test Postgres container, pushes the Drizzle schema, and runs the Playwright specs under `apps/web/e2e`. The Playwright config manages the API server, Expo web export, Hono BFF, and local OIDC mock. It intentionally ignores ambient `DATABASE_URL` values and uses `.env.test` instead, so the reset, schema push, and Playwright servers share the same database. Set `PLAYWRIGHT_BROWSER_CHANNEL` only when you intentionally want to run against another local browser channel such as `chrome`.
