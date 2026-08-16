# temporal-post-create-effects Specification

## Purpose

core `createPost(input)` transaction이 실제 commit된 뒤 Reply Notification과 Local-origin ActivityPub
Create 후속 효과를 Temporal Workflow의 재시도 경계로 이동한다. Post transaction과 caller 결과는
동기적으로 유지하고, commit 이후 Workflow start와 외부 효과의 실패는 별도로 격리한다.

## ADDED Requirements

### Requirement: 기존 Post transaction 뒤 effects Workflow 시작

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, `PROD-722`. Local GraphQL과 verified ActivityPub Create의 Post·PostContent·Author/Reply Parent 관계·필요한 ActivityPub mapping 저장과 domain 검증은 `createPost(input)`의 core-owned transaction이 소유해야 하며(MUST), core action은 실제 transaction commit 뒤에만 committed Post ID를 사용한 effects Workflow start를 시도해야 한다(MUST). Temporal transaction Activity로 Post source를 새로 만들거나 resolver/Fedify handler가 database handle·`postCommit` callback·후속 효과를 직접 조립해서는 안 된다(MUST NOT).

#### Scenario: Local root 또는 Reply commit 뒤 start

- **WHEN** Local GraphQL이 root Post 또는 Reply transaction을 성공적으로 commit한다
- **THEN** 시스템은 commit된 Post ID로 effects Workflow start를 시도한다
- **AND** Post transaction 결과와 GraphQL create 성공 payload는 기존 동기 경계로 반환한다

#### Scenario: ActivityPub root 또는 Reply commit 뒤 start

- **WHEN** verified ActivityPub Create가 기존 Post transaction을 성공적으로 commit한다
- **THEN** 시스템은 commit된 Post ID와 inbound origin으로 effects Workflow start를 시도한다
- **AND** ActivityPub handler는 기존 acknowledgement 처리 경계를 유지한다

#### Scenario: Post transaction rollback

- **WHEN** Local 또는 ActivityPub Post transaction이 commit 전에 validation·permission·domain 오류로 rollback된다
- **THEN** 시스템은 effects Workflow start를 시도하지 않는다
- **AND** Post, PostContent, ActivityPub mapping과 후속 Notification/queue 효과를 남기지 않는다

### Requirement: stable Post ID Workflow와 commit-start 유실 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, `PROD-722`. Effects Workflow의 Workflow ID는 실제 commit된 Post ID만에서 안정적으로 파생되어야 하고 explicit origin은 input으로 전달해야 하며(MUST), 실행 중인 동일 ID의 start는 기존 execution으로 수렴하고 종료된 동일 ID는 성공·실패·취소 상태와 관계없이 재사용해서는 안 된다(MUST NOT). commit과 Workflow start 사이의 process 종료, Temporal 연결 오류 또는 start 실패는 허용된 effects 유실 경계로 처리해야 하며(MUST), 이미 성공한 Post transaction caller의 성공·acknowledgement를 실패로 바꾸어서는 안 된다(MUST NOT). 이 capability는 transaction Activity, proposed Post ID, command receipt table, transactional outbox/relay 또는 cross-request exactly-once를 추가해서는 안 된다(MUST NOT).

#### Scenario: accepted Workflow의 stable identity

- **WHEN** Post transaction이 commit되고 시스템이 Post ID를 사용해 effects Workflow start를 요청한다
- **THEN** accepted Workflow는 해당 Post ID에서 파생한 stable Workflow ID를 사용한다
- **AND** Workflow 재시도는 같은 Post ID와 Workflow identity를 사용한다

#### Scenario: 중복 start

- **WHEN** 같은 committed Post에 대한 Workflow start 요청이 네트워크 재시도 등으로 중복된다
- **THEN** 시스템은 같은 Workflow ID의 기존 실행 또는 동등한 idempotent start 결과를 사용한다
- **AND** Reply Notification과 Local Fedify effect를 별도 Workflow로 중복 시작하지 않는다

#### Scenario: 종료된 Workflow ID 재사용 거부

- **WHEN** 같은 committed Post ID의 effects Workflow가 성공, 실패 또는 취소로 이미 종료된 뒤 start가 다시 요청된다
- **THEN** 시스템은 종료된 Workflow ID를 재사용해 새 execution을 만들지 않는다
- **AND** duplicate 요청을 누락 effects의 backfill 또는 reconciliation 계기로 사용하지 않는다

#### Scenario: commit 뒤 start 유실 또는 실패

- **WHEN** Post transaction이 commit된 뒤 process가 종료되거나 Temporal Workflow start가 오류로 거절된다
- **THEN** 시스템은 committed Post와 기존 GraphQL/ActivityPub 성공·acknowledgement 결과를 유지한다
- **AND** 해당 effects가 유실될 수 있음을 관측하지만 command receipt, outbox, relay 또는 동기 caller 재시도를 자동으로 추가하지 않는다

