## MODIFIED Requirements

### Requirement: Unavailable Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-328` — Recipient 자체가 API에 노출되지 않거나 kind별 source·Recipient·Related 객체가 unavailable인 Notification은 모든 API 표면에서 존재하지 않는 것으로 취급해야 한다(MUST).

#### Scenario: cleanup과 API visibility의 독립성

- **WHEN** cleanup이 아직 실행되지 않았거나 실패한다
- **THEN** connection, count, Node와 Read mutation은 unavailable item을 계속 즉시 숨긴다
- **AND** database row와 기존 Read State는 cleanup 전까지 남을 수 있다

#### Scenario: Recipient 자체의 복구 가능한 비가시성

- **WHEN** source와 Related 관계는 유효하지만 Recipient 자체가 일시 비활성 또는 정지된다
- **THEN** API는 item을 숨긴다
- **AND** cleanup은 이 상태만으로 Notification과 Read State를 삭제하지 않는다

## ADDED Requirements

### Requirement: Unavailable Notification의 bounded 비동기 cleanup

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-328` — 시스템은 활성 Temporal Schedule의 반복 실행마다 한 번의 bounded cleanup Activity로 unavailable Notification을 best-effort 삭제해야 한다(MUST).

#### Scenario: bounded batch 삭제

- **WHEN** cleanup Workflow가 실행된다
- **THEN** Workflow는 cleanup Activity를 한 번 호출한다
- **AND** Activity는 현재 unavailable인 Notification을 제한된 수만 삭제한다

#### Scenario: 삭제 직전 availability 회복

- **WHEN** candidate 선택 뒤 삭제 전에 source 또는 Related 관계가 available로 회복된다
- **THEN** delete 조건은 Notification ID와 현재 unavailable 조건을 다시 확인한다
- **AND** 회복된 row를 보존한다

#### Scenario: retry와 반복 실행

- **WHEN** Activity commit 뒤 응답이 유실되어 retry되거나 다음 Schedule 실행이 시작된다
- **THEN** 추가 batch가 삭제될 수 있다
- **AND** 실행별 정확한 삭제 개수를 보장하지 않지만 available row와 대상 외 row는 보존한다
- **AND** 반복 실행으로 backlog가 best-effort 수렴한다

#### Scenario: Schedule 생성

- **WHEN** 환경의 deterministic cleanup Schedule이 없다
- **THEN** 시스템은 24시간 기본 interval과 `SKIP` overlap으로 활성 Schedule을 생성한다
- **AND** 기존 Schedule이 있으면 timing, action, overlap과 pause 상태를 변경하지 않는다

#### Scenario: 관측

- **WHEN** cleanup이 실행되거나 실패한다
- **THEN** Activity structured log와 Temporal의 기본 Workflow/Schedule 상태로 결과를 확인할 수 있다
- **AND** cleanup 전용 custom metrics나 정확한 처리량 회계를 요구하지 않는다
