## ADDED Requirements

### Requirement: Core-owned Repost transition 뒤 effects Workflow 시작

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-725` — Local GraphQL Repost는 Repost 상태를 specialized Core action transaction에 저장해야 하고(MUST), verified ActivityPub Announce·Undo는 Repost 상태와 필요한 current ActivityPub mapping을 specialized Core action의 같은 transaction에서 저장해야 한다(MUST). 최초 실제 create/delete transition이 commit된 뒤에만 committed Repost identity, transition kind와 explicit `origin: LOCAL | ACTIVITYPUB`으로 effects Workflow start를 시도해야 한다(MUST). pure Repost 경로의 caller가 database handle, 반환형 `postCommit` 또는 후속 효과를 조립해서는 안 된다(MUST NOT).

#### Scenario: Local Repost 최초 생성 commit

- **WHEN** Local GraphQL Repost action이 새 Active Repost를 commit한다
- **THEN** Core action은 create transition effects Workflow start를 시도한다
- **AND** GraphQL은 기존 committed Repost payload를 반환한다

#### Scenario: verified Announce materialization commit

- **WHEN** verified ActivityPub Announce가 Repost와 current ActivityPub mapping을 같은 Core transaction에서 commit한다
- **THEN** Core action은 `origin=ACTIVITYPUB`인 create transition effects Workflow start를 시도한다
- **AND** inbound handler는 기존 acknowledgement 경계를 유지한다

#### Scenario: 최초 Repost 취소 commit

- **WHEN** Local GraphQL 또는 verified ActivityPub Undo가 Active pure Repost를 Tombstone으로 처음 전이해 commit한다
- **THEN** Core action은 delete transition effects Workflow start를 시도한다
- **AND** delete input은 `repostId`, `origin=LOCAL | ACTIVITYPUB`, `transition=DELETE`만 보존하고, delete Activity는 Tombstone row에 보존된 actor/source/createdAt/visibility projection을 다시 읽는다

#### Scenario: duplicate, no-op 또는 rollback

- **WHEN** Repost create가 기존 Active identity로 수렴하거나 delete가 이미 Tombstone인 결과로 수렴하거나 transaction이 rollback된다
- **THEN** 시스템은 새 effects Workflow를 시작하지 않는다
- **AND** Notification이나 Fedify queue 효과를 직접 실행하지 않는다

### Requirement: create/delete별 stable Workflow identity와 start gap 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-725` — Repost effects Workflow ID는 committed Repost ID와 create/delete transition kind에서 안정적으로 파생되어야 하며(MUST), 한 Repost의 create와 delete가 종료된 같은 Workflow ID를 공유해서는 안 된다(MUST NOT). 같은 transition의 중복 start는 기존 execution으로 수렴하고 종료된 같은 transition ID는 재사용하지 않아야 한다(MUST NOT). commit 뒤 process 종료, Temporal 연결 오류 또는 start 실패는 허용된 효과 유실 경계로 관측하되 committed domain 결과와 caller 성공을 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: stable create와 delete identity

- **WHEN** 같은 Repost의 create와 이후 delete transition이 각각 commit된다
- **THEN** 두 Workflow ID는 같은 Repost ID를 포함하면서 transition kind로 구분된다
- **AND** 각 transition의 retry는 자기 stable Workflow identity를 유지한다

#### Scenario: 같은 transition의 중복 start

- **WHEN** 같은 committed transition의 Workflow start 요청이 중복된다
- **THEN** 시스템은 기존 execution 또는 동등한 idempotent start 결과로 수렴한다
- **AND** effects Workflow를 별도로 중복 실행하지 않는다

#### Scenario: commit 뒤 start 실패

- **WHEN** Repost transition commit 뒤 process가 종료되거나 Workflow start가 실패한다
- **THEN** 시스템은 committed Repost와 GraphQL/ActivityPub 성공 결과를 유지한다
- **AND** 실패를 관측하지만 command receipt, transactional outbox·relay 또는 자동 backfill을 추가하지 않는다

