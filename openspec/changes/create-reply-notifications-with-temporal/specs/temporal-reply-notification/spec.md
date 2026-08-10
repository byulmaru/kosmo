## ADDED Requirements

### Requirement: committed Reply의 stable Workflow start

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-722` 시스템은 origin과 application entrypoint에 관계없이 실제 Reply Post가 commit된 뒤 source Reply identity에서 파생한 stable Workflow ID로 Reply Notification Workflow start를 시도해야 한다(MUST). Workflow start 요청은
commit 전에는 실행해서는 안 되며(MUST NOT), rollback되거나 duplicate materialization으로 새 Reply가 생성되지
않으면 실행해서는 안 된다(MUST NOT).

#### Scenario: Local Reply commit

- **WHEN** Local GraphQL action이 새 Reply를 commit한다
- **THEN** 공통 core lifecycle은 source Reply identity의 stable Workflow ID로 Workflow start를 시도한다
- **AND** start 요청은 Reply transaction commit 뒤에 실행된다

#### Scenario: ActivityPub Reply commit

- **WHEN** ActivityPub inbound Create가 Local Parent를 참조하는 새 Reply를 commit한다
- **THEN** Local과 같은 공통 core lifecycle이 source Reply identity의 stable Workflow ID로 Workflow start를 시도한다
- **AND** Fedify adapter는 Reply Notification을 직접 생성하지 않는다

#### Scenario: rollback 또는 duplicate materialization

- **WHEN** Reply transaction이 rollback되거나 ActivityPub object URI duplicate가 no-op으로 끝난다
- **THEN** 시스템은 해당 처리에서 Reply Notification Workflow start를 시도하지 않는다

#### Scenario: caller-owned transaction

- **WHEN** 공통 Post 생성 action이 caller-owned transaction에 참여해 새 Reply를 만든다
- **THEN** Workflow start effect는 outer transaction이 실제 commit된 뒤에만 호출된다
- **AND** outer transaction이 rollback되면 Workflow start를 호출하지 않는다

### Requirement: Reply Notification Activity의 멱등 수렴

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-722` Reply Notification Workflow는 source Reply ID만으로 Activity를 실행해 현재 source와 visibility를 다시 조회하고, 기존 Reply Notification recipient·Related Post·Related Profile·self suppression·local recipient·unique 계약에 수렴해야 한다(MUST). transient 데이터베이스 실패는 Activity 실패로 유지해 재시도해야 하며(MUST), source가
존재하지 않거나 더 이상 유효한 Reply Notification을 만들 수 없으면 안전한 terminal no-op으로 끝나야 한다(MUST).

#### Scenario: 유효한 Reply source

- **WHEN** Activity가 다른 Local Profile의 visible Parent에 작성된 유효한 Reply source를 조회한다
- **THEN** 결과 Reply를 source와 Related Post로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification을 생성한다
- **AND** 이름, handle, Profile 또는 Post snapshot을 kind data에 저장하지 않는다

#### Scenario: self reply 또는 조회 불가 source

- **WHEN** Reply Author가 Parent Author와 같거나 Recipient가 결과 Reply 또는 Reply Author를 조회할 수 없다
- **THEN** Activity는 Reply Notification을 생성하지 않고 성공한 no-op으로 끝난다

#### Scenario: source가 더 이상 유효하지 않음

- **WHEN** Activity가 source 삭제·관계 제거 등으로 Reply Notification 필수 source를 조회할 수 없다
- **THEN** Workflow는 Notification을 만들지 않고 terminal no-op으로 수렴한다

#### Scenario: 동일 source replay

- **WHEN** 같은 source Reply의 Workflow 또는 Activity가 재실행되거나 동시에 처리된다
- **THEN** 같은 Recipient, Reply kind와 source ID의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

#### Scenario: transient 데이터베이스 실패

- **WHEN** 유효한 Reply를 처리하는 Activity가 일시적인 데이터베이스 오류로 실패한다
- **THEN** Temporal은 구성된 Activity retry 정책에 따라 같은 source Reply 처리를 재시도한다
- **AND** 재시도 성공 뒤 하나의 Reply Notification에 수렴한다

### Requirement: accepted Workflow의 durable 실행과 실패 격리

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722` Reply commit 뒤 Workflow start 요청은 완료를 기다려야 하지만(MUST), start 또는 Activity 실패가 이미 commit된 Post 결과나 GraphQL·ActivityPub 처리 성공을 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT). Temporal이
start를 수락한 Workflow는 history와 Activity retry를 사용해 Worker 재시작 뒤 같은 identity로 재개해야 한다(MUST).
시스템은 Reply transaction과 원자적인 intent/outbox/relay를 만들지 않아야 한다(MUST NOT).

#### Scenario: Workflow start 실패

- **WHEN** Reply가 commit된 뒤 Workflow start 요청이 실패하거나 timeout된다
- **THEN** 시스템은 실패를 관측 가능하게 기록하고 Reply와 호출 성공 결과를 유지한다
- **AND** transaction과 원자적인 intent 또는 relay가 없으므로 자동 복구를 보장하지 않는다

#### Scenario: commit과 start 사이 프로세스 종료

- **WHEN** Reply commit 뒤 Workflow start 요청 전에 process가 종료된다
- **THEN** Reply는 유지되고 Reply Notification은 누락될 수 있다
- **AND** 시스템은 이 구간을 durable delivery로 표현하지 않는다

#### Scenario: accepted Workflow 처리 중 Worker 재시작

- **WHEN** Temporal이 Workflow start를 수락한 뒤 Activity 완료 전에 Worker가 재시작된다
- **THEN** 같은 Workflow identity와 history에서 처리를 재개한다
- **AND** 최종 저장 결과는 하나의 Reply Notification 또는 source가 유효하지 않은 no-op에 수렴한다
