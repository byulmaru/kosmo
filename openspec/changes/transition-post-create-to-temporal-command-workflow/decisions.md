## Active Decisions

### Let the core Post action own its transaction and Workflow start boundary

- **Type:** Derived Contract
- **Authority:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-722
- **Decision:** Local GraphQL and ActivityPub Create call `createPost(input)` without a database handle. The core action owns the Post, PostContent, and ActivityPub mapping transaction and attempts the Temporal effects Workflow start after that transaction commits and before returning. It does not return a `postCommit` callback to callers.
- **Reason:** Moving the transaction into an at-least-once Activity would add ambiguous-commit handling and proposed IDs, while preserving caller-owned transactions would keep the callback composition that this transition removes.
- **Rejected:** A Temporal command Workflow whose Activity owns the Post transaction; caller-supplied `DatabaseHandle`/`ctx.db`; a returned `postCommit` lifecycle.

### Accept the commit-to-Workflow-start loss window

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722
- **Decision:** After its transaction commits, the core Post action attempts to start the effects Workflow before returning. A process crash or start failure in this interval may lose the effects; the failure is observed but does not reverse the Post or fail its response.
- **Reason:** Closing this window requires a durable intent such as a transactional outbox, which is intentionally outside this change.
- **Rejected:** Command receipts, transactional outbox/relay, automatic reconciliation, or an exactly-once commit-to-start claim.

### Deduplicate accepted effects Workflows by committed Post ID

- **Type:** Implementation Choice
- **Authority:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-722
- **Decision:** The core Post action starts a deterministic Workflow identity derived only from the committed Post ID after its transaction commits; explicit origin is Workflow input, not part of the identity. A start conflicts with any running execution and rejects reuse after any closed execution. Duplicate/no-op Create results do not start or backfill a Workflow.
- **Reason:** A committed Post ID is already the stable identity required to converge repeated start attempts, without introducing a proposed identifier before commit.

### Run Notification and federation handoff as independent effects

- **Type:** Derived Contract
- **Authority:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-722
- **Decision:** An accepted Workflow runs Reply Notification and Local-origin Fedify queue handoff through separate retryable Activities. A terminal failure of one effect must not prevent the other effect from being attempted. ActivityPub-origin Posts do not emit an outbound Create echo.
- **Reason:** The effects have different applicability and retry boundaries, while neither is allowed to alter the already committed Post result.

### Use one compile-time Worker registration and one process host

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722, PROD-730
- **Decision:** The Worker package owns its concrete registration at compile time, and the production entrypoint directly starts and owns one process-global Worker host without an exported `runWorker`/`startWorker` API, injected registration or Worker-specific enabled flag.
- **Reason:** The deployed Worker has one real workload and one process entrypoint. A memoized callable startup layer would expose restart-like surface area without a second valid caller.

### Render every application workload without an activation gate

- **Type:** Derived Contract
- **Authority:** `PROD-722`, user decision recorded in Linear
- **Decision:** Helm always renders API, Web, Fedify consumer, and the singleton Worker when a valid immutable release image is supplied. Neither a chart-wide workload activation key nor a Worker-specific activation key controls resource existence. Terraform and the release workflow retain their existing ownership of release parameters, but neither owns a false/true workload switch.
- **Reason:** The production runtime has passed its one-time bootstrap boundary, and a second switch can leave a declared release silently without its application workloads. Resource rendering should follow the immutable release input directly.
- **Consequences:** Missing or invalid image input remains a render/configuration error, not a supported workload-disabled bootstrap state. Secret restart targets and Worker credential wiring apply to the always-rendered workloads. Production sync, apply, rollout, and live verification remain separately approval-gated.

### Consume the platform-supplied default database handle

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722
- **Decision:** Worker Activities use the process-standard `db` configuration and PostgreSQL environment contract. This change does not add a Worker-specific pool, database handle, credential family, or Fedify request DB context.
- **Reason:** Database principal and RLS cleanup is owned separately and is not required for the Temporal effects boundary.

### Let the Reply Notification Activity own its persistence

- **Type:** Implementation Choice
- **Authority:** `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, PROD-722
- **Decision:** The Worker Activity reloads the committed Reply, applies recipient, self-suppression, visibility and uniqueness rules, and writes the Notification directly with the process default `db`. It does not delegate to a pass-through `packages/core/services` action.
- **Reason:** Reply Notification materialization has one production entrypoint after this transition. A separately exported core action would add a test-driven wrapper without a shared runtime caller.
- **Rejected:** Keeping `createReplyNotification` in core solely for Activity delegation or test fixture setup.

## Superseded Decisions

### Move the Post transaction into a Temporal Activity

- **Recorded:** 2026-08-16
- **Status:** Superseded immediately during PROD-722 design review
- **Replacement:** Keep the Post transaction inside the core action and start only the post-commit effects Workflow.
- **Reason:** The Activity did not add transaction atomicity and instead required proposed Post IDs and ambiguous-commit/idempotency machinery.

### Limit the change to Reply Notification only

- **Recorded:** 2026-08-10
- **Status:** Superseded
- **Replacement:** Move both Reply Notification and Local-origin Fedify queue handoff into the same post-commit effects Workflow while preserving independent retry boundaries.

### Preserve caller-owned transaction and returned postCommit compatibility

- **Recorded:** 2026-08-16
- **Status:** Superseded during implementation review
- **Replacement:** `createPost(input)` owns its transaction and attempts the Workflow start after commit without accepting a database handle or returning a callback.
- **Reason:** There is no production Post Create caller that needs to compose this action inside an outer transaction, and retaining the injection/callback boundary defeats the simplification sought by the Temporal transition.

## Remaining Decisions

없음.
