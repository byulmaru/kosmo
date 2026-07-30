## ADDED Requirements

### Requirement: Typed remote Post Delete inbox boundary

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-579, PROD-365 — 시스템은 personal inbox와 shared inbox의 verified typed `Delete`를 동일한 remote Post Delete 경계에서 처리해야 한다(MUST). ActivityPub signature 검증은 ingress가 소유하고 handler는 actor와 object identity를 각각 하나의 HTTP(S) URI로 확정해야 한다(MUST).

#### Scenario: 직접 object IRI Delete 수신

- **WHEN** Fedify listener가 서로 다른 actor URI와 object URI가 각각 정확히 하나인 verified typed `Delete`를 전달한다
- **AND** `Delete.object`가 직접 HTTP(S) IRI다
- **THEN** 시스템은 해당 actor URI와 object URI를 remote Post Delete 검증 입력으로 사용한다

#### Scenario: embedded Tombstone Delete 수신

- **WHEN** verified typed `Delete`에 object URI와 같은 `id`의 embedded Tombstone이 있다
- **THEN** 시스템은 그 Tombstone을 같은 remote Post Delete 대상으로 처리한다
- **AND** mapping이 이미 materialized Note identity를 증명하므로 remote object를 fetch하거나 refresh하지 않는다

#### Scenario: 지원하지 않는 Delete 입력 거부

- **WHEN** actor 또는 object의 서로 다른 HTTP(S) URI가 없거나 둘 이상이다
- **OR** embedded object가 없다는 direct IRI 경우도 아니고 같은 ID의 Tombstone도 아니다
- **THEN** 시스템은 Profile, ActivityPub Post mapping, Post와 PostContent side effect 없이 delivery를 skip한다

### Requirement: Known remote author와 exact object ownership 검증

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-579, PROD-365 — 시스템은 저장된 eligible ActivityPub actor가 자신이 작성한 기존 remote Post object를 삭제하는 경우만 허용해야 한다(MUST). actor, mapping, Post Author와 origin을 하나의 exact ownership chain으로 검증해야 한다(MUST).

#### Scenario: exact remote author와 mapping 허용

- **WHEN** activity actor URI가 저장된 ActivityPub Actor와 정확히 일치한다
- **AND** Actor의 Profile은 ACTIVE이고 Instance는 ACTIVITYPUB이면서 ACTIVE 또는 UNRESPONSIVE다
- **AND** object URI가 기존 ActivityPub Post mapping URI와 정확히 일치한다
- **AND** mapping의 Post Author Profile이 해당 Actor의 Profile과 같다
- **AND** mapping의 Post는 Current Content가 있는 Note 구조다
- **THEN** 시스템은 그 Post만 canonical 삭제 대상으로 선택한다
- **AND** actor lookup, object fetch, Profile materialization과 refresh를 수행하지 않는다

#### Scenario: 다른 actor와 object 조합 거부

- **WHEN** known actor가 다른 ActivityPub Actor가 작성한 mapped object URI를 보낸다
- **OR** actor URI, mapping의 Post Author와 저장된 Actor Profile 중 하나라도 일치하지 않는다
- **THEN** 시스템은 대상 Post와 mapping을 변경하지 않는다

#### Scenario: Local Post 변경 거부

- **WHEN** object mapping이 없거나 대상 Post Author의 Instance가 ACTIVITYPUB이 아니다
- **THEN** 시스템은 Local Post를 포함한 어떤 Post도 변경하지 않는다
- **AND** Local Post의 파생 Note URI나 DB UUID를 remote mapping 대신 추측하지 않는다

#### Scenario: Announce mapping 변경 거부

- **WHEN** object URI가 Content 없는 Repost의 ActivityPub Announce mapping과 일치한다
- **THEN** 시스템은 그 Repost와 Announce mapping을 변경하지 않는다
- **AND** Repost 취소는 기존 `Undo(Announce)` lifecycle에 남긴다

#### Scenario: unavailable actor 거부

- **WHEN** actor가 저장되어 있지 않거나 Profile이 ACTIVE가 아니다
- **OR** Instance가 ACTIVITYPUB이 아니거나 SUSPENDED다
- **THEN** 시스템은 network lookup과 domain write 없이 delivery를 skip한다

