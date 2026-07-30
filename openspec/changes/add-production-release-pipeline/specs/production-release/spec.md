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

**Authority / Provenance:** PROD-563 — 시스템은 production environment의 명시적 승인과 production 전용 권한 경계를 통과한 실행만 배포 상태를 변경하도록 해야 한다(MUST). 승인되지 않은 실행은 Argo CD production 자격 증명을 얻거나 `kosmo-prod` Application을 변경해서는 안 된다(MUST NOT).

#### Scenario: 승인 전 실행

- **WHEN** production release 실행이 생성됐지만 environment 승인이 완료되지 않았다
- **THEN** 시스템은 production 자격 증명 취득과 모든 배포 변경을 시작하지 않는다

#### Scenario: 승인된 실행

- **WHEN** 허용된 ref의 실행이 production environment 승인을 받는다
- **THEN** 시스템은 해당 실행에 한정된 권한으로 검증된 release 배포를 계속한다

### Requirement: Migration과 workload는 같은 release identity를 사용한다

**Authority / Provenance:** PROD-563 — 시스템은 production migration Job, API Rollout과 Web Rollout에 하나의 동일한 digest-pinned image identity를 전달해야 한다(MUST). PROD-564가 제공하는 해당 release migration 성공이 확인되기 전에는 새 API·Web workload를 활성화해서는 안 된다(MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 선택한 digest를 사용하는 production migration이 성공한다
- **THEN** 시스템은 같은 digest를 사용하는 API·Web preview workload의 준비 검증으로 진행한다

#### Scenario: Migration 실패 또는 성공 신호 부재

- **WHEN** 선택한 release의 migration이 실패하거나 성공으로 확인되지 않는다
- **THEN** 시스템은 새 API·Web release를 활성화하지 않고 배포를 실패로 기록한다

### Requirement: API와 Web은 활성화 전에 함께 검증된다

**Authority / Provenance:** PROD-563 — 시스템은 새 release의 API와 Web preview workload가 모두 준비된 뒤에만 production traffic 승격을 시작해야 한다(MUST). 어느 Rollout이라도 준비 또는 승격에 실패하면 새 release를 정상 release로 기록해서는 안 되며(MUST NOT), 이전 active release를 유지하거나 복구해야 한다(MUST).

#### Scenario: 두 preview가 모두 준비됨

- **WHEN** migration 성공 뒤 같은 digest의 API와 Web preview가 모두 준비된다
- **THEN** 시스템은 두 Rollout을 새 release로 승격하고 둘의 active identity가 일치하는지 확인한다

#### Scenario: 한 preview가 실패함

- **WHEN** API 또는 Web preview 중 하나라도 준비되지 않거나 실패한다
- **THEN** 시스템은 어느 새 preview도 production traffic에 활성화하지 않고 이전 active release를 유지한다

#### Scenario: 승격 중 실패함

- **WHEN** 두 preview 검증 뒤 Rollout 승격 또는 active identity 확인이 실패한다
- **THEN** 시스템은 실행을 실패로 기록하고 두 workload를 이전 release identity로 복구한다

### Requirement: Release 재실행과 application rollback은 감사 가능하다

**Authority / Provenance:** PROD-563 — 시스템은 같은 immutable SemVer GitHub Release tag를 다시 선택할 때 그 Release asset이 고정한 동일 identity로 배포를 재실행해야 하며(MUST), 이전 정상 immutable Release tag를 같은 승인 pipeline으로 재선택해 application rollback할 수 있어야 한다(MUST). 각 실행은 요청자, 승인, Release tag, 해석한 digest, 이전 identity와 최종 결과를 감사 가능한 배포 기록에 남겨야 한다(MUST). 이 rollback은 DB rollback이나 destructive migration 실행을 포함해서는 안 된다(MUST NOT).

#### Scenario: 같은 release 재실행

- **WHEN** 운영자가 이전 실행과 같은 immutable Release tag를 다시 승인한다
- **THEN** 시스템은 새 image를 build하거나 다른 digest를 해석하지 않고 같은 release identity로 배포를 재실행한다

#### Scenario: 이전 정상 release 재선택

- **WHEN** 운영자가 현재 DB와 호환되는 이전 정상 immutable Release tag를 승인한다
- **THEN** 시스템은 같은 pipeline으로 API·Web application을 해당 identity에 되돌리고 실행 결과를 기록한다

#### Scenario: DB rollback 요청 아님

- **WHEN** 이전 application release를 재선택한다
- **THEN** 시스템은 DB 상태를 되돌리거나 destructive migration을 실행하지 않는다
