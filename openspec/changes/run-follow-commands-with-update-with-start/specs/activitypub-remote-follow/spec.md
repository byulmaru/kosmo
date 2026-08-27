## REMOVED Requirements

### Requirement: Fedify follow protocol boundary

**Reason:** The Follow protocol boundary is retained below with the pair lifecycle admission and no-echo contract.
**Migration:** Use `Verified inbound Follow boundary and no echo` for ingress validation and direct Accept ownership.

### Requirement: Outbound remote follow

**Reason:** Local-to-remote Follow transitions are consolidated under the deterministic directed pair lifecycle.
**Migration:** Use `Remote Follow transitions use the directed pair lifecycle`.

### Requirement: Inbound remote follow

**Reason:** Inbound Follow, Accept, Reject, and Undo transitions are consolidated under the verified pair lifecycle boundary.
**Migration:** Use `Verified inbound Follow boundary and no echo` and the canonical Fedify ingress documents.

## ADDED Requirements

### Requirement: Remote Follow transitions use the directed pair lifecycle

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-720 — The system MUST satisfy this requirement.

The system MUST route verified local-to-remote Follow and pending-request transitions through the deterministic directed pair Workflow. The Workflow identity is derived from the follower and followee Profile IDs, uses `USE_EXISTING` for an active lifecycle and `ALLOW_DUPLICATE` for a completed lifecycle, and returns the committed state before Fedify queue effects complete.

#### Scenario: Follow an open remote Profile

- **WHEN** an active local follower sends a Follow to an open remote followee
- **THEN** the pair Workflow commits the relation, returns the result early, and enqueues the local-origin Follow handoff with the stable relation source identity

#### Scenario: Follow an approval-required remote Profile

- **WHEN** an active local follower sends a Follow to an approval-required remote followee
- **THEN** the pair Workflow commits the Pending request, returns the result early, and enqueues the local-origin Follow handoff while remaining available for a later Accept, Reject, or Cancel Update

#### Scenario: Remote Accept completes a Pending lifecycle

- **WHEN** a verified remote Accept matches the exact local-origin Pending source for the directed pair
- **THEN** the same pair Workflow atomically removes the request and creates the relation, processes request cleanup before relation effects, and emits no outbound Accept or Follow echo

#### Scenario: Remote Reject terminates a Pending lifecycle

- **WHEN** a verified remote Reject matches the exact local-origin Pending source
- **THEN** the pair Workflow removes only that request source, processes cleanup, closes the Pending lifecycle, and emits no outbound protocol echo

#### Scenario: Local Unfollow remains separate

- **WHEN** a local follower removes an established remote Follow
- **THEN** the separate short Unfollow command uses the exact Follow ID and directed pair to enqueue the outbound Undo and does not reopen the completed pair lifecycle Workflow

#### Scenario: Suspended remote instance

- **WHEN** remote instance policy is SUSPENDED or otherwise rejects the transition
- **THEN** the transaction returns a known non-retryable domain failure and relation, count, request, and effects remain unchanged

### Requirement: Verified inbound Follow boundary and no echo

The system MUST preserve the Fedify ingress trust boundary. Protocol validation, remote actor materialization, local recipient binding, and direct inbound Accept(Follow) handoff remain in the ingress; only the verified domain transition enters the pair Workflow. ActivityPub-origin effects MUST NOT create outbound Follow or Undo echoes.

#### Scenario: Reject an unavailable or invalid remote actor

- **WHEN** actor, object, recipient, delivery target, instance state, or supported input validation fails
- **THEN** ingress does not start or update a pair Workflow and does not change graph state or send a protocol response beyond the existing rejection/observation boundary

#### Scenario: Receive an inbound Follow for a local actor

- **WHEN** a remote Follow passes actor, object, recipient, and materialization validation
- **THEN** ingress sends a `FOLLOW` Update to the directed pair Workflow, receives the committed result, and keeps the existing direct Accept(Follow) handoff in ingress; the Workflow creates only applicable Notification effects

#### Scenario: Inbound Follow creates Pending state

- **WHEN** the local recipient requires approval for a verified inbound Follow
- **THEN** the pair Workflow creates the Pending request and remains available for a verified Accept, Reject, or Undo transition without sending an outbound Follow echo

#### Scenario: Inbound Accept or Reject uses exact projection identity

- **WHEN** a verified Accept or Reject references a local projection
- **THEN** ingress validates the actor/object/recipient and projection identity, the pair transaction rechecks the exact expected request or Follow row, and a mismatch becomes a no-op or domain conflict without changing another lifecycle

#### Scenario: Inbound Undo of an established relation

- **WHEN** a verified remote Undo removes an established relation
- **THEN** the separate short removal command uses the exact current Follow source, performs Notification cleanup, and emits no outbound Undo echo

#### Scenario: Other inbox activity

- **WHEN** a verified inbox activity is not a Follow lifecycle command
- **THEN** this capability creates neither a pair Workflow transition nor a Follow graph effect
