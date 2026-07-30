## ADDED Requirements

### Requirement: Production release는 immutable GitHub Release가 고정한 image identity를 사용한다

**Authority / Provenance:** PROD-563 — 시스템은 정식 SemVer image build가 성공한 뒤 full registry digest reference를 Release asset으로 포함해 immutable GitHub Release를 발행해야 한다(MUST). Production 변경 전에는 선택한 SemVer Release가 immutable하고 해당 asset이 Release attestation과 일치하는지 검증해 image identity를 확정해야 한다(MUST). 배포 과정에서 artifact를 다시 build하거나 raw Git tag·draft/mutable Release·container tag만 workload identity로 사용해서는 안 된다(MUST NOT).

#### Scenario: Immutable release 선택

- **WHEN** 운영자가 검증 가능한 immutable GitHub Release의 정식 SemVer tag를 선택한다
- **THEN** 시스템은 attested Release asset에서 `repository@sha256:...` identity를 읽어 production release로 확정한다

#### Scenario: Immutable release가 아님

- **WHEN** 선택한 SemVer tag에 발행된 immutable GitHub Release가 없거나 Release 검증이 실패한다
- **THEN** 시스템은 production 배포 상태를 변경하기 전에 실행을 실패시킨다

#### Scenario: Image identity asset 검증 실패

- **WHEN** Release asset이 없거나 asset attestation·형식 검증을 통과하지 못한다
- **THEN** 시스템은 production 배포 상태를 변경하기 전에 실행을 실패시킨다

### Requirement: Production 배포는 명시적 승인을 요구한다

**Authority / Provenance:** PROD-563 — 시스템은 production environment의 명시적 승인과 production 전용 권한 경계를 통과한 실행만 배포 상태를 변경하도록 해야 한다(MUST). 한 번의 승인은 선택한 immutable release image에 포함된 migration과 API·Web workload 전체에 적용되어야 하며(MUST), contract migration만을 위한 별도 Environment·수동 입력·중복 승인을 요구해서는 안 된다(MUST NOT). 승인되지 않은 실행은 Argo CD production 자격 증명을 얻거나 `kosmo-prod` Application을 변경해서는 안 된다(MUST NOT).

#### Scenario: 승인 전 실행

- **WHEN** production release 실행이 생성됐지만 environment 승인이 완료되지 않았다
- **THEN** 시스템은 production 자격 증명 취득과 모든 배포 변경을 시작하지 않는다

#### Scenario: 승인된 실행

- **WHEN** 허용된 ref의 실행이 production environment 승인을 받는다
- **THEN** 시스템은 해당 실행에 한정된 권한으로 검증된 release 배포를 계속한다

#### Scenario: Contract migration이 포함된 release

- **WHEN** 승인된 immutable production release에 contract migration이 포함된다
- **THEN** 시스템은 다른 release와 같은 production 승인 안에서 동일 digest의 Argo CD PreSync migration Job을 실행한다
- **AND** generic phase·schema authority·compatibility·rollback-window gate나 contract 전용 추가 승인을 요구하지 않는다

### Requirement: Migration과 workload는 같은 release identity를 사용한다

**Authority / Provenance:** PROD-563 — 시스템은 production migration Job, API Rollout과 Web Rollout에 하나의 동일한 digest-pinned image identity를 전달해야 한다(MUST). Argo CD PreSync migration Job이 해당 release에 대해 성공하기 전에는 새 API·Web workload를 활성화해서는 안 된다(MUST NOT). General release workflow가 운영자에게 migration context, phase, schema authority 또는 credential을 별도 입력받거나 Helm Job에 command·phase·schema authority를 설정해서는 안 된다(MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 선택한 digest를 사용하는 production migration이 성공한다
- **THEN** Argo CD sync는 PreSync hook 완료 뒤 같은 digest를 사용하는 API·Web workload 적용으로 진행한다

#### Scenario: Migration 실패 또는 성공 신호 부재

- **WHEN** 선택한 release의 migration이 실패하거나 성공으로 확인되지 않는다
- **THEN** Argo CD sync는 실패하고 시스템은 새 API·Web release를 활성화하지 않은 채 배포를 실패로 기록한다

### Requirement: API와 Web은 controller 기본 activation을 사용한다

**Authority / Provenance:** PROD-563 — 시스템은 같은 digest의 PreSync migration이 성공한 뒤 Argo CD가 API와 Web Rollout을 적용하고 각 Rollout controller의 기본 activation 동작으로 진행하게 해야 한다(MUST). Release pipeline은 두 Rollout의 preview를 교차 대기하거나 직접 승격해서는 안 되며(MUST NOT), 이전 stable ReplicaSet을 탐색해 자동 application recovery를 수행해서도 안 된다(MUST NOT).

#### Scenario: Migration 뒤 workload 적용

- **WHEN** 같은 digest의 PreSync migration이 성공한다
- **THEN** Argo CD는 같은 desired digest의 API와 Web Rollout을 적용하고 각 controller는 기본 activation 동작으로 release를 진행한다

#### Scenario: Sync 또는 Rollout 실패

- **WHEN** Argo CD sync 또는 API·Web Rollout 진행이 실패한다
- **THEN** 시스템은 실행을 실패로 기록하고 pipeline은 ReplicaSet을 직접 선택해 자동 복구하지 않는다

#### Scenario: Application rollback 필요

- **WHEN** 실패 뒤 application을 이전 release로 되돌려야 한다
- **THEN** 운영자는 현재 DB와 호환되는 이전 immutable Release tag를 같은 승인 pipeline으로 다시 선택한다

### Requirement: Release 재실행과 application rollback은 감사 가능하다

**Authority / Provenance:** PROD-563 — 시스템은 같은 immutable SemVer GitHub Release tag를 다시 선택할 때 그 Release asset이 고정한 동일 identity로 배포를 재실행해야 하며(MUST), 이전 정상 immutable Release tag를 같은 승인 pipeline으로 재선택해 application rollback할 수 있어야 한다(MUST). 각 실행은 요청자, 승인, Release tag, 해석한 digest와 최종 결과를 감사 가능한 배포 기록에 남겨야 한다(MUST). 이 rollback은 DB rollback이나 destructive migration 실행을 포함해서는 안 된다(MUST NOT).

#### Scenario: 같은 release 재실행

- **WHEN** 운영자가 이전 실행과 같은 immutable Release tag를 다시 승인한다
- **THEN** 시스템은 새 image를 build하거나 다른 digest를 해석하지 않고 같은 release identity로 배포를 재실행한다

#### Scenario: 이전 정상 release 재선택

- **WHEN** 운영자가 현재 DB와 호환되는 이전 정상 immutable Release tag를 승인한다
- **THEN** 시스템은 같은 pipeline으로 API·Web application을 해당 identity에 되돌리고 실행 결과를 기록한다

#### Scenario: DB rollback 요청 아님

- **WHEN** 이전 application release를 재선택한다
- **THEN** 시스템은 DB 상태를 되돌리거나 destructive migration을 실행하지 않는다