### Requirement: Repost Notification lifecycle의 멱등 Activity

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-725` — accepted create Workflow는 기존 Recipient·self suppression·visibility·uniqueness 정책으로 Repost Notification을 멱등 생성해야 하며(MUST), accepted delete Workflow는 Repost ID를 source로 하는 Notification을 멱등 정리해야 한다(MUST). 이는 canonical Best Effort projection이며 unavailable source의 잔여 row는 모든 API surface에서 숨겨야 한다(MUST). create/delete를 직렬화하는 `FOR UPDATE` 또는 row lock을 추가하지 않아야 한다(MUST NOT). 두 효과는 Core transaction이나 caller에서 직접 실행해서는 안 된다(MUST NOT).

#### Scenario: 다른 Local Profile의 Post Repost

- **WHEN** 다른 Local Profile의 Post에 대한 create transition Workflow가 accepted된다
- **THEN** Notification Activity는 Repost Post를 source, Source Author를 Recipient, Repost Author를 Related Profile로 사용해 Repost Notification을 멱등 생성한다
- **AND** 반복 Activity 실행에도 같은 Recipient, kind와 source 조합의 item은 하나만 존재한다

#### Scenario: self Repost 또는 Remote Recipient

- **WHEN** Repost Author와 Source Author가 같거나 Source Author가 Remote Profile이다
- **THEN** Notification Activity는 committed Repost를 유지하고 item을 만들지 않는 성공한 no-op으로 끝난다

#### Scenario: Repost delete cleanup

- **WHEN** delete transition Workflow가 accepted된다
- **THEN** Notification Activity는 Repost kind와 committed Repost ID로 대응 item을 멱등 삭제한다
- **AND** 이미 없거나 숨겨진 item의 반복 cleanup도 성공한 no-op으로 끝난다

#### Scenario: Notification create/delete 경합

- **WHEN** accepted create effects의 Notification projection과 delete effects의 cleanup이 서로 다른 시점에 경합한다
- **THEN** 시스템은 canonical Best Effort semantics를 유지하고 stale Notification row가 남아도 Repost가 unavailable한 동안 모든 API surface에서 숨긴다
- **AND** create/delete를 직렬화하기 위해 `FOR UPDATE` 또는 row lock을 사용하지 않는다

### Requirement: Local-origin Announce와 Undo queue handoff Activity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-448`, `PROD-725` — accepted effects Workflow는 `origin=LOCAL`인 create transition을 기존 canonical Announce identity·audience·recipient 규칙으로, delete transition을 같은 Announce를 가리키는 canonical Undo로 Fedify PostgreSQL MessageQueue producer에 handoff해야 한다(MUST). `origin=ACTIVITYPUB`인 transition은 outbound echo를 만들면 안 된다(MUST NOT). Activity 성공 경계는 queue acceptance이고, acceptance 뒤 remote retry·ordering은 Fedify가 소유해야 한다(MUST).

#### Scenario: Local create Announce handoff

- **WHEN** Local Repost create Workflow가 accepted되고 canonical projection이 가능하다
- **THEN** Activity는 Repost ID에서 파생한 같은 Announce identity로 Fedify queue handoff를 재시도한다
- **AND** remote delivery를 직접 수행하지 않는다

#### Scenario: Local delete Undo handoff

- **WHEN** Local Repost delete Workflow가 accepted된다
- **THEN** Activity는 Tombstone row에 보존된 Repost와 Source identity로 원본 Announce를 가리키는 Undo를 같은 ordering domain에 handoff한다
- **AND** Author Profile이 더 이상 `ACTIVE`가 되어 있지 않다는 이유만으로 committed Undo를 no-op하지 않는다
- **AND** Source의 현재 lifecycle 때문에 과거 Announce identity를 새로 만들거나 변경하지 않는다

#### Scenario: ActivityPub origin echo suppression

- **WHEN** verified Announce 또는 Undo에서 시작한 `origin=ACTIVITYPUB` Workflow가 실행된다
- **THEN** Workflow는 outbound Announce·Undo Activity를 실행하지 않는다
- **AND** Notification lifecycle만 적용한다

#### Scenario: 모호한 queue acknowledgement

- **WHEN** queue acceptance acknowledgement가 모호해 Activity가 같은 handoff를 재시도한다
- **THEN** 시스템은 같은 canonical activity identity를 사용한다
- **AND** duplicate enqueue나 remote request가 없다는 cross-system exactly-once를 주장하지 않는다

### Requirement: 독립 effects와 caller 성공 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `PROD-725` — Notification과 federation handoff가 모두 적용되는 Workflow는 두 Activity를 독립적으로 시작하고 각 최종 결과를 수집해야 하며(MUST), 한 Activity의 terminal failure가 다른 Activity 시도를 막아서는 안 된다(MUST NOT). Activity retry는 유한해야 하며(MUST), effects 실패가 committed Repost나 기존 GraphQL/ActivityPub 성공 의미를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 한 effect의 terminal failure

- **WHEN** Notification 또는 Fedify handoff Activity 하나가 retry를 소진한다
- **THEN** Workflow는 다른 적용 가능한 Activity의 실행과 결과 수집을 계속한다
- **AND** committed Repost와 caller 성공 결과를 유지한다

#### Scenario: 모든 effect 성공

- **WHEN** 적용 가능한 Notification과 Fedify handoff Activity가 queue 또는 database 경계에서 성공한다
- **THEN** Workflow는 두 결과를 수집하고 종료한다
- **AND** Fedify queue acceptance 뒤 remote delivery 완료를 기다리지 않는다
