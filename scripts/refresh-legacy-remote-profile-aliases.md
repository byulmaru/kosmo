# Legacy remote profile URL refresh

This operator command lists and refreshes legacy ActivityPub actors whose `profile_url` is still NULL. It selects only ACTIVE profiles on ACTIVE ActivityPub instances with a non-NULL `last_fetched_at` earlier than both the normal seven-day refresh TTL and 2026-09-11. Results are ordered by actor URI so `--after` provides a stable page cursor. Each invocation starts at most 100 Workflows; the default is 25.

The command defaults to a dry-run that prints the actor URIs and resume cursor. Review that list, then repeat the same arguments with `--execute` to start the existing `remoteProfileRefreshWorkflow`. It uses the Workflow's existing actor URI based ID and ordinary refresh behavior; it does not update `profile_url` directly or bypass the Workflow's TTL check. The refresh fetches the actor's normal full profile. If the actor document has no `url`, `profile_url` can remain NULL after a successful refresh.

Run this command only in an environment that already has the application's runtime `PG*` database variables and `TEMPORAL_ADDRESS` / `TEMPORAL_NAMESPACE` configured. It adds no credentials or direct fetch path.

```sh
pnpm ops:refresh-legacy-remote-profile-aliases -- --limit 25
pnpm ops:refresh-legacy-remote-profile-aliases -- --limit 25 --execute
pnpm ops:refresh-legacy-remote-profile-aliases -- --limit 25 --after 'https://remote.example/users/alice'
```

The printed resume cursor identifies the next page; advance to it only after all Workflow starts for the current page are acknowledged. If an execution fails partway through, retry with the current invocation's original `--after` cursor (or omit `--after` for the first page). Already-started Workflow IDs coalesce, while unstarted actors remain eligible for a later pass.
