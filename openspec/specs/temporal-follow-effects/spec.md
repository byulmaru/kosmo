# temporal-follow-effects Specification

## Purpose

방향성 있는 Profile pair의 Follow·Follow Request transaction admission, pending lifecycle, effect settlement와 exact-row removal 계약을 정의한다.

## Requirements

### Requirement: Directed pair Follow lifecycle Workflow

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-720 — The system MUST satisfy this requirement.

The system MUST coordinate one directed follower/followee pair through a deterministic pair Workflow while that Follow lifecycle is active. The Workflow ID MUST be `profile-follow-pair:{followerProfileId}:{followeeProfileId}` (with the repository's canonical escaping/encoding for Profile IDs). The Workflow MUST be admitted with Update-with-Start using the pair identity, `USE_EXISTING` for an active execution, and `ALLOW_DUPLICATE` for a completed execution. It MUST NOT use a random operation identity, a command receipt, or remain open after the lifecycle reaches a terminal state.

#### Scenario: New attempt overlaps terminal effect drain

- **WHEN** a terminal Update has returned its committed result but the active pair run is still draining effects
- **THEN** a new Follow attempt for that pair may receive a retryable conflict and succeeds only after the terminal run closes; the system does not queue a new generation inside the terminal run

The Workflow has the following logical states:

```text
INITIAL → ESTABLISHED
INITIAL → PENDING → ESTABLISHED
                   ├→ REJECTED
                   └→ CANCELLED
```

`ESTABLISHED`, `REJECTED`, and `CANCELLED` are terminal. An established Follow is not kept alive for Unfollow; Unfollow is a separate short command.

#### Scenario: Start an open-policy Follow

- **WHEN** an authenticated caller sends a `FOLLOW` Update for an open-policy pair
- **THEN** the transaction Activity commits the Follow, the Update returns the DB result before effects finish, the Workflow enqueues the applicable effects, and the Workflow closes after the established lifecycle effects are processed

#### Scenario: Start an approval-required Follow

- **WHEN** an authenticated caller sends a `FOLLOW` Update for an approval-required pair
- **THEN** the transaction Activity commits the Follow Request, the Update returns the pending result before effects finish, the Workflow processes the pending effects, and the Workflow remains running for a terminal Pending Update

#### Scenario: Continue a Pending lifecycle

- **WHEN** a Pending pair receives an approved/accepted, rejected, cancelled, or applicable inbound terminal Update
- **THEN** the same pair Workflow runs the exact-row transaction, returns its committed result early, enqueues the transition effects in order, and moves to `ESTABLISHED`, `REJECTED`, or `CANCELLED` accordingly

#### Scenario: Remote terminal removal becomes unavailable

- **WHEN** a verified remote Reject or Undo reaches the transaction after participant availability changes and the exact request is not deleted
- **THEN** the Workflow returns a no-op, keeps the request lifecycle `PENDING`, and does not use an earlier snapshot as evidence of deletion

#### Scenario: Remote Accept becomes unavailable

- **WHEN** a verified remote Accept reaches the transaction after participant availability changes and the request cannot be promoted
- **THEN** the Workflow returns a no-op, keeps the request lifecycle `PENDING`, and does not expose the candidate Follow ID or enqueue a Follow create effect

#### Scenario: Reject an invalid Pending command

- **WHEN** a command does not match the current pair state or its expected request source is not the current exact row
- **THEN** the Update returns a domain conflict or no-op without changing pair state, and the Pending Workflow remains available for a valid terminal command

#### Scenario: Reopen a pair after a terminal lifecycle

- **WHEN** a new Follow arrives after the prior pair Workflow closed
- **THEN** Update-with-Start admits a new Workflow run under the same deterministic directed pair identity and does not reuse the prior run's state or effects

### Requirement: Ordered effects and lifecycle close

The system MUST append each committed transition's effects to a FIFO queue owned by the pair Workflow. Effects from an earlier transition MUST be processed before effects from a later transition. Ordered phases inside one transition MUST also remain sequential, including request cleanup before relationship creation. Every phase MUST use the shared settlement helper regardless of Activity count, so all applicable Notification/protocol siblings are attempted. The pair Workflow MUST invoke the registered effect Activities directly with stable source IDs and immutable deleted-source snapshots; it MUST NOT create separate Follow create/delete effect Workflows.

#### Scenario: Pending create followed quickly by terminal transition

- **WHEN** a Pending Follow Request is committed and approval, rejection, cancellation, or inbound termination arrives before the first effects finish
- **THEN** the Workflow preserves transition order in its FIFO effect queue, does not apply a later cleanup to an unrelated source, and returns each Update after its own DB commit rather than waiting for the entire queue

#### Scenario: Pending effect failure does not end the lifecycle

- **WHEN** a Notification or protocol effect for a Pending transition retries or reaches terminal failure
- **THEN** the Workflow records/observes the effect failure, keeps the pair in `PENDING`, and continues accepting a valid terminal Update; effect failure never rolls back the committed request

#### Scenario: Terminal transition closes the Workflow

- **WHEN** a pair transition commits `ESTABLISHED`, `REJECTED`, or `CANCELLED`
- **THEN** the Workflow stops accepting further lifecycle Updates, drains the already-enqueued effects in FIFO order, observes any terminal effect failure, and closes without reopening the pair

#### Scenario: Terminal transaction retries are exhausted

- **WHEN** a transaction or bootstrap Activity reaches its configured terminal failure while the pair is Pending
- **THEN** the Update fails, the Workflow drains already-enqueued effects, and the run closes with a typed failure instead of waiting indefinitely

#### Scenario: Unfollow remains a separate short command

- **WHEN** an established Follow is removed by local Unfollow or an established inbound Undo
- **THEN** the system runs the existing short Unfollow/removal command with its immutable Follow snapshot and does not reopen or extend the completed pair lifecycle Workflow

### Requirement: Follow transition effects and retry

The system MUST preserve existing source-correlated Notification and ActivityPub queue handoff semantics while moving the transaction admission and Pending lifecycle into the pair Workflow. The Update result is the committed domain result; effect completion is a separate Workflow concern.

#### Scenario: Duplicate or rolled-back transition

- **WHEN** a Follow or Pending transition is a duplicate, no-op, known domain failure, or rollback
- **THEN** the Update returns the existing domain outcome or failure and the Workflow appends no new source effect for a transition that did not commit

#### Scenario: Activity retry after commit

- **WHEN** a transaction or effect Activity is retried after a Worker failure
- **THEN** the transition re-checks pair state and exact source identity, and the effect reuses the stable source ID or immutable deleted snapshot without creating a later lifecycle's Notification or protocol activity

#### Scenario: Promote an existing request after transaction completion loss

- **WHEN** a new pair run captures an existing pending request, a `FOLLOW` promotes it under OPEN policy, and the transaction Activity retries after commit
- **THEN** the Workflow reuses the request snapshot already recorded in history and still schedules request Notification cleanup before relation creation effects

#### Scenario: Rehydrate a committed result after a concurrent terminal transition

- **WHEN** a successful Update commits a Follow or Request and that source row is removed before the caller rehydrates its GraphQL payload
- **THEN** the caller reconstructs the committed source from the minimal immutable snapshot in the Update result without storing a full DB row or `Temporal.Instant` in Workflow history

#### Scenario: Reconstruct an old removal after refollow

- **WHEN** Follow F1 removal commits, Activity completion is lost, and Follow F2 exists when the removal Activity retries
- **THEN** the retry preserves F2 and reconstructs only F1's delete effects from the immutable F1 snapshot

#### Scenario: Bound caller admission latency

- **WHEN** the Temporal server or Worker does not complete Update-with-Start admission
- **THEN** the pair and removal callers stop waiting at the bounded client RPC deadline without applying a Workflow run timeout to a legitimate Pending lifecycle

#### Scenario: Sibling effects remain independently attempted

- **WHEN** a committed transition has independent Notification and local protocol handoff effects
- **THEN** the Workflow attempts every applicable sibling in the transition's FIFO slot, reports terminal failure after settlement, and keeps the committed DB result
