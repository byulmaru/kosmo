## Active Decisions

### Keep the Post transaction at the request/core boundary

- **Type:** Derived Contract
- **Authority:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-722
- **Decision:** Local GraphQL and ActivityPub Create keep using the existing core transaction for Post, PostContent, and ActivityPub mapping. Temporal owns only effects attempted after the actual outer commit.
- **Reason:** Moving the transaction into an at-least-once Activity would add ambiguous-commit handling, stable proposed IDs, and request-time Temporal coupling without improving the database transaction's atomicity.
- **Rejected:** A Temporal command Workflow whose Activity owns the Post transaction.

### Accept the commit-to-Workflow-start loss window

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722
- **Decision:** After commit, the caller attempts to start the effects Workflow. A process crash or start failure in this interval may lose the effects; the failure is observed but does not reverse the Post or fail its response.
- **Reason:** Closing this window requires a durable intent such as a transactional outbox, which is intentionally outside this change.
- **Rejected:** Command receipts, transactional outbox/relay, automatic reconciliation, or an exactly-once commit-to-start claim.

### Deduplicate accepted effects Workflows by committed Post ID

- **Type:** Implementation Choice
- **Authority:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-722
- **Decision:** The post-commit lifecycle starts a deterministic Workflow identity derived only from the committed Post ID; explicit origin is Workflow input, not part of the identity. A start conflicts with any running execution and rejects reuse after any closed execution. Duplicate/no-op Create results do not start or backfill a Workflow.
- **Reason:** A committed Post ID is already the stable identity required to converge repeated start attempts, without introducing a proposed identifier before commit.

### Run Notification and federation handoff as independent effects

- **Type:** Derived Contract
- **Authority:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-722
- **Decision:** An accepted Workflow runs Reply Notification and Local-origin Fedify queue handoff through separate retryable Activities. A terminal failure of one effect must not prevent the other effect from being attempted. ActivityPub-origin Posts do not emit an outbound Create echo.
- **Reason:** The effects have different applicability and retry boundaries, while neither is allowed to alter the already committed Post result.

### Use one compile-time Worker registration and one process host

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722, PROD-730
- **Decision:** The Worker package owns its concrete registration at compile time, and the production entrypoint starts one process-global Worker host without an injected registration or a Worker-specific enabled flag.
- **Reason:** The deployed Worker has one real workload and no supported idle or disabled application state.

### Consume the platform-supplied default database handle

- **Type:** Derived Contract
- **Authority:** `docs/architecture/core-services.md`, PROD-722
- **Decision:** Worker Activities use the process-standard `db` configuration and PostgreSQL environment contract. This change does not add a Worker-specific pool, database handle, credential family, or Fedify request DB context.
- **Reason:** Database principal and RLS cleanup is owned separately and is not required for the Temporal effects boundary.

## Superseded Decisions

### Move the Post transaction into a Temporal Activity

- **Recorded:** 2026-08-16
- **Status:** Superseded immediately during PROD-722 design review
- **Replacement:** Keep the Post transaction at the request/core boundary and start only the post-commit effects Workflow.
- **Reason:** The Activity did not add transaction atomicity and instead required proposed Post IDs and ambiguous-commit/idempotency machinery.

### Limit the change to Reply Notification only

- **Recorded:** 2026-08-10
- **Status:** Superseded
- **Replacement:** Move both Reply Notification and Local-origin Fedify queue handoff into the same post-commit effects Workflow while preserving independent retry boundaries.

## Remaining Decisions

없음.