### Requirement: Canonical remote Post Tombstone 전이와 mapping 보존

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/architecture/core-services.md`, PROD-579, PROD-365 — 시스템은 검증된 remote Delete를 기존 canonical Post 삭제 행동으로 적용해 Active Post를 terminal Tombstone으로 전환해야 한다(MUST). ActivityPub Post mapping과 authored content history는 보존해야 한다(MUST).

#### Scenario: Active remote Post 삭제

- **WHEN** exact ownership 검증을 통과한 mapped remote Post의 Lifecycle State가 Active다
- **THEN** 시스템은 Post Lifecycle State를 Tombstone으로 전환하고 삭제 시각을 기록한다
- **AND** 전이와 author 재검증은 하나의 PostgreSQL transaction에서 commit되거나 rollback된다

#### Scenario: identity와 content history 보존

- **WHEN** mapped remote Post가 Tombstone으로 전이된다
- **THEN** 시스템은 ActivityPub Post mapping, Post, PostContent와 `Post.currentContentId`를 보존한다
- **AND** mapping은 terminal remote object identity와 duplicate Create first-write-wins 판정을 계속 소유한다
- **AND** content revision을 만들거나 visibility와 최초 materialization timestamp를 변경하지 않는다

#### Scenario: inbound Delete의 외부 side effect 격리

- **WHEN** inbound remote Delete가 Post를 Tombstone으로 전환한다
- **THEN** 시스템은 Local outbound `Delete`, Repost `Undo` 또는 Notification cleanup을 실행하지 않는다
- **AND** remote ingress의 commit 결과를 caller transaction 유무로 Local lifecycle로 오인하지 않는다

### Requirement: Remote Delete 멱등성과 순서 경계

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, PROD-579, PROD-365 — 시스템은 repeated, missing, out-of-order와 concurrent remote Delete에 명시적인 bounded idempotency 결과를 제공해야 한다(MUST). 미저장 object의 deletion memory나 명시적 비관적 lock을 추가하지 않아야 한다(MUST).

#### Scenario: repeated Delete no-op

- **WHEN** exact mapped Post가 이미 Tombstone이고 같은 actor/object의 Delete가 다시 처리된다
- **THEN** 시스템은 성공적인 no-op으로 종료한다
- **AND** 최초 삭제 시각, mapping, content와 visibility를 변경하지 않는다

#### Scenario: missing mapping no-op

- **WHEN** object URI와 일치하는 ActivityPub Post mapping이 없다
- **THEN** 시스템은 Post, mapping, receipt 또는 placeholder를 만들지 않고 no-op한다
- **AND** object fetch, backfill과 retry queue를 시작하지 않는다

#### Scenario: Delete 뒤 최초 Create

- **WHEN** Delete가 committed mapping을 관찰하지 못해 missing-mapping no-op으로 종료한 뒤 같은 object URI의 유효한 최초 Create가 처리된다
- **THEN** 시스템은 기존 first-write-wins Create 계약에 따라 remote Post를 materialize할 수 있다
- **AND** 이전 no-op Delete를 추정해 새 Post를 즉시 Tombstone으로 만들지 않는다

#### Scenario: Tombstone 뒤 duplicate Create

- **WHEN** mapping이 보존된 Tombstone Post의 object URI로 duplicate Create가 처리된다
- **THEN** 시스템은 기존 mapping과 Tombstone Post를 그대로 유지한다
- **AND** Post를 Active로 되살리거나 새 PostContent revision을 만들지 않는다

#### Scenario: concurrent Delete

- **WHEN** 같은 mapped Active Post에 대한 검증된 Delete가 동시에 처리된다
- **THEN** 하나의 조건부 Active에서 Tombstone 전이만 최초 삭제 시각을 기록한다
- **AND** 나머지 요청은 보존된 Tombstone을 변경하지 않는 no-op으로 종료한다
- **AND** `FOR UPDATE`, table/advisory lock 또는 PostgreSQL activity receipt를 추가하지 않는다

#### Scenario: concurrent first Create와 Delete

- **WHEN** 최초 Create와 같은 object URI의 Delete가 겹친다
- **THEN** Delete가 committed mapping을 관찰하면 canonical Tombstone 전이를 적용한다
- **AND** committed mapping을 관찰하지 못하면 missing-mapping no-op 계약을 적용한다

### Requirement: DB-only GraphQL과 Create ingestion 회귀 호환성

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, PROD-579, PROD-365 — 시스템은 remote Delete 결과를 기존 GraphQL DB-only Post authorization과 Post List Policy로 노출해야 한다(MUST). 최초와 duplicate remote Create의 기존 동작을 유지해야 한다(MUST).

#### Scenario: Tombstone remote Post 상세 숨김

- **WHEN** materialized remote Post가 inbound Delete로 Tombstone이 된다
- **THEN** 기존 Post와 current/historical PostContent Node 조회는 Post state authorization에 따라 없는 것으로 반환된다
- **AND** GraphQL 요청은 mapping lookup, remote fetch, refresh 또는 backfill을 수행하지 않는다

#### Scenario: Home과 Profile 목록 제외

- **WHEN** remote Post가 inbound Delete로 Tombstone이 된다
- **THEN** 해당 Post는 기존 `homeTimeline`과 `Profile.posts` connection에서 제외된다
- **AND** 주변 item의 기존 ordering과 cursor 계약은 바뀌지 않는다

#### Scenario: public remote Create 회귀 없음

- **WHEN** 지원되는 known actor의 새로운 PUBLIC 또는 UNLISTED top-level Note Create가 처리된다
- **THEN** 기존 atomic first materialization과 object URI unique mapping 계약을 유지한다
- **AND** 같은 object URI의 duplicate Create는 기존 mapping, Post, PostContent, visibility와 timestamp를 변경하지 않는다
