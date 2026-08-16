## MODIFIED Requirements

### Requirement: Reply Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, `PROD-426`, `PROD-507`, `PROD-722` — 시스템은 origin과 application entrypoint에 관계없이 다른 Profile의 Post에 새 Reply가 실제 생성되어 기존 Post transaction이 commit되면, Post ID 기반 effects Workflow 시작을 시도해야 한다(MUST). 시작이 수락된 경우 Workflow Activity는 process 기본 `db`로 결과 Reply를 다시 조회하고, 결과 Reply를 source로 하는 Profile-scoped Reply Notification을 기존 Notification 정책에 따라 직접 멱등 생성해야 한다(MUST). Reply Notification을 Post transaction 안의 Best Effort savepoint에서 직접 생성하거나 Activity 전용 pass-through core action에 위임해서는 안 된다(MUST NOT).

#### Scenario: 다른 Profile의 Post에 Reply

- **WHEN** 기존 Post transaction이 새 Reply를 commit하고 Reply Author와 Parent Author가 다르며 Recipient가 결과 Reply와 Reply Author를 조회할 수 있고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 결과 Reply를 Related Post와 source로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification 생성을 시도한다
- **AND** 이름, handle, Profile 또는 Post snapshot을 kind data에 저장하지 않는다

#### Scenario: ActivityPub 원격 Reply

- **WHEN** ActivityPub-origin Post transaction이 Local Parent를 참조하는 새 Reply를 commit하고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 Local Parent Author를 Recipient, 원격 Reply Author를 Related Profile, 결과 Reply를 source와 Related Post로 하는 Notification을 정확히 하나 생성한다
- **AND** Fedify adapter는 Notification side effect를 직접 호출하지 않는다

#### Scenario: duplicate 또는 concurrent ActivityPub Create

- **WHEN** ActivityPub object URI가 이미 저장되어 duplicate 또는 concurrent Create가 no-op이 된다
- **THEN** 시스템은 Reply Notification effects Workflow를 새로 시작하거나 Reply Notification lifecycle을 다시 실행하지 않는다
- **AND** 과거에 누락된 Notification을 backfill하지 않는다

#### Scenario: self-reply

- **WHEN** Reply Author와 Parent Author가 같다
- **THEN** 시스템은 Reply 생성 결과를 유지한다
- **AND** accepted effects Workflow의 Notification Activity는 Notification을 생성하지 않는 멱등 no-op으로 끝난다

#### Scenario: Recipient에게 결과가 보이지 않음

- **WHEN** Parent Author Profile이 결과 Reply 또는 Reply Author Profile을 조회할 수 없다
- **THEN** accepted effects Workflow의 Notification Activity는 Notification을 생성하지 않는 멱등 no-op으로 끝난다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 결과 Reply source에 대해 시작이 수락된 effects Workflow가 재시도되거나 Notification 저장 경계가 중복 또는 동시 호출된다
- **THEN** 같은 Recipient, Reply kind와 source ID의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Reply Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-426`, `PROD-507`, `PROD-722` — Reply Notification 생성 실패는 실제 commit된 Reply transaction, GraphQL 성공 또는 ActivityPub 수신 성공을 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT). Post ID 기반 effects Workflow 시작의 gap 또는 실패로 Notification 효과가 유실될 수 있는 경계는 허용하고 관측해야 하며(MUST), 시작이 수락된 뒤의 Notification Activity 재시도와 멱등 복구는 그 Workflow가 소유해야 한다(MUST).

#### Scenario: effects Workflow 시작 gap 또는 실패

- **WHEN** Reply transaction이 실제 commit됐지만 Post ID 기반 effects Workflow가 시작되기 전에 process가 종료되거나 start 요청이 수락되지 않는다
- **THEN** 시스템은 commit된 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** Reply Notification이 생성되지 않을 수 있는 start gap/failure를 허용하고 감지된 실패를 관측한다
- **AND** 별도 application outbox, MessageQueue, relay 또는 backfill로 누락된 Notification을 자동 복구하지 않는다

#### Scenario: Notification Activity 저장 실패

- **WHEN** 시작이 수락된 effects Workflow Activity가 Reply Notification 저장을 시도하고 재시도 가능한 저장 실패를 만난다
- **THEN** 시스템은 commit된 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** effects Workflow는 같은 Reply source에 대한 Notification 효과를 자신의 Temporal retry 경계에서 재시도할 수 있다
- **AND** transaction savepoint가 Notification 효과의 추가 owner가 되지 않는다

#### Scenario: Post transaction rollback

- **WHEN** 기존 Post transaction이 Reply를 commit하기 전에 rollback된다
- **THEN** 시스템은 Reply와 Reply Notification을 모두 남기지 않는다
- **AND** Post ID 기반 effects Workflow 시작을 시도하지 않는다