### Requirement: Reply Notification의 멱등 post-commit 효과

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-426`, `PROD-507`, `PROD-722`. accepted effects Workflow는 다른 Profile의 committed Reply에 대해 기존 Recipient·Related Profile·Related Post·visibility·self suppression·uniqueness 정책을 사용해 Reply Notification을 멱등적으로 생성해야 하며(MUST), Post transaction 내부 savepoint나 API/Fedify handler의 직접 Notification 호출을 사용해서는 안 된다(MUST NOT).

#### Scenario: 다른 Profile의 Reply

- **WHEN** committed Reply의 Reply Author와 Parent Author가 다르고 Recipient가 Reply와 Author를 조회할 수 있으며 effects Workflow가 accepted된다
- **THEN** Workflow는 결과 Reply를 source와 Related Post로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification을 생성한다
- **AND** kind data에는 이름·handle·Profile·Post snapshot을 저장하지 않는다

#### Scenario: self-reply 또는 unavailable recipient

- **WHEN** Reply Author와 Parent Author가 같거나 Recipient가 결과 Reply 또는 Reply Author Profile을 조회할 수 없다
- **THEN** Workflow는 committed Reply를 유지한다
- **AND** Reply Notification을 생성하지 않는다

#### Scenario: Notification retry와 duplicate

- **WHEN** accepted effects Workflow가 재시작·재시도로 같은 Reply source를 다시 처리하거나 동시 Notification 저장이 발생한다
- **THEN** 같은 Recipient, Reply kind와 source ID 조합의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 idempotent no-op으로 끝난다

#### Scenario: Notification effect failure

- **WHEN** Workflow의 Notification Activity가 재시도 후에도 저장에 실패한다
- **THEN** committed Post와 GraphQL/ActivityPub 성공 결과는 유지된다
- **AND** transaction savepoint, application outbox, MessageQueue 또는 backfill이 추가 Notification owner가 되지 않는다

### Requirement: Local Fedify queue 효과와 ActivityPub echo suppression

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`, `PROD-448`, `PROD-512`, `PROD-722`. accepted effects Workflow는 `origin: LOCAL`인 committed content Post의 root·Reply Create를 기존 canonical Local Note builder와 audience/target 규칙으로 Fedify PostgreSQL MessageQueue producer에 handoff해야 하며(MUST), `origin: ACTIVITYPUB`인 Post에는 outbound Create나 remote HTTP delivery를 만들면 안 된다(MUST NOT). queue acceptance 뒤 remote delivery retry는 기존 Fedify consumer가 소유해야 하며(MUST), 이 capability는 queue internals·consumer·custom relay를 추가해서는 안 된다(MUST NOT).

#### Scenario: Local root 또는 Reply Create

- **WHEN** `origin=LOCAL`인 root Post 또는 Reply transaction이 commit되고 effects Workflow가 accepted된다
- **THEN** Workflow는 root와 Reply에 동일한 canonical Create builder를 사용해 queue producer에 handoff한다
- **AND** Local parent Reply는 parent canonical Note를 `inReplyTo`로 사용하며 기존 audience/target 규칙을 유지한다

#### Scenario: ActivityPub origin echo suppression

- **WHEN** `origin=ACTIVITYPUB`인 inbound Post transaction이 commit되고 effects Workflow가 실행된다
- **THEN** Workflow는 Local Post Create queue message를 생성하지 않는다
- **AND** inbound acknowledgement 이후 remote HTTP delivery를 직접 실행하거나 재시도하지 않는다

#### Scenario: Fedify handoff failure와 retry

- **WHEN** `origin=LOCAL` effects Workflow가 queue handoff에서 일시적 오류를 만나거나 handoff 전 Worker가 재시작된다
- **THEN** Workflow는 committed Post를 rollback하지 않고 같은 stable Post/activity identity로 handoff를 재시도할 수 있다
- **AND** custom transactional outbox, domain relay 또는 remote delivery history를 추가하지 않는다

### Requirement: caller의 동기 결과와 effects 실패 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-722`. Post Create Workflow 전환은 기존 Local GraphQL mutation의 committed Post payload와 ActivityPub inbound acknowledgement 의미를 변경해서는 안 된다(MUST NOT). caller는 Post transaction 결과를 기준으로 성공 또는 기존 오류를 확정해야 하며(MUST), effects Workflow의 start 오류·Notification 저장 결과·Fedify remote delivery 완료를 Post 성공의 조건으로 기다려서는 안 된다(MUST NOT). Notification과 Fedify handoff가 모두 적용되면 Workflow는 두 Activity를 독립적으로 실행하고 각 최종 결과를 수집해 한 Activity의 terminal failure가 다른 Activity의 시도를 막지 않아야 한다(MUST).

#### Scenario: GraphQL success와 start failure

- **WHEN** Local GraphQL Post transaction이 commit되지만 post-commit effects Workflow start가 오류를 반환한다
- **THEN** GraphQL mutation은 기존 committed Post 성공 payload를 반환한다
- **AND** start failure는 별도로 관측되며 Post transaction이나 caller 성공을 rollback하지 않는다

#### Scenario: ActivityPub acknowledgement와 child effect failure

- **WHEN** ActivityPub Post transaction이 commit된 뒤 effects Workflow가 Notification 또는 queue Activity에서 실패한다
- **THEN** inbound handler는 기존 acknowledgement 성공 경계를 유지한다
- **AND** child effect failure는 이미 반환된 acknowledgement를 사후 실패로 바꾸지 않는다

#### Scenario: 독립 effects 중 하나의 terminal failure

- **WHEN** Notification과 Fedify handoff가 모두 적용되고 먼저 완료된 한 Activity가 retry 소진 뒤 terminal failure가 된다
- **THEN** Workflow는 다른 Activity를 이미 독립적으로 시작했거나 계속 실행해 그 최종 결과도 수집한다
- **AND** 한 Activity의 terminal failure를 이유로 다른 effect 시도를 생략하지 않는다

#### Scenario: Post transaction failure

- **WHEN** 기존 Post transaction이 validation·permission·domain 오류로 commit되지 않는다
- **THEN** Local GraphQL과 ActivityPub ingress는 기존 오류/acknowledgement 실패 경계를 유지한다
- **AND** effects Workflow와 후속 Notification/queue 효과를 시작하지 않는다
