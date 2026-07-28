# activitypub-local-repost-delivery Specification

## Purpose

TBD - created by archiving change add-activitypub-local-repost-delivery. Update Purpose after archive.

## Requirements

### Requirement: Stable Local Repost Announce identity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496. 시스템은 configured Local Instance에 속한 행동 Profile의 Local Repost를 immutable Repost Post DB UUID에서 파생한 안정적인 ActivityPub `Announce`로 표현하고, Local/Remote Source의 object identity에 PROD-494가 확정한 공통 ActivityPub Post URI 규칙을 재사용해야 한다(MUST).

#### Scenario: Local Source Repost Announce

- **WHEN** Local Profile이 Content가 있는 제공 가능한 Local Post를 처음 Repost하고 transaction이 commit된다
- **THEN** 시스템은 `{canonicalOrigin}/ap/announce/{repostId}`를 `Announce.id`로 사용한다
- **AND** `Announce.actor`는 Repost Author Profile의 canonical actor URI다
- **AND** `Announce.object`는 `{canonicalOrigin}/ap/note/{sourcePostId}`다
- **AND** `Announce.published`는 immutable Repost 생성 시각이다

#### Scenario: Remote Source Repost Announce

- **WHEN** Local Profile이 Content가 있고 existing ActivityPub Post mapping을 가진 제공 가능한 Remote Post를 처음 Repost하고 transaction이 commit된다
- **THEN** 시스템은 Local Source와 같은 Repost 기반 `Announce.id`, actor와 published 규칙을 사용한다
- **AND** `Announce.object`는 existing ActivityPub Post mapping의 remote object URI다
- **AND** Remote Source에 Local Note identity나 새 ActivityPub Post mapping을 만들지 않는다

#### Scenario: Stable Announce reconstruction

- **WHEN** 같은 committed Repost identity의 Announce projection 또는 delivery가 반복된다
- **THEN** 시스템은 항상 같은 Announce ID, actor, object와 published 값을 사용한다
- **AND** request host, GraphQL global ID, Author handle과 delivery 시각을 identity에 포함하지 않는다

### Requirement: Exact Local Repost Undo identity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-496. 시스템은 취소된 Local Repost의 immutable identity와 보존된 direct Source 관계를 사용해 정확한 원본 Announce를 가리키는 안정적인 `Undo`를 표현해야 한다(MUST).

#### Scenario: Repost cancellation Undo

- **WHEN** Local Repost가 처음 Active에서 Tombstone으로 전이되고 transaction이 commit된다
- **THEN** 시스템은 `{canonicalOrigin}/ap/announce/{repostId}#undo`를 `Undo.id`로 사용한다
- **AND** `Undo.actor`는 원본 Announce actor와 같다
- **AND** `Undo.object`는 같은 ID, actor, object와 published 값을 가진 원본 Announce를 가리킨다
- **AND** Repost와 Source 관계를 hard delete하거나 transport mapping을 새로 저장하지 않는다

#### Scenario: Source lifecycle after Announce

- **WHEN** Repost 취소 전에 Source가 Tombstone으로 전이됐지만 direct Source 관계와 canonical ActivityPub identity가 남아 있다
- **THEN** 시스템은 보존된 identity로 원본 Announce와 Undo를 재구성한다
- **AND** Source의 현재 Content 표현을 요구하거나 embed하지 않는다

#### Scenario: Stable Undo reconstruction

- **WHEN** 같은 canceled Repost identity의 Undo projection 또는 delivery가 반복된다
- **THEN** 시스템은 항상 같은 Undo ID와 원본 Announce identity를 사용한다
- **AND** Announce와 Undo는 같은 Repost ordering domain을 사용한다

### Requirement: Repost audience and remote follower recipients

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496. 시스템은 Repost Visibility를 ActivityPub audience로 투영하고 행동 Local Profile의 established remote follower 중 지원되는 recipient에게 Announce와 Undo를 전달해야 한다(MUST).

