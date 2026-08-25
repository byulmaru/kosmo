## REMOVED Requirements

### Requirement: Follow Notification source correlation

**Reason:** Follow and Follow Request source correlation is consolidated into one pair lifecycle requirement.
**Migration:** Use `Follow lifecycle Notification effects`.

### Requirement: Follow Notification 실패 격리

**Reason:** Notification failure handling is consolidated into the pair lifecycle failure requirement.
**Migration:** Use `Notification failure isolation and continuation`.

### Requirement: Follow source 생명주기 정리

**Reason:** Follow source cleanup is consolidated with Follow Request cleanup and separate Unfollow behavior.
**Migration:** Use `Follow lifecycle Notification effects`.

### Requirement: Follow Request Notification source lifecycle

**Reason:** Follow Request source lifecycle is consolidated with the directed pair lifecycle.
**Migration:** Use `Follow lifecycle Notification effects`.

### Requirement: Follow Request Notification 실패 격리와 관찰

**Reason:** Follow Request failure handling is consolidated with Follow Notification failure handling.
**Migration:** Use `Notification failure isolation and continuation`.

## ADDED Requirements

### Requirement: Follow lifecycle Notification effects

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, PROD-720 — The system MUST satisfy this requirement.

The system MUST attach Follow and Follow Request Notification effects to the committed transition of the deterministic directed pair Workflow. A Notification effect MUST use the committed Follow or Follow Request row ID as its source identity and MUST be appended to the pair Workflow's FIFO effect queue only after the source transition commits.

#### Scenario: Established Follow Notification

- **WHEN** an open-policy Follow creates a new relation for a local recipient
- **THEN** the Update returns the committed relation result first and the Workflow later creates the source-correlated Follow Notification

#### Scenario: Pending Follow Request Notification

- **WHEN** an approval-required Follow creates a new request for a local recipient
- **THEN** the Workflow creates the source-correlated Follow Request Notification after commit and keeps the pair lifecycle Pending

#### Scenario: Approval transition Notification order

- **WHEN** an approval or verified Accept atomically removes the exact request and creates a Follow relation
- **THEN** the FIFO effect queue removes the request Notification before creating the new relation Notification, using each source's own immutable identity

#### Scenario: Rejection or cancellation cleanup

- **WHEN** a Pending request is rejected, cancelled, or terminated by a verified inbound transition
- **THEN** the Workflow enqueues only the exact request Notification cleanup and the pair lifecycle closes without creating a Follow Notification

#### Scenario: Duplicate transition

- **WHEN** a command observes an existing Follow or existing Pending request and commits no new source row
- **THEN** the Workflow enqueues no new Notification and does not attempt to repair an unrelated missing historical Notification

#### Scenario: Source isolation across refollow

- **WHEN** an old Follow or Follow Request is removed and a later lifecycle creates a new source row for the same directed pair
- **THEN** cleanup uses the old source ID and cannot remove the later lifecycle's Notification

#### Scenario: Separate Unfollow cleanup

- **WHEN** an established Follow is removed by the separate short Unfollow/removal command
- **THEN** its source-correlated Follow Notification cleanup uses the deleted Follow snapshot and does not reopen the completed pair lifecycle Workflow

### Requirement: Notification failure isolation and continuation

The system MUST keep Notification failures separate from the committed Follow lifecycle result. The pair Workflow MUST preserve Pending state when a Pending Notification effect fails and MUST close a terminal lifecycle without rolling back its domain transition.

#### Scenario: Early commit result

- **WHEN** the pair transaction commits before a Notification Activity completes
- **THEN** the Update caller receives the domain result, while the Workflow retries or observes the Notification failure independently

#### Scenario: Pending Notification failure

- **WHEN** a Pending request Notification retry or terminal failure occurs
- **THEN** the request row and Pending Workflow remain available for approve, accept, reject, cancel, or applicable inbound termination

#### Scenario: Terminal Notification failure

- **WHEN** a terminal transition's Notification cleanup or creation fails after the DB commit
- **THEN** the committed state is preserved, all applicable FIFO sibling effects are attempted, and the failure is observable when the pair Workflow closes

#### Scenario: Recipient and origin policy

- **WHEN** the Followee is remote or the transition originates from ActivityPub
- **THEN** the Notification effect follows the existing recipient/source policy, and no outbound protocol echo is inferred from creating or removing a Notification
