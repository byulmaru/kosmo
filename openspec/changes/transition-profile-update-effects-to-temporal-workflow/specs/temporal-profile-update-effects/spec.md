## ADDED Requirements

### Requirement: Committed Profile Update effects Workflow

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-665` 시스템은 federation-visible Local Profile 변경이 실제로 commit된 경우에만 변경마다 자동 생성한 stable update identity와 Profile ID로 Profile Update Effects Workflow를 시작해야 한다(MUST). Temporal이 요구하는 Workflow ID에는 그 update identity를 그대로 사용해 같은 Profile의 연속 변경을 별도 실행으로 구분해야 하며(MUST), 같은 실행의 retry와 restart는 기존 실행으로 수렴해야 한다(MUST). Profile transaction은 Core action이 동기적으로 소유해야 하고(MUST), caller database handle, caller-side `postCommit`, transaction Activity를 사용해서는 안 된다(MUST NOT).

#### Scenario: Actor-visible 변경 commit

- **WHEN** displayName, bio, followPolicy, avatar 또는 header가 저장된 현재 값과 다르게 commit된다
- **THEN** Core action은 해당 commit을 위한 update identity를 자동 생성한다
- **AND** Profile ID와 update identity로 Profile Update Effects Workflow를 시작한다
- **AND** 같은 Profile의 다른 변경은 별도 update identity와 Workflow 실행을 갖는다

#### Scenario: 비대상 또는 no-op 변경

- **WHEN** Tag·default Post visibility만 변경되거나 actor-visible 입력이 저장된 값과 같다
- **THEN** Core action은 Profile Update Effects Workflow를 시작하지 않는다

#### Scenario: 거부 또는 rollback

- **WHEN** Profile update가 validation·authorization 실패로 거부되거나 transaction이 rollback된다
- **THEN** 시스템은 해당 미반영 변경을 위한 Workflow를 시작하지 않는다

#### Scenario: Workflow start 실패

- **WHEN** Profile commit 뒤 Temporal Workflow start가 실패한다
- **THEN** 시스템은 Profile ID와 update identity와 함께 실패를 관측한다
- **AND** committed Profile과 GraphQL mutation 성공 결과를 rollback하거나 실패로 바꾸지 않는다

### Requirement: Latest-at-delivery Profile projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-665` Profile Update Effects Workflow의 Activity는 실행 시점의 최신 committed Profile과 Media를 읽어 canonical `Update(Person)`을 Fedify queue에 handoff해야 한다(MUST). 같은 Workflow 실행의 Activity retry는 동일한 update identity와 ActivityPub activity IRI를 재사용해야 한다(MUST). 시스템은 빠른 연속 Profile 변경의 delivery ordering, 각 commit 시점 projection, cross-update exactly-once를 보장해서는 안 된다(MUST NOT).

#### Scenario: Activity retry

- **WHEN** 같은 Profile Update Activity가 queue handoff 실패 뒤 retry된다
- **THEN** Activity는 같은 update identity로 같은 ActivityPub Update IRI를 구성한다
- **AND** 실행 시점의 최신 committed Profile projection을 다시 읽는다

#### Scenario: 빠른 연속 Profile 변경

- **WHEN** 같은 Profile의 actor-visible 값이 연속으로 commit되고 각 Workflow Activity가 실행된다
- **THEN** 각 Workflow는 서로 다른 update identity를 유지한다
- **AND** 각 Activity는 실행 시점의 최신 committed projection을 전달할 수 있다
- **AND** 이 capability는 commit 순서와 원격 관측 순서를 일치시키는 projection version 또는 ordering ledger를 만들지 않는다

#### Scenario: Worker restart

- **WHEN** accepted Profile Update Effects Workflow 처리 중 Worker가 재시작된다
- **THEN** Workflow는 같은 Profile ID와 update identity로 Activity 실행을 재개할 수 있다

### Requirement: Profile Update 효과의 실패 경계

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-448`, `PROD-665` Temporal Activity 성공 경계는 Fedify PostgreSQL queue acceptance여야 한다(MUST). Queue acceptance 전 실패는 Temporal Activity retry가 소유하고(MUST), acceptance 뒤 remote delivery retry와 최종 실패는 Fedify consumer가 소유해야 한다(MUST). Commit과 Workflow start 사이의 durable intent, reconciliation 또는 backfill은 이 capability가 보장해서는 안 된다(MUST NOT).

#### Scenario: Queue handoff 전 실패

- **WHEN** canonical projection 구성 또는 Fedify queue handoff가 실패한다
- **THEN** Temporal은 Profile Update Activity를 설정된 정책으로 재시도한다

#### Scenario: Queue acceptance 이후 실패

- **WHEN** Fedify queue가 Update를 수락한 뒤 remote delivery가 실패한다
- **THEN** Fedify consumer가 기존 정책으로 remote delivery를 재시도하고 최종 실패를 관측한다
- **AND** Temporal Activity는 remote delivery 완료를 기다리지 않는다

#### Scenario: Commit과 Workflow start 사이 종료

- **WHEN** application process가 Profile commit 뒤 Workflow start 수락 전에 종료된다
- **THEN** committed Profile은 유지된다
- **AND** 이 capability는 해당 변경의 Workflow backfill 또는 전달을 보장하지 않는다