#### Scenario: Unlisted Repost audience

- **WHEN** Public 또는 Unlisted Source에서 파생된 Unlisted Repost의 Announce 또는 Undo를 직렬화한다
- **THEN** activity `to`는 행동 Profile의 followers collection URI를 포함한다
- **AND** activity `cc`는 ActivityStreams Public을 포함한다

#### Scenario: Followers Only Repost audience

- **WHEN** Author가 자신의 Followers Only Source에서 만든 Followers Only Repost의 Announce 또는 Undo를 직렬화한다
- **THEN** activity `to`는 행동 Profile의 followers collection URI만 포함한다
- **AND** activity `cc`는 ActivityStreams Public을 포함하지 않는다

#### Scenario: Established remote follower recipients

- **WHEN** 행동 Local Profile에 established follower인 Active Remote Profile이 있고 그 ActivityPub Instance가 ACTIVE 또는 UNRESPONSIVE이며 actor inbox가 저장되어 있다
- **THEN** 시스템은 해당 remote actor를 delivery recipient로 포함한다
- **AND** shared inbox가 저장되어 있으면 Fedify shared inbox delivery를 우선 사용한다

#### Scenario: Unsupported recipients

- **WHEN** follower가 Local Profile이거나 Profile이 inactive이거나 ActivityPub Instance가 Suspended이거나 actor inbox가 없다
- **THEN** 시스템은 해당 follower를 delivery recipient에서 제외한다
- **AND** 제외 사실 때문에 committed Repost action을 실패시키지 않는다

#### Scenario: Source Author is not an implicit recipient

- **WHEN** Remote Source Author가 행동 Profile의 established follower가 아니다
- **THEN** 시스템은 Source Author라는 이유만으로 recipient에 추가하지 않는다
- **AND** follower recipient와 activity audience 규칙을 확장하지 않는다

### Requirement: First-transition post-commit delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-447, PROD-496. 시스템은 Repost domain transaction이 성공적으로 commit된 뒤 최초 생성과 최초 취소 상태 전이에만 직접 Fedify delivery를 시작하고, 반복·동시 application action에서는 추가 activity delivery를 시작하지 않아야 한다(MUST).

#### Scenario: First Repost creation delivery

- **WHEN** Repost application action이 새 Active Repost를 생성하고 commit한다
- **THEN** 시스템은 commit 이후 해당 Repost의 Announce delivery를 한 번 시작한다
- **AND** commit 전에 Fedify delivery 또는 broker enqueue를 수행하지 않는다

#### Scenario: Duplicate or concurrent Repost creation

- **WHEN** 반복 또는 동시 Repost action이 기존 Active Repost identity로 수렴한다
- **THEN** 최초 생성 결과만 Announce delivery를 시작한다
- **AND** 기존 Repost를 반환한 action은 Announce delivery를 추가로 시작하지 않는다

#### Scenario: First Repost cancellation delivery

- **WHEN** deletePost가 Repost를 처음 Active에서 Tombstone으로 전이하고 commit한다
- **THEN** 시스템은 commit 이후 해당 Repost의 Undo delivery를 한 번 시작한다
- **AND** GraphQL public payload는 기존 Post global ID 계약을 유지한다

#### Scenario: Duplicate or concurrent Repost cancellation

- **WHEN** 반복 또는 동시 deletePost action이 이미 Tombstone인 같은 Repost를 대상으로 한다
- **THEN** 최초 Tombstone 전이 결과만 Undo delivery를 시작한다
- **AND** 이미 Tombstone인 결과는 Undo delivery를 추가로 시작하지 않는다

#### Scenario: Non-Repost Post deletion

- **WHEN** 일반 Post, Reply, Quote 또는 Reply이면서 Quote인 Content Post가 deletePost로 Tombstone 전이된다
- **THEN** 시스템은 Repost Undo delivery를 시작하지 않는다
- **AND** 기존 Post 삭제 결과를 유지한다

