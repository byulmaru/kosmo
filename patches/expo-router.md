# Expo Router Web URL patch

This is maintenance context for the temporary `expo-router@56.2.13` patch in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) and
[`expo-router@56.2.13.patch`](expo-router@56.2.13.patch). The app-level issue is
tracked by [PROD-1103](https://linear.app/byulmaru/issue/PROD-1103) and
[PR #1132](https://github.com/byulmaru/kosmo/pull/1132). The upstream fix is
tracked in [Expo issue #48439](https://github.com/expo/expo/issues/48439) and
[Expo PR #48467](https://github.com/expo/expo/pull/48467).

## Trigger and boundary

On a direct Web load or reload of a nested dynamic route, Relay can still be
loading the shell or profile data when Expo Router first serializes navigation
state. At that moment the parent layout exists but its child navigator has not
published its route state. Expo Router's fallback can select the first dynamic
child and serialize missing route parameters as `undefined`. A history write
can then briefly replace a valid URL such as a profile or post route with an
incomplete path, add an irrelevant query, or drop a nested suffix such as
`/reactions`. The route may render correctly after its child navigator mounts,
but the browser history has already received the incomplete path.

This PR implements the guard in Expo Router's Web linking/history boundary at
`build/fork/useLinking.js`. It recognizes an actual layout whose declared child
screens exist but whose nested route state is not ready, and defers a history
write only when the serialized fallback differs from the route's preserved
request path. The intended behavior is to resume normal URL synchronization
once the child route is available; verify this after resolving the listener
registration caveat below. Keep the initial URL synchronization and
state-change handling guards together: both can encounter the same incomplete
layout at different points in navigation.

This belongs at the Web history-writing boundary: filtering paths that contain
`undefined` catches only one symptom and can reject a valid route. The
`getPathFromState` first-child fallback also supports valid explicit group
navigation, so changing it globally would alter route resolution beyond this
history write. Keep the app's Session, authorization, blocked-profile,
actor-selection, and loading gates in place; they own visible routing and data,
while this patch owns deferring an unsafe URL write.
A compatible upstream release may use a different helper or source layout;
removal depends on equivalent Web URL behavior, not an identical implementation path.

## Invariants and current caveat

When a partial layout state is deferred, the linking listener must still be
registered and cleaned up normally. Do not advance previous-state or pending
pop-state bookkeeping using a transition that could not yet be serialized
safely; process the complete transition once the child route is ready.

As of the [PR #1132 head `9c59bafb`](https://github.com/byulmaru/kosmo/pull/1132)
on 2026-10-14, review flagged that the early return in the initial path can
skip `addListener` registration. Treat that as an unresolved correctness
caveat until the review finding is resolved and listener registration is
covered. The added
[`route-refresh.e2e.ts`](../apps/web/e2e/route-refresh.e2e.ts) assertions record
document, `pushState`, and `replaceState` URL history; they do not prove that
the linking listener was registered or that every navigation transition works.
At that head, the test asserts direct access and reload for static routes,
profile home/following, post detail/reactions, and `/privacy` with normal and
delayed shell/profile Relay responses; an unmatched route is tested without
the delay. It does not cover query/hash preservation on direct reload, internal
push/replace, the full back/forward flow, or listener registration. Treat this
as test-source coverage, not evidence that the current head or production
behavior passed every removal check.

## Removal gate

An upstream merge or issue closure is not enough. Remove this patch only after
a compatible Expo Router release is published and its Web linking/history
behavior has the equivalent protection. Upstream may refactor the helper or
source path; compare behavior at the Web history boundary, then run the
regression checks below against the unpatched package. Keep the behavioral
tests after removal so they protect the upstream fix from later dependency
upgrades.

Before removal is considered complete, verify:

- Direct access and reload preserve the full URL from the document request
  through every `pushState` and `replaceState` for static routes, profile home
  and following, post detail, and post reactions. Exercise normal and delayed
  shell/profile Relay responses, and include routes with query and hash values.
- Internal `push` and `replace`, query/hash-only changes, and browser
  back/forward still produce the expected URL and route state.
- Authentication redirects, blocked-profile behavior, actor selection/loading,
  and not-found routes retain their existing behavior.
- The incomplete initial state does not skip listener registration or cleanup,
  and a deferred state change does not consume partial previous-state or
  pending-pop bookkeeping.

Relevant existing suites include
[`route-refresh.e2e.ts`](../apps/web/e2e/route-refresh.e2e.ts),
[`reaction-people.e2e.ts`](../apps/web/e2e/reaction-people.e2e.ts),
[`search.e2e.ts`](../apps/web/e2e/search.e2e.ts),
[`navigation-scroll.e2e.ts`](../apps/web/e2e/navigation-scroll.e2e.ts), and
[`auth-routes.e2e.ts`](../apps/web/e2e/auth-routes.e2e.ts). Review their exact
assertions and run the cases that cover each removal check; their presence
alone does not prove that every invariant above is tested.

From the repository root, this focused command uses the same disposable
database wrapper as `pnpm test:e2e` while selecting the relevant Playwright
files:

```sh
node scripts/test-db.mjs run -- sh -c 'pnpm db:test:push &&
  pnpm --dir apps/web exec playwright test e2e/route-refresh.e2e.ts e2e/reaction-people.e2e.ts e2e/search.e2e.ts e2e/navigation-scroll.e2e.ts e2e/auth-routes.e2e.ts'
```

The wrapper starts the `postgres` service from `docker-compose.test.yml`,
creates a unique disposable `kosmo_test_*` database, supplies the database
`DATABASE_URL`, `PG*`, and per-run port-offset environment, then drops only
that database. Playwright manages the local API, Web, worker, Temporal, and
OIDC test services. Install Playwright Chromium before running this command.
This is the removal-time verification recipe; it is not a test result for this
documentation change.

## Removal steps

1. Confirm a compatible Expo Router release is published and inspect its
   implementation and regression evidence for equivalent Web linking/history
   behavior. An upstream refactor may use a different helper or source path.
2. Before changing the dependency, run `pnpm patch-remove expo-router@56.2.13`.
   The current workspace pnpm CLI supports this command; it removes the
   `patchedDependencies` entry, patch file, and lockfile patch metadata. Remove
   the exact-version mapping before dependency resolution so it cannot remain
   as an unused patch and block the update.
3. Update `apps/app/package.json` through pnpm using the verified release,
   such as `pnpm --filter @kosmo/app add "expo-router@<published-version>"`;
   this materializes the unpatched package and updates the lockfile. Confirm
   the lockfile resolves that version and the installed package contains the
   expected behavior.
4. Run the removal-gate checks above with the local patch disabled. Update
   this note and the adjacent TODO comment with the upstream release and
   verification evidence; remove or rewrite the TODO so no stale patch link
   remains.
