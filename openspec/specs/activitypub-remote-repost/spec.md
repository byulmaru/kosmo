# activitypub-remote-repost Specification

## Purpose

verified remote ActivityPub Announce/Undo를 기존 Post 관계와 Repost core action에 원자적으로 materialize하고, 현재 Announce identity에 해당하는 Repost lifecycle만 변경하기 위한 요구사항을 정의한다.

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

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-495 시스템은 Announce object URI를 기존 remote ActivityPub Post mapping 또는 configured Local Instance의 canonical `/ap/note/{postId}` URI와 정확히 일치하는 Content Post로만 해석해야 한다(MUST). actor와 object의 origin이 다른 정상 Repost는 허용해야 하며(MUST), 다른 origin이 Kosmo local Note 경로를 주장하거나 대상이 missing, unavailable, unsupported 또는 Content 없는 Repost이면 side effect 없이 거절해야 한다(MUST). 이 처리에서 unknown object를 network fetch하거나 새 remote Post로 materialize하지 않아야 한다(MUST).

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
- **THEN** 시스템은 기존 Repost core 정책에 따라 side effect 없이 거절한다

### Requirement: Announce materialization through the existing Repost action

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-495, PROD-677, PROD-725 시스템은 검증된 remote Actor Profile, 해석한 Source Post와 current Announce identity를 specialized Core Repost action에 전달해야 한다(MUST). Core action은 Content와 Reply Parent 없이 direct Repost Source를 가진 기존 Post와 ActivityPub mapping을 같은 transaction에 저장하고, Visibility, source eligibility, Repost count와 조회 결과에 Local Repost와 같은 domain 규칙을 사용해야 한다(MUST). 실제 Repost 생성 commit 뒤에는 `origin=ACTIVITYPUB` Repost Workflow start를, verified current-generation Undo로 pure Repost가 최초 Tombstone commit된 뒤에는 `postKind=REPOST`, `origin=ACTIVITYPUB` 공통 Delete Workflow start를 시도해야 한다(MUST).

#### Scenario: 최초 Announce materialization

- **WHEN** usable remote Actor가 조회 가능하고 Repost 가능한 Content Post를 최초 Announce한다
- **THEN** Core action은 하나의 Active contentless direct Repost와 current ActivityPub mapping을 같은 transaction에 생성한다
- **AND** commit 뒤 `origin=ACTIVITYPUB` Notification-only Repost Workflow start를 시도한다
- **AND** 기존 count와 조회 projection은 이 Repost를 Local Repost와 같은 규칙으로 반영한다

#### Scenario: core policy rejection

- **WHEN** Actor가 Source를 조회할 수 없거나 Source Visibility가 기존 Repost 정책에서 허용되지 않는다
- **THEN** 시스템은 Repost core error를 protocol rejection으로 정규화하고 partial side effect를 남기지 않는다
- **AND** Repost Workflow를 시작하지 않는다

### Requirement: current Announce identity mapping

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-495, PROD-725 시스템은 specialized Core Repost action이 materialized remote Repost 자체에 기존 ActivityPub Post mapping을 같은 transaction으로 연결하고 mapping의 unique `uri`를 현재 Announce activity URI, unique `postId`를 Repost Post identity로 사용해야 한다(MUST). 선후관계가 확정된 순차 처리에서 같은 actor/source의 새 Announce generation은 새 Repost를 만들지 않고 같은 Active Repost mapping의 current URI와 delivery metadata를 교체해야 한다(MUST). 별도 Announce table, generation ledger 또는 mapping column을 추가하지 않아야 한다(MUST). 동일 Announce의 duplicate 수렴에는 기존 unique constraint와 멱등 Repost action을 사용하고, Announce identity 교체와 Undo 삭제 사이에 명시적 row/advisory lock 또는 serializable retry를 요구하지 않아야 한다(MUST NOT).

#### Scenario: personal/shared duplicate delivery

- **WHEN** 같은 Announce activity가 personal inbox와 shared inbox를 통해 순차 또는 동시에 전달된다
- **THEN** Core transaction은 같은 Repost와 같은 ActivityPub Post mapping 하나로 수렴한다
- **AND** duplicate 결과는 새 Repost Workflow를 시작하지 않는다

