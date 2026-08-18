## MODIFIED Requirements

### Requirement: Announce는 공용 Repost action으로 저장한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-495`, `PROD-725` — verified ActivityPub Announce는 Local GraphQL Repost와 같은 public `repostPost` action을 사용해야 한다(MUST). action은 `origin=ACTIVITYPUB`과 검증된 actor profile, Source Post, Announce URI와 timestamps를 받아 자체 transaction에서 Repost와 기존 `ActivityPubPosts` mapping을 일반 `createPost`와 같은 저장 경계로 처리해야 한다(MUST). 별도 ActivityPub materialization action, caller-owned Repost transaction, transaction handle 또는 Workflow Activity의 mapping 저장을 추가해서는 안 된다(MUST NOT).

#### Scenario: First remote Announce

- **WHEN** usable remote Actor가 Repost 가능한 Content Post를 처음 Announce한다
- **THEN** 공용 Repost action은 Active contentless direct Repost와 Announce URI mapping을 저장한다
- **AND** 새 Repost commit 뒤 `origin=ACTIVITYPUB` Repost Workflow start를 시도한다

#### Scenario: duplicate 또는 generation replacement

- **WHEN** 같은 Announce가 반복되거나 같은 actor/source의 유효한 새 Announce generation이 도착한다
- **THEN** 기존 PROD-495 identity·mapping generation semantics에 따라 같은 Repost로 수렴하거나 current URI/delivery metadata를 갱신한다
- **AND** 새 Repost가 생성되지 않은 결과는 Repost Workflow를 시작하지 않는다

#### Scenario: Repost policy rejection

- **WHEN** actor 또는 Source가 existing ActivityPub Repost 정책을 통과하지 못한다
- **THEN** 공용 Repost action은 Post/Repost mapping을 남기지 않고 protocol rejection으로 정규화된다
- **AND** Repost Workflow를 시작하지 않는다

### Requirement: current-generation Undo는 공용 Post 삭제 action을 사용한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-495`, `PROD-677`, `PROD-725` — verified ActivityPub Undo는 Fedify가 actor와 Announce URI mapping을 read-only로 확인한 뒤 현재 Active pure Repost의 `postId`를 공용 `deletePost`에 전달해야 한다(MUST). mapping resolution과 Tombstone transition을 같은 caller-owned transaction으로 묶거나 별도 Undo Core action을 추가해서는 안 된다(MUST NOT). 기존 mapping은 Tombstone과 함께 유지하고, 최초 Tombstone commit 뒤 `origin=ACTIVITYPUB` Repost Delete Workflow start를 시도해야 한다(MUST).

#### Scenario: current Announce Undo

- **WHEN** verified Undo actor와 current Announce mapping이 Repost Author와 일치한다
- **THEN** Fedify는 resolved `postId`와 actor identity를 공용 `deletePost`에 전달한다
- **AND** 최초 Tombstone commit 뒤 Repost Delete Workflow가 시작된다

#### Scenario: superseded 또는 stale Undo

- **WHEN** Undo URI가 current mapping과 일치하지 않거나 대상 Repost가 이미 Tombstone이다
- **THEN** system은 현재 Active Repost를 삭제하지 않고 새 Repost Delete Workflow도 시작하지 않는다

#### Scenario: concurrent Announce와 Undo

- **WHEN** Announce mapping generation replacement와 이전 generation Undo가 명확한 선후관계 없이 겹친다
- **THEN** 기존 PROD-495 no-lock semantics를 유지하고 새 lock 또는 serializable retry를 추가하지 않는다
- **AND** 후속 valid Announce는 기존 공용 Repost action으로 수렴한다

### Requirement: federation scope remains inbound-only

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-495`, `PROD-725` — ActivityPub-origin Repost/Delete Workflow는 outbound Announce·Undo echo를 생성하지 않아야 한다(MUST NOT). remote actor/object validation, unknown object fetch 금지, GraphQL/API 제품 계약은 기존 상태를 유지해야 한다(MUST).

#### Scenario: ActivityPub-origin effects

- **WHEN** verified Announce 또는 Undo가 Repost transition을 commit하고 Workflow가 accepted된다
- **THEN** Repost create는 Notification-only effects를, Repost Delete는 Notification cleanup만 수행한다
- **AND** Local-origin Announce·Undo queue handoff는 수행하지 않는다
