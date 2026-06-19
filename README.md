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

Run the full web E2E suite with:

```sh
pnpm test:e2e
```

This installs the Playwright Chromium headless shell if needed, recreates the test Postgres container, pushes the Drizzle schema, then starts the API server, web preview server, and local OIDC mock for Playwright. Set `PLAYWRIGHT_BROWSER_CHANNEL` only when you intentionally want to run against another local browser channel such as `chrome`.
