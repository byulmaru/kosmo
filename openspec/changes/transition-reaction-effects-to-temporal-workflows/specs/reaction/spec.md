## ADDED Requirements

### Requirement: Reaction transaction과 후속 효과 시작 경계

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, `docs/architecture/core-services.md`, `PROD-723` — Core는 Local GraphQL과 verified ActivityPub ingress의 Reaction 생성·삭제 transaction 및 기존 uniqueness와 ABA 정책을 소유해야 한다(MUST). Public caller는 database handle을 전달하거나 반환형 `postCommit`을 실행해서는 안 되며(MUST NOT), Core는 실제 transaction이 반환된 뒤에만 해당 Effects Workflow 시작을 시도해야 한다(MUST).

#### Scenario: Local Reaction 생성

- **WHEN** Local caller가 조회 가능한 Post에 허용 Type의 Reaction을 새로 생성한다
- **THEN** Core는 기본 database로 Reaction을 commit하고 생성 결과를 반환한다
- **AND** commit 뒤 Create Effects Workflow 시작을 시도한다

#### Scenario: Local Reaction 삭제

- **WHEN** Local caller가 자신의 현재 Reaction을 실제 삭제한다
- **THEN** Core는 삭제 row를 반환받아 commit하고 삭제 결과를 반환한다
- **AND** commit 뒤 Delete Effects Workflow 시작을 시도한다

#### Scenario: 반복 추가 또는 삭제

- **WHEN** 같은 Profile, Post와 Type의 Reaction이 이미 존재하거나 삭제 대상이 존재하지 않는다
- **THEN** 기존 멱등 결과와 삭제 ABA 허용 계약을 유지한다
- **AND** consistency만을 위한 `SELECT FOR UPDATE`나 Effects Workflow를 추가하지 않는다

#### Scenario: Notification projection과 source 삭제 경합

- **WHEN** Reaction Notification 생성과 Reaction 삭제가 서로 다른 transaction에서 경합한다
- **THEN** Notification projection은 Reaction source row를 `FOR UPDATE`로 잠그지 않는다
- **AND** Reaction 생성·삭제의 latency와 결과는 best-effort Notification 정합성에 종속되지 않는다
