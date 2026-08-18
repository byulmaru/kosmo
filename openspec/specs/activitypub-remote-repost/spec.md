# activitypub-remote-repost Specification

## Purpose

검증된 remote ActivityPub Announce/Undo를 기존 Post 관계와 공용 Repost·Post 삭제 action에 연결한다.
이 capability는 PROD-495가 확정한 Announce identity·generation·동시 처리 semantics를 유지하고, 후속 효과의
Temporal 전환 외에 새로운 ActivityPub materialization 경계를 만들지 않는다.

## Requirements

### Requirement: verified Announce delivery validation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-495 시스템은 Fedify가 검증한 remote `Announce` 중 유일한 HTTP(S) actor, activity와 object identity를 가지며 저장된 usable remote Actor가 보낸 delivery만 처리해야 한다(MUST). personal inbox는 경로의 Local Recipient가 유효해야 하고 shared inbox의 recipient 부재는 허용해야 한다(MUST). `to` 또는 `cc`에 개별 Local Recipient가 없다는 이유만으로 shared-inbox delivery를 거절하지 않아야 한다(MUST).

#### Scenario: personal inbox의 유효한 Announce

- **WHEN** 저장된 usable remote Actor가 유효한 Local Recipient의 personal inbox로 verified Announce를 보낸다
- **THEN** 시스템은 actor, activity와 object identity 검증을 통과시켜 대상 Post 해석으로 진행한다

#### Scenario: shared inbox의 유효한 Announce

- **WHEN** 같은 verified Announce가 recipient가 없는 shared inbox로 전달되고 `to`와 `cc`에 개별 Local Profile이 없다
- **THEN** 시스템은 recipient 부재만으로 거절하지 않고 같은 actor, activity와 object 검증을 적용한다

#### Scenario: 잘못된 identity 또는 actor

- **WHEN** actor, activity 또는 object identity가 누락·다중·비 HTTP(S)이거나 actor가 unknown, unusable 또는 verified sender와 일치하지 않는다
- **THEN** 시스템은 Post, Repost와 ActivityPub Post mapping side effect 없이 delivery를 거절한다

### Requirement: existing ActivityPub Post identity resolution

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-495 시스템은 Announce object URI를 기존 remote ActivityPub Post mapping 또는 configured Local Instance의 canonical `/ap/note/{postId}` URI와 정확히 일치하는 Content Post로만 해석해야 한다(MUST). actor와 object의 origin이 다른 정상 Repost는 허용해야 하며(MUST), 다른 origin이 Kosmo local Note 경로를 주장하거나 대상이 missing, unavailable, unsupported 또는 Content 없는 Repost이면 side effect 없이 거절해야 한다(MUST). 이 처리에서 unknown object를 network fetch하거나 새 remote Post를 materialize하지 않아야 한다(MUST).

#### Scenario: 저장된 remote Post Announce

- **WHEN** object URI가 기존 remote ActivityPub Post mapping URI와 정확히 일치하고 remote Actor가 대상 Post를 Repost할 수 있다
- **THEN** 시스템은 mapping의 Post를 direct Repost Source로 사용한다

#### Scenario: canonical local Note Announce

- **WHEN** object URI가 configured Local Instance의 canonical local Note URI와 정확히 일치하고 remote Actor가 대상 Post를 Repost할 수 있다
- **THEN** 시스템은 URI의 immutable Post DB UUID를 direct Repost Source로 사용한다

#### Scenario: cross-origin local Note 주장

- **WHEN** 외부 origin의 URI가 Kosmo `/ap/note/{postId}` 경로 형태를 사용하지만 기존 remote mapping과 일치하지 않는다
- **THEN** 시스템은 local Post로 해석하거나 object를 fetch하지 않고 side effect 없이 거절한다

#### Scenario: unavailable 또는 unsupported Source

- **WHEN** 대상 Post가 없거나 Tombstone, 조회 불가, Content 없는 Repost 또는 Repost가 허용되지 않는 Visibility다
- **THEN** 시스템은 기존 공용 Repost 정책에 따라 side effect 없이 거절한다

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

### Requirement: current Announce identity와 generation semantics 보존

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-495, PROD-725 시스템은 기존 `ActivityPubPosts` mapping을 Repost Post identity와 Announce activity URI의 대응으로 사용해야 하며(MUST), 별도 Announce table·generation ledger·mapping column을 추가하지 않아야 한다(MUST NOT). 선후관계가 확정된 순차 처리에서 같은 actor/source의 새 Announce generation은 새 Repost를 만들지 않고 기존 Active Repost의 current URI와 delivery metadata를 갱신해야 한다(MUST). 동일 Announce duplicate와 새 generation은 새 Repost 생성이 아니므로 새 Repost Workflow를 시작하지 않아야 한다(MUST). 이 동작을 위해 새 row/advisory lock 또는 serializable retry를 요구해서는 안 된다(MUST NOT).

#### Scenario: 같은 actor/source의 새 Announce generation

- **WHEN** 같은 actor/source의 Active Repost가 있는 동안 다른 activity URI의 유효한 Announce가 도착한다
- **THEN** 시스템은 기존 Repost identity를 유지하고 기존 mapping의 current URI와 delivery metadata를 새 generation으로 교체한다
- **AND** Repost 생성 event가 아니므로 새 Repost Workflow를 시작하지 않는다

#### Scenario: activity URI가 다른 Repost에 재사용됨

- **WHEN** 이미 다른 Post mapping이 소유한 activity URI가 actor 또는 object를 바꿔 다시 전달된다
- **THEN** 시스템은 기존 mapping을 이동하거나 새 Repost를 남기지 않고 delivery를 거절한다

#### Scenario: Announce와 Undo의 교차 경합

- **WHEN** 새 Announce의 current identity 교체와 이전 Announce의 Undo 삭제가 명확한 선후관계 없이 동시에 겹친다
- **THEN** 시스템은 명시적 lock 또는 serializable retry로 두 delivery를 새로 직렬화하지 않는다
- **AND** 이후 같은 actor/source의 유효한 Announce가 다시 전달되면 기존 멱등 Repost 경로로 수렴한다

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
