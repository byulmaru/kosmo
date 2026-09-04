# temporal-follow-effects Specification

## Purpose

방향성 있는 Profile pair의 Follow·Follow Request transaction admission, pending lifecycle, effect settlement와 exact-row removal 계약을 정의한다.

## Requirements

### Requirement: Directed pair Follow lifecycle Workflow

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-720, PROD-892 — The system MUST satisfy this requirement.

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
- **THEN** the Workflow returns a no-op, keeps the request lifecycle `PENDING`, and does not enqueue a Follow create effect

#### Scenario: Reject an invalid Pending command

- **WHEN** a command does not match the current pair state or its expected request source is not the current exact row
- **THEN** the Update returns a domain conflict or no-op without changing pair state, and the Pending Workflow remains available for a valid terminal command

#### Scenario: Reopen a pair after a terminal lifecycle

- **WHEN** a new Follow arrives after the prior pair Workflow closed
- **THEN** Update-with-Start admits a new Workflow run under the same deterministic directed pair identity and does not reuse the prior run's state or effects

### Requirement: Ordered effects and lifecycle close

The system MUST append each committed transition's effects to a FIFO queue owned by the pair Workflow. Effects from an earlier transition MUST be processed before effects from a later transition. Ordered phases inside one transition MUST also remain sequential, including request cleanup before relationship creation. Every phase MUST use the shared settlement helper regardless of Activity count, so all applicable Notification/protocol siblings are attempted. The pair Workflow MUST invoke the registered effect Activities directly with stable create source IDs or exact deleted source IDs and directed pairs; it MUST NOT create separate Follow create/delete effect Workflows.

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
- **THEN** the system runs the existing short Unfollow/removal command with its exact deleted Follow source ID and directed pair and does not reopen or extend the completed pair lifecycle Workflow

### Requirement: Follow transition effects and retry

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, PROD-892 — The system MUST satisfy this requirement.

시스템은 transaction admission과 Pending lifecycle을 pair Workflow에서 처리하면서 기존 source-correlated Notification과 ActivityPub queue handoff 의미를 유지해야 한다(MUST). 신규 ProfileFollow와 ProfileFollowRequest insert는 ID를 지정하지 않고 PostgreSQL `uuidv7()` column default를 사용해야 하며(MUST), 정상 transaction Activity 완료 시 데이터베이스가 반환한 row ID를 Update 결과와 create effect source로 사용해야 한다(MUST). Update 결과는 committed domain 결과이고 effect 완료는 별도 Workflow concern이다. 각 transaction Activity 시도는 현재 participant와 remote Instance 상태를 평가하고 해당 시도에서 실제 commit한 transition의 effect plan을 반환해야 한다(MUST). 반환된 plan은 Workflow가 그대로 실행하며, effect Activity는 mutable state를 다시 평가해 delivery를 추가하거나 취소해서는 안 된다(MUST NOT).

Transaction Activity가 commit된 뒤 completion 응답이 유실되어 retry가 이미 존재하는 Follow 또는 Follow Request를 관찰하면, 시스템은 row를 중복 생성해서는 안 되고(MUST NOT) candidate identity 없이 해당 row를 이번 시도의 commit이라고 추론해 create effect를 재구성해서도 안 된다(MUST NOT). 이 경계에서는 committed 관계 상태를 유지하되 해당 transition의 Notification 또는 ActivityPub create effect가 누락될 수 있다. 시스템은 이를 보정하기 위한 candidate UUID Activity, operation receipt, outbox, sweeper 또는 reconciliation을 이 capability에 추가해서는 안 된다(MUST NOT).

#### Scenario: Duplicate or rolled-back transition

- **WHEN** Follow 또는 Pending transition이 duplicate, no-op, known domain failure 또는 rollback이다
- **THEN** Update는 기존 domain outcome 또는 failure를 반환하고 실제 commit하지 않은 transition의 새 source effect를 Workflow에 추가하지 않는다

#### Scenario: Normal create uses the database-generated identity

- **WHEN** Follow, Follow Request 또는 Request 승인 transition이 새 row를 commit하고 transaction Activity 완료가 기록된다
- **THEN** PostgreSQL `uuidv7()` default가 row ID를 생성하고 Update 결과와 모든 create effect는 데이터베이스가 반환한 같은 source ID를 사용한다

#### Scenario: Transaction completion loss does not reconstruct create effects

- **WHEN** transaction Activity가 Follow 또는 Follow Request를 commit한 뒤 completion 응답이 유실되고 retry가 해당 pair의 기존 row를 관찰한다
- **THEN** retry는 row를 중복 생성하지 않고 기존 관계 상태로 수렴한다
- **AND** candidate identity 없이 기존 row를 이번 transition의 commit으로 단정하거나 Notification 또는 ActivityPub create effect를 재구성하지 않는다

