## MODIFIED Requirements

### Requirement: First-transition post-commit delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-447, PROD-448, PROD-496. 시스템은 Repost domain transaction이 성공적으로 commit된 뒤 최초 생성과 최초 취소 상태 전이에만 Fedify queue handoff를 시작하고, 반복·동시 application action에서는 추가 activity handoff를 시작하지 않아야 한다(MUST).

#### Scenario: First Repost creation delivery

- **WHEN** Repost application action이 새 Active Repost를 생성하고 commit한다
- **THEN** 시스템은 commit 이후 해당 Repost의 Announce를 Fedify queue에 한 번 handoff한다
- **AND** commit 전에 Fedify delivery 또는 broker enqueue를 수행하지 않는다

#### Scenario: Duplicate or concurrent Repost creation

- **WHEN** 반복 또는 동시 Repost action이 기존 Active Repost identity로 수렴한다
- **THEN** 최초 생성 결과만 Announce queue handoff를 시작한다
- **AND** 기존 Repost를 반환한 action은 Announce를 추가 handoff하지 않는다

#### Scenario: First Repost cancellation delivery

- **WHEN** deletePost가 Repost를 처음 Active에서 Tombstone으로 전이하고 commit한다
- **THEN** 시스템은 commit 이후 해당 Repost의 Undo를 같은 Repost ordering key로 한 번 handoff한다
- **AND** GraphQL public payload는 기존 Post global ID 계약을 유지한다

#### Scenario: Duplicate or concurrent Repost cancellation

- **WHEN** 반복 또는 동시 deletePost action이 이미 Tombstone인 같은 Repost를 대상으로 한다
- **THEN** 최초 Tombstone 전이 결과만 Undo queue handoff를 시작한다
- **AND** 이미 Tombstone인 결과는 Undo를 추가 handoff하지 않는다

#### Scenario: Non-Repost Post deletion

- **WHEN** 일반 Post, Reply, Quote 또는 Reply이면서 Quote인 Content Post가 deletePost로 Tombstone 전이된다
- **THEN** 시스템은 Repost Undo handoff를 시작하지 않는다
- **AND** 기존 Post 삭제 결과를 유지한다

### Requirement: Post-commit delivery failure isolation

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-447, PROD-448, PROD-496. 시스템은 Fedify Announce/Undo queue handoff 실패를 committed Repost application 결과와 분리해 관측하며, handoff 이후 remote delivery 실패는 Fedify retry 경계에 맡기고 GraphQL mutation 실패나 domain state rollback으로 바꾸지 않아야 한다(MUST).

#### Scenario: Announce queue handoff failure after commit

- **WHEN** 새 Repost transaction이 commit된 뒤 Announce projection 또는 Fedify queue handoff가 실패한다
- **THEN** 시스템은 실패를 Repost ID와 함께 post-commit handoff 관측 경계에 기록한다
- **AND** committed Active Repost와 `repostPost` 성공 payload를 유지한다
- **AND** handoff 실패를 이유로 Repost 또는 Notification 결과를 rollback하지 않는다

#### Scenario: Undo queue handoff failure after commit

- **WHEN** Repost Tombstone transaction이 commit된 뒤 Undo projection 또는 Fedify queue handoff가 실패한다
- **THEN** 시스템은 실패를 Repost ID와 함께 post-commit handoff 관측 경계에 기록한다
- **AND** committed Tombstone, count 감소, active uniqueness 해제와 `deletePost` 성공 payload를 유지한다
- **AND** handoff 실패를 이유로 Repost를 Active로 복원하지 않는다

#### Scenario: Independent post-commit side effects

- **WHEN** Repost Notification 생성·정리와 ActivityPub queue handoff 중 하나가 실패한다
- **THEN** 시스템은 각 실패를 독립적으로 격리한다
- **AND** 한 side effect 실패가 다른 side effect 실행 또는 committed application payload를 실패시키지 않는다

#### Scenario: Durable handoff boundary

- **WHEN** application process가 domain commit 이후 Fedify queue handoff 전에 종료된다
- **THEN** domain commit과 transport handoff 사이의 유실 가능성은 남으며 transactional outbox를 새로 만들지 않는다
- **AND** Fedify queue가 handoff를 수락한 activity는 producer 재시작과 remote retry를 견뎌야 한다

### Requirement: Repost delivery availability and scope boundary

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-448, PROD-496. 시스템은 canonical Repost와 Source activity를 안전하게 재구성할 수 있는 경우에만 outbound Repost queue handoff를 시도하며, sibling interaction 또는 Kosmo-owned durable transport 범위를 추가하지 않아야 한다(MUST).

#### Scenario: Unsupported Repost structure

- **WHEN** 대상 Post에 Content가 있거나 Reply Parent가 있거나 direct Repost Source가 없다
- **THEN** 시스템은 그 Post를 outbound Repost Announce/Undo 대상으로 취급하지 않는다
- **AND** Quote, Reply이면서 Quote 또는 일반 Post를 Repost activity로 직렬화하지 않는다

#### Scenario: Unavailable Announce projection

- **WHEN** Repost 또는 Author가 unavailable하거나 configured Local Instance에 속하지 않거나 direct Source가 missing·contentless이거나 canonical ActivityPub URI를 해석할 수 없다
- **THEN** 시스템은 Announce handoff를 시도하지 않는다
- **AND** unavailable 원인을 GraphQL 결과로 새로 노출하지 않는다

#### Scenario: Unavailable Undo projection

- **WHEN** canceled Repost identity, Local Author identity, 보존된 Source 관계 또는 Source canonical ActivityPub URI를 해석할 수 없다
- **THEN** 시스템은 Undo handoff를 시도하지 않는다
- **AND** committed Tombstone 결과를 유지한다

#### Scenario: Excluded transport and sibling capabilities

- **WHEN** Local Repost Announce/Undo capability를 제공한다
- **THEN** 시스템은 inbound Announce materialization, Reply·Reaction federation, Quote·중첩 Repost federation을 추가하지 않는다
- **AND** followers/outbox collection, transactional outbox, NATS/custom worker, Kosmo-owned durable retry/history와 사용자용 delivery status를 추가하지 않는다
- **AND** durable transport는 `fedify-postgres-message-queue-runtime` capability에만 위임한다
