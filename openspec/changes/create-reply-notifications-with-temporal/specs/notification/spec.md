## MODIFIED Requirements

### Requirement: Reply Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-426`, `PROD-507`, `PROD-722` 시스템은 origin과 application entrypoint에 관계없이 다른 Profile의 Post에 새 Reply가 실제 commit되면 결과 Reply를 source로 하는 Profile-scoped Reply Notification Workflow를 공통 post-commit lifecycle에서 시작해야 한다(MUST).

#### Scenario: 다른 Profile의 Post에 Reply

- **WHEN** 새 Reply transaction이 commit되고 Reply Author와 Parent Author가 다르며 Recipient가 결과 Reply와 Reply Author를 조회할 수 있다
- **THEN** 시스템은 결과 Reply를 Related Post와 source로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification 생성 Workflow를 시작한다
- **AND** 이름, handle, Profile 또는 Post snapshot을 kind data에 저장하지 않는다

#### Scenario: ActivityPub 원격 Reply

- **WHEN** 새 ActivityPub 원격 Reply가 Local Parent를 참조해 commit된다
- **THEN** 공통 core Post 생성 lifecycle은 Local Parent Author를 Recipient, 원격 Reply Author를 Related Profile, 결과 Reply를 source와 Related Post로 하는 Notification을 정확히 하나 생성하는 Workflow를 시작한다
- **AND** Fedify adapter는 Notification side effect를 직접 호출하지 않는다

#### Scenario: duplicate 또는 concurrent ActivityPub Create

- **WHEN** ActivityPub object URI가 이미 저장되어 duplicate 또는 concurrent Create가 no-op이 된다
- **THEN** 시스템은 Reply Notification Workflow를 다시 시작하지 않는다
- **AND** 과거에 누락된 Notification을 backfill하지 않는다

#### Scenario: self-reply

- **WHEN** Reply Author와 Parent Author가 같다
- **THEN** 시스템은 Reply 생성 결과를 유지한다
- **AND** Workflow Activity는 Reply Notification을 생성하지 않는다

#### Scenario: Recipient에게 결과가 보이지 않음

- **WHEN** Parent Author Profile이 결과 Reply 또는 Reply Author Profile을 조회할 수 없다
- **THEN** Workflow Activity는 Reply Notification을 생성하지 않는다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 결과 Reply source의 Notification 저장 경계가 중복 또는 동시 호출된다
- **THEN** 같은 Recipient, Reply kind와 source ID의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Reply Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-426`, `PROD-507`, `PROD-722` Reply Notification Workflow start 또는 Activity 실패는 Reply transaction, GraphQL 성공 또는 ActivityPub 수신 성공을 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT). Temporal이 start를 수락한 뒤의 transient Activity
실패는 retry해야 하며(MUST), commit 뒤 start 요청 전 프로세스 종료에 따른 누락은 수용해야 한다(MUST).

#### Scenario: Notification Activity 저장 실패

- **WHEN** accepted Reply Notification Workflow의 Activity가 transient 저장 오류로 실패한다
- **THEN** 시스템은 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** Temporal은 Activity retry 정책에 따라 Notification 생성을 재시도한다

#### Scenario: caller-owned outer transaction

- **WHEN** 공통 Post 생성 action이 caller-owned transaction에 참여해 새 Reply를 만든다
- **THEN** Reply Notification Workflow start는 outer transaction이 실제 commit되기 전에 실행되지 않는다
- **AND** outer transaction이 rollback되면 Reply, Notification과 Workflow를 모두 남기지 않는다

#### Scenario: start가 수락되기 전 누락

- **WHEN** Reply가 commit된 뒤 Workflow start 요청 전에 process가 종료된다
- **THEN** Reply는 유지되고 Reply Notification은 누락될 수 있다
- **AND** transactional intent, outbox, relay 또는 backfill로 누락을 자동 복구하지 않는다