#### Scenario: Approval completion loss closes the pair lifecycle

- **WHEN** approve 또는 verified remote Accept transaction이 exact Pending Request를 제거하고 Follow를 commit한 뒤 completion 응답이 유실된다
- **THEN** retry는 Workflow history의 expected Request ID와 pending source identity 및 현재 Follow 존재를 사용해 pair lifecycle을 `ESTABLISHED`로 종료한다
- **AND** 삭제되기 전 Request와 새 Follow의 create/delete effects를 다시 만들지 않는다

#### Scenario: Effect retry preserves the returned delivery plan

- **WHEN** 이미 반환된 effect plan이 Worker failure 또는 mutable participant state 변경 뒤 재시도된다
- **THEN** effect는 stable create source ID 또는 exact deleted source ID와 directed pair를 재사용하고 delivery eligibility를 다시 평가하거나 이후 lifecycle의 Notification 또는 protocol activity를 만들지 않는다

#### Scenario: Unresponsive remote target at transition time

- **WHEN** local Follow, Follow Request, Unfollow 또는 request Cancel이 remote target Instance가 `UNRESPONSIVE`인 시도에서 commit된다
- **THEN** transaction Activity는 적용 가능한 local graph와 Notification effects를 유지하고 해당 시도의 effect plan에는 ActivityPub delivery를 포함하지 않는다
- **AND** commit 전에 실패한 retry가 다른 remote Instance state에서 transition을 실제 commit하면 그 시도의 현재 state를 사용하지만, 이전 시도의 commit completion이 유실된 retry는 create effect를 재구성하지 않는다

#### Scenario: Target state changes after delivery was planned

- **WHEN** local transition이 remote target `ACTIVE` 상태에서 ActivityPub delivery를 기록하고 effect Activity 실행 또는 retry 전에 Profile이나 Instance 상태가 바뀐다
- **THEN** Workflow는 transition eligibility를 다시 평가하지 않고 반환된 stable create source 또는 exact deleted source ID와 directed pair로 delivery를 계속 시도한다

#### Scenario: Delivery projection is incomplete

- **WHEN** 이미 계획된 ActivityPub delivery가 실행 시점에 actor 또는 inbox projection 결손을 발견한다
- **THEN** Activity는 관찰 가능한 실패로 끝나고 retry policy를 따르며, exact create source가 사라진 경우만 successful stale-source no-op으로 처리한다

#### Scenario: Promote an existing request after transaction completion loss

- **WHEN** 새 pair run이 existing pending request를 기록하고 `FOLLOW`가 OPEN policy에서 이를 승격한 뒤 transaction Activity가 commit completion loss로 재시도된다
- **THEN** Workflow는 history에 이미 기록한 pending request source ID를 사용해 request Notification cleanup을 계속 schedule한다
- **AND** candidate Follow identity가 없으므로 relation create effect는 재구성하지 않는다

#### Scenario: Rehydrate a committed result without row payloads

- **WHEN** 성공한 Update가 Follow 또는 Request를 commit하고 domain result를 반환한다
- **THEN** Update는 source와 pair identity만 운반하고 caller는 full DB row나 `Temporal.Instant`를 Workflow history에 저장하지 않은 채 필요한 surviving projection을 읽는다

#### Scenario: Reconstruct an old removal after refollow

- **WHEN** Follow F1 removal이 commit되고 Activity completion이 유실된 뒤 removal Activity retry 시점에 Follow F2가 존재한다
- **THEN** removal Workflow는 mutation 전에 read-only Activity로 검증해 Workflow history에 기록한 exact F1 source와 directed pair를 재사용한다
- **AND** retry는 F2를 보존하고 F1의 delete effects만 재구성한다

#### Scenario: Reject a mismatched removal source

- **WHEN** removal command의 expected Follow ID가 Workflow가 mutation 전에 검증한 directed pair에 속하지 않는다
- **THEN** command는 removal transaction이나 delete effect 없이 변경 없음으로 보고한다

#### Scenario: Bound caller admission latency

- **WHEN** Temporal server 또는 Worker가 Update-with-Start admission을 완료하지 않는다
- **THEN** pair와 removal caller는 legitimate Pending lifecycle에 Workflow run timeout을 적용하지 않은 채 bounded client RPC deadline에서 대기를 끝낸다

#### Scenario: Sibling effects remain independently attempted

- **WHEN** committed transition에 독립적인 Notification과 local protocol handoff effects가 있다
- **THEN** Workflow는 transition FIFO slot의 모든 적용 가능한 sibling을 시도하고 settlement 뒤 terminal failure를 보고하며 committed DB 결과를 유지한다