### Requirement: Post-commit delivery failure isolation

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-447, PROD-448, PROD-496. 시스템은 direct Fedify Announce/Undo delivery 실패를 committed Repost application 결과와 분리해 관측하며, 외부 delivery 실패를 GraphQL mutation 실패나 domain state rollback으로 바꾸지 않아야 한다(MUST).

#### Scenario: Announce delivery failure after commit

- **WHEN** 새 Repost transaction이 commit된 뒤 Announce projection 또는 remote HTTP delivery가 실패한다
- **THEN** 시스템은 실패를 Repost ID와 함께 post-commit delivery 관측 경계에 기록한다
- **AND** committed Active Repost와 `repostPost` 성공 payload를 유지한다
- **AND** delivery 실패를 이유로 Repost 또는 Notification 결과를 rollback하지 않는다

#### Scenario: Undo delivery failure after commit

- **WHEN** Repost Tombstone transaction이 commit된 뒤 Undo projection 또는 remote HTTP delivery가 실패한다
- **THEN** 시스템은 실패를 Repost ID와 함께 post-commit delivery 관측 경계에 기록한다
- **AND** committed Tombstone, count 감소, active uniqueness 해제와 `deletePost` 성공 payload를 유지한다
- **AND** delivery 실패를 이유로 Repost를 Active로 복원하지 않는다

#### Scenario: Independent post-commit side effects

- **WHEN** Repost Notification 생성·정리와 ActivityPub delivery 중 하나가 실패한다
- **THEN** 시스템은 각 실패를 독립적으로 격리한다
- **AND** 한 side effect 실패가 다른 side effect 실행 또는 committed application payload를 실패시키지 않는다

#### Scenario: Accepted direct-delivery loss window

- **WHEN** application process가 domain commit 이후 Fedify delivery 시작 전에 종료된다
- **THEN** 이번 capability는 durable intent, retry 또는 delivery history를 생성하지 않는다
- **AND** PROD-448 migration 전까지 activity가 유실될 수 있는 현재 제한을 수용한다

### Requirement: Repost delivery availability and scope boundary

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-496. 시스템은 canonical Repost와 Source activity를 안전하게 재구성할 수 있는 경우에만 outbound Repost delivery를 시도하며, sibling interaction과 durable transport 범위를 추가하지 않아야 한다(MUST).

#### Scenario: Unsupported Repost structure

- **WHEN** 대상 Post에 Content가 있거나 Reply Parent가 있거나 direct Repost Source가 없다
- **THEN** 시스템은 그 Post를 outbound Repost Announce/Undo 대상으로 취급하지 않는다
- **AND** Quote, Reply이면서 Quote 또는 일반 Post를 Repost activity로 직렬화하지 않는다

#### Scenario: Unavailable Announce projection

- **WHEN** Repost 또는 Author가 unavailable하거나 configured Local Instance에 속하지 않거나 direct Source가 missing·contentless이거나 canonical ActivityPub URI를 해석할 수 없다
- **THEN** 시스템은 Announce delivery를 시도하지 않는다
- **AND** unavailable 원인을 GraphQL 결과로 새로 노출하지 않는다

#### Scenario: Unavailable Undo projection

- **WHEN** canceled Repost identity, Local Author identity, 보존된 Source 관계 또는 Source canonical ActivityPub URI를 해석할 수 없다
- **THEN** 시스템은 Undo delivery를 시도하지 않는다
- **AND** committed Tombstone 결과를 유지한다

#### Scenario: Excluded transport and sibling capabilities

- **WHEN** Local Repost Announce/Undo capability를 제공한다
- **THEN** 시스템은 inbound Announce materialization, Reply·Reaction federation, Quote·중첩 Repost federation을 추가하지 않는다
- **AND** followers/outbox collection, transactional outbox, NATS/Fedify MessageQueue, worker, durable retry/history와 사용자용 delivery status를 추가하지 않는다
