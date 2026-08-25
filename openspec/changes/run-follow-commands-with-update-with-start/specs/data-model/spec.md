## ADDED Requirements

### Requirement: Directed Follow pair identity

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-720 — The system MUST satisfy this requirement.

The system MUST use the ordered follower and followee Profile IDs as the identity of one directed Follow pair. The pair identity MUST be deterministic and MUST NOT introduce a random operation identity or a new receipt table. Existing Follow and Follow Request rows remain the authoritative domain state; their row IDs remain the exact source identities for protocol and Notification effects.

#### Scenario: Derive a directed pair identity

- **WHEN** a caller starts a Follow lifecycle for follower `A` and followee `B`
- **THEN** the Workflow ID is `profile-follow-pair:A:B` (with the repository's canonical escaping/encoding for Profile IDs), and `B → A` uses a different ID

#### Scenario: Reuse a pair identity after a terminal lifecycle

- **WHEN** the active pair Workflow is running or the previous pair run has completed
- **THEN** Update-with-Start uses `USE_EXISTING` for the active run and `ALLOW_DUPLICATE` for a completed run so a new Follow lifecycle can use the same directed pair identity

#### Scenario: Pair rows remain authoritative

- **WHEN** a Follow, Follow Request, approval, rejection, cancellation, or protocol transition is committed
- **THEN** the existing pair uniqueness and exact-row rules remain the source of truth, and the Workflow identity does not replace the Follow or Follow Request row ID

### Requirement: Retry reconstruction without a command receipt

The system MUST make pair transition Activities safe for at-least-once execution without adding a command receipt, generic ledger, or lifecycle outbox table. A retry MUST re-check the directed pair and the expected source identity before applying DML or producing effects. Before a create transition, the Workflow MUST assign the candidate Follow or Follow Request row ID and preserve it in history; the Activity MUST insert that exact domain row ID. The candidate row ID is the identity of the entity that may be created, not a command operation ID or receipt key.

#### Scenario: Retry after a committed transition loses completion

- **WHEN** a transition Activity commits and its completion is lost before Temporal records it
- **THEN** a retry compares the current row with the candidate domain row ID preserved in Workflow history, recognizes the already-applied transition without confusing it with a pre-existing row, does not apply it twice, and returns the same Follow or Follow Request source identity

#### Scenario: Retry a deletion transition

- **WHEN** a retry needs an object that was deleted by the committed transition
- **THEN** the command carries or deterministically reconstructs the minimum immutable deleted-source snapshot required by its effects, including the exact source ID and creation time, rather than reading a later row for the same pair

#### Scenario: Stale source does not mutate a new lifecycle

- **WHEN** a delayed command names a source row that no longer represents the current pair lifecycle
- **THEN** exact-row validation makes the command a no-op or domain conflict and prevents it from deleting or creating effects for a later Follow or Follow Request

#### Scenario: Transaction rollback

- **WHEN** a pair transition rolls back or is rejected as a known domain error
- **THEN** no Follow or Follow Request state, source snapshot, or downstream effect is committed for that transition

#### Scenario: Pair concurrency remains database-owned

- **WHEN** concurrent callers attempt a transition for the same directed pair
- **THEN** existing unique constraints, exact-row predicates, and atomic domain DML decide the committed result; the pair Workflow does not become a separate database mutex