#### Scenario: 같은 actor/source의 새 Announce generation

- **WHEN** 같은 actor/source의 Active Repost가 있는 동안 다른 activity URI의 유효한 Announce가 선행 Undo와 겹치지 않고 도착한다
- **THEN** 시스템은 기존 Repost identity를 유지하고 mapping의 current URI와 delivery metadata를 새 generation으로 교체한다
- **AND** Repost 생성 event가 아니므로 새 Repost Workflow를 시작하지 않는다

#### Scenario: activity URI가 다른 Repost에 재사용됨

- **WHEN** 이미 다른 Post mapping이 소유한 activity URI가 actor 또는 object를 바꿔 다시 전달된다
- **THEN** 시스템은 기존 mapping을 이동하거나 새 Repost를 남기지 않고 delivery를 거절한다

#### Scenario: Announce와 Undo의 교차 경합

- **WHEN** 새 Announce의 current identity 교체와 이전 Announce의 Undo 삭제가 명확한 선후관계 없이 동시에 겹친다
- **THEN** 시스템은 새 Announce가 Active Repost를 남긴다고 보장하지 않으며 명시적 lock 또는 serializable retry로 두 delivery를 직렬화하지 않는다
- **AND** 이후 같은 actor/source의 유효한 Announce가 다시 전달되면 기존 멱등 생성 경로로 Active Repost에 수렴한다

### Requirement: exact current-generation Undo

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-495, PROD-677, PROD-725 시스템은 선후관계가 확정된 순차 처리에서 verified `Undo` actor와 Undo가 가리키는 Announce activity URI가 현재 remote Repost mapping과 모두 일치할 때만 specialized Core action으로 해당 Repost를 Tombstone 처리해야 한다(MUST). mapping 검증과 Tombstone transition은 같은 transaction에 있어야 하며(MUST), mapping은 soft-deleted Repost와 함께 유지해 repeated Undo와 같은 activity의 재전송을 멱등 처리해야 한다(MUST). 실제 pure Repost 삭제 commit 뒤에는 `postKind=REPOST`, `origin=ACTIVITYPUB` 공통 Delete Workflow start를 시도해야 하며(MUST), 다른 actor, superseded activity URI 또는 다른 Repost generation은 삭제하지 않아야 한다(MUST).

#### Scenario: 현재 Announce Undo

- **WHEN** verified Undo actor가 Active remote Repost Author와 같고 Undo object URI가 Repost의 current mapping URI와 일치한다
- **THEN** Core action은 mapping 검증과 그 Repost의 Tombstone transition을 같은 transaction에서 수행한다
- **AND** commit 뒤 `postKind=REPOST`, `origin=ACTIVITYPUB`인 공통 Delete Workflow start를 시도한다

#### Scenario: superseded Announce Undo

- **WHEN** Announce A의 Repost mapping이 Announce B URI로 교체 완료된 뒤 Undo A가 도착한다
- **THEN** 시스템은 현재 Repost를 삭제하거나 Delete Workflow를 시작하지 않는다

#### Scenario: 이전 generation의 늦은 Undo

- **WHEN** Undo B 뒤 새 Announce C가 새 Repost를 만든 후 Undo B가 반복 전달된다
- **THEN** 시스템은 Tombstone인 이전 Repost mapping에만 수렴하고 새 Repost를 삭제하지 않는다
- **AND** 새 Delete Workflow를 시작하지 않는다

#### Scenario: 다른 actor의 Undo

- **WHEN** Undo actor가 현재 mapping의 Repost Author와 일치하지 않는다
- **THEN** 시스템은 어떤 Repost도 삭제하거나 Delete Workflow를 시작하지 않는다

### Requirement: federation scope remains inbound-only

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-495 시스템은 이 capability에서 outbound Announce delivery, Quote 또는 nested Repost materialization, Repost 제품 계약, GraphQL schema와 UI를 추가하거나 변경하지 않아야 한다(MUST).

#### Scenario: excluded federation and product surfaces

- **WHEN** inbound Announce/Undo capability가 구현된다
- **THEN** outbound delivery, Quote·nested Repost, GraphQL과 UI 동작은 기존 상태를 유지한다
