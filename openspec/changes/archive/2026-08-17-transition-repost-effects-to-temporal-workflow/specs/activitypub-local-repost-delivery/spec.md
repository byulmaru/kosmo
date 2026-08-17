## MODIFIED Requirements

### Requirement: First-transition post-commit delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-447, PROD-448, PROD-496, PROD-677, PROD-725. 시스템은 Post domain transaction이 성공적으로 commit된 뒤 최초 Repost 생성에는 Repost Workflow를, Content-bearing Post·Reply·Quote의 최초 Tombstone에는 Post Delete Workflow를, pure Repost의 최초 Tombstone에는 Repost Delete Workflow를 시작하고, accepted Local-origin Workflow의 Activity에서 관계에 맞는 Fedify queue handoff를 재시도해야 한다(MUST). 각 Workflow input은 `{ postId, origin }`이며 discriminator를 포함하지 않는다. 반복·동시 application action은 추가 Workflow나 activity handoff를 시작하지 않아야 한다(MUST).

#### Scenario: First Repost creation delivery

- **WHEN** Repost application action이 새 Active Repost를 생성하고 commit한다
- **THEN** 시스템은 Repost Workflow start를 시도하고 accepted Workflow는 해당 Repost의 Announce를 Fedify queue에 handoff한다
- **AND** commit 전에 Workflow start, Fedify delivery 또는 broker enqueue를 수행하지 않는다

#### Scenario: Duplicate or concurrent Repost creation

- **WHEN** 반복 또는 동시 Repost action이 기존 Active Repost identity로 수렴한다
- **THEN** 최초 생성 결과만 Repost Workflow start를 시도한다
- **AND** 기존 Repost를 반환한 action은 Workflow나 Announce handoff를 추가하지 않는다

#### Scenario: First Repost cancellation delivery

- **WHEN** delete action이 Repost를 처음 Active에서 Tombstone으로 전이하고 commit한다
- **THEN** 시스템은 Repost Delete Workflow start를 시도하고 accepted Workflow는 해당 Repost의 Undo를 같은 Repost ordering key로 handoff한다
- **AND** Undo Activity는 Tombstone row에 보존된 Repost identity를 사용하며 author Profile의 non-`ACTIVE` state만으로 handoff를 no-op하지 않는다
- **AND** GraphQL public payload는 기존 Post global ID 계약을 유지한다

#### Scenario: First Content Post deletion delivery

- **WHEN** 일반 Post, Reply, Quote 또는 Reply이면서 Quote인 Content Post가 처음 Active에서 Tombstone으로 전이되고 commit된다
- **THEN** 시스템은 Post Delete Workflow start를 시도하고 accepted Local-origin Workflow는 canonical Delete(Note)를 Fedify queue에 handoff한다
- **AND** Delete Activity는 Tombstone Post projection으로 기존 Delete identity·audience·recipient 규칙을 사용한다
- **AND** GraphQL public payload는 기존 Post global ID 계약을 유지한다

#### Scenario: Duplicate or concurrent Post deletion

- **WHEN** 반복 또는 동시 delete action이 이미 Tombstone인 같은 Content Post 또는 Repost를 대상으로 한다
- **THEN** 최초 Tombstone 전이 결과만 관계에 맞는 Post Delete 또는 Repost Delete Workflow start를 시도한다
- **AND** 이미 Tombstone인 결과는 Workflow나 Delete/Undo handoff를 추가하지 않는다

#### Scenario: ActivityPub-origin Post deletion

- **WHEN** verified ActivityPub Delete가 일반 Content Post·Reply·Quote 또는 pure Repost를 처음 Tombstone으로 전이하고 commit한다
- **THEN** 시스템은 relation shape에 맞는 `origin=ACTIVITYPUB` Post Delete 또는 Repost Delete Workflow start를 시도한다
- **AND** Post Delete Workflow는 outbound Delete(Note)를 만들지 않고, Repost Delete Workflow는 Notification cleanup만 수행하며 outbound Undo를 만들지 않는다
- **AND** 기존 ActivityPub acknowledgement와 Post 삭제 결과를 유지한다

### Requirement: Post-commit delivery failure isolation

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-447, PROD-448, PROD-496, PROD-677, PROD-725. 시스템은 Repost create, Post Delete 또는 Repost Delete Workflow start와 Fedify Announce/Delete(Note)/Undo queue handoff 실패를 committed Post application 결과와 분리해 관측해야 하며(MUST), accepted Workflow는 handoff를 유한하게 재시도해야 한다(MUST). handoff 이후 remote delivery 실패는 Fedify retry 경계가 소유하고 GraphQL mutation 실패나 domain state rollback으로 바꾸지 않아야 한다(MUST).

#### Scenario: Announce or Delete queue handoff failure after commit

- **WHEN** 새 Repost transaction 또는 Content Post deletion transaction이 commit되고 accepted Workflow의 Announce/Delete(Note) projection 또는 Fedify queue handoff가 실패한다
- **THEN** Workflow Activity는 같은 Post와 canonical activity identity로 유한하게 재시도한다
- **AND** committed Active Repost 또는 Tombstone Post와 원래 성공 payload를 유지한다
- **AND** handoff 실패를 이유로 Post 또는 Notification 결과를 rollback하지 않는다

#### Scenario: Repost Undo queue handoff failure after commit

- **WHEN** Repost Tombstone transaction이 commit되고 accepted Workflow의 Undo projection 또는 Fedify queue handoff가 실패한다
- **THEN** Workflow Activity는 같은 Repost와 canonical Undo identity로 유한하게 재시도한다
- **AND** committed Tombstone, count 감소, active uniqueness 해제와 `deletePost` 성공 payload를 유지한다
- **AND** handoff 실패를 이유로 Repost를 Active로 복원하지 않는다

#### Scenario: Independent post-commit side effects

- **WHEN** Repost Notification 생성·정리와 ActivityPub queue handoff 중 하나가 terminal failure가 된다
- **THEN** Workflow는 각 실패를 독립적으로 격리하고 다른 적용 가능한 Activity를 계속 실행한다
- **AND** 한 side effect 실패가 다른 side effect 실행 또는 committed application payload를 실패시키지 않는다

#### Scenario: Durable handoff boundary

- **WHEN** application process가 domain commit 이후 Workflow start 전에 종료된다
- **THEN** domain commit과 Workflow start 사이의 유실 가능성은 남으며 transactional outbox를 새로 만들지 않는다
- **AND** accepted Workflow는 Worker 재시작을, Fedify queue가 수락한 activity는 producer 재시작과 remote retry를 견뎌야 한다
