# kosmo

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
pnpm test:e2e
```

This installs Playwright Chromium if needed, recreates the test Postgres container, pushes the Drizzle schema, then runs any Playwright specs under `apps/web/e2e`. The Playwright config manages the API server, web preview server, and local OIDC mock when browser specs are present. Set `PLAYWRIGHT_BROWSER_CHANNEL` only when you intentionally want to run against another local browser channel such as `chrome`.
