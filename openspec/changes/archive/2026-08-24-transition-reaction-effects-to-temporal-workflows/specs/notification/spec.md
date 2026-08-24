## ADDED Requirements

### Requirement: Reaction Effects Workflow Notification lifecycle

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/reaction.md`, `PROD-413`, `PROD-419`, `PROD-723` — Accepted Reaction Create Effects Workflow의 Worker Activity는 committed Reaction ID로 기존 Reaction Notification recipient, self suppression, visibility와 uniqueness 정책을 적용해 Notification을 멱등 생성해야 한다(MUST). Accepted Delete Effects Workflow의 Worker Activity는 deleted Reaction ID를 source로 하는 Notification을 멱등 정리해야 한다(MUST).

#### Scenario: Reaction Notification 생성

- **WHEN** 새 Reaction의 Create Effects Workflow가 Notification Activity를 실행하고 Recipient가 기존 정책을 충족한다
- **THEN** Activity는 Reaction을 source로 하는 Unread Reaction Notification을 최대 하나 생성한다

#### Scenario: self Reaction 또는 보이지 않는 source

- **WHEN** Reaction Author가 Post Author와 같거나 Recipient가 source Reaction의 Post 또는 Profile을 조회할 수 없다
- **THEN** Notification Activity는 committed Reaction을 유지한 멱등 no-op으로 끝난다

#### Scenario: Reaction Notification 정리

- **WHEN** 실제 삭제된 Reaction의 Delete Effects Workflow가 Notification Activity를 실행한다
- **THEN** Activity는 해당 Reaction ID를 source로 하는 Reaction Notification을 삭제한다
- **AND** Notification이 이미 없으면 멱등 no-op으로 끝난다

#### Scenario: Notification Activity 실패

- **WHEN** Notification 생성 또는 정리가 재시도 가능한 저장 실패를 만난다
- **THEN** Temporal Activity는 같은 Reaction source로 재시도할 수 있다
- **AND** committed Reaction과 다른 federation Activity 시도를 실패로 바꾸지 않는다

#### Scenario: Create와 Delete Workflow의 교차 실행

- **WHEN** Create Notification Activity가 source를 읽은 뒤 Delete Workflow cleanup과 교차 실행되어 unavailable Notification이 남는다
- **THEN** 시스템은 Reaction source row를 잠그거나 Reaction 삭제를 지연하지 않는다
- **AND** 기존 API visibility는 source가 없는 Notification을 숨긴다
- **AND** durable reconciliation은 PROD-328의 별도 책임으로 유지한다
