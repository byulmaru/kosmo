## 1. Runtime migration command

- [x] 1.1 Add a minimal PostgreSQL migration runner that validates `DATABASE_URL`, uses one session, acquires a non-blocking advisory lock and invokes the installed Drizzle migrator against the repository migration directory.
- [x] 1.2 Add disposable PostgreSQL coverage for first apply, history-backed no-op rerun, migration failure and concurrent advisory lock rejection.
- [x] 1.3 Include the `drizzle/` directory in the production runtime image and add a `migrate` entrypoint without adding `drizzle-kit` to production dependencies.

## 2. Argo migration gate

- [x] 2.1 Add a Helm `PreSync` migration Job that uses the release image and existing dev database secret with one Pod, no automatic retry, a bounded deadline and non-root security context.
- [x] 2.2 Add deterministic Helm render coverage for the migration hook annotations, image, command, database environment, retry and deadline policy.

## 3. Dev deployment orchestration and verification

- [x] 3.1 Serialize Deploy Dev runs and run an Argo CD application full sync before the existing API/web Rollout restart actions so migration failure prevents restart.
- [x] 3.2 Update project deployment/script memory with the dev migration command, PreSync gate, `latest` downtime boundary and deferred production/smoke scope.
- [x] 3.3 Run migration integration, Helm render, workflow order, TypeScript, lint/format and strict OpenSpec validation, then confirm no application startup or initContainer migration path was introduced.
