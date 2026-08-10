## ADDED Requirements

### Requirement: API와 Worker runtime은 서로 분리된 비소유 database identity를 가진다

**Authority / Provenance:** Linear `PROD-369`. 모든 Helm 배포 환경의 database는 API runtime에 `kosmo_api`, Web trusted federation ingress와 Temporal Worker DB Activity에 `kosmo_worker` LOGIN 역할과 환경별 credential을 선언적으로 provision해야 한다(MUST). `kosmo_api`는 `BYPASSRLS`가 비활성이고 `kosmo_worker`는 `BYPASSRLS`가 활성이어야 한다(MUST). 두 역할은 `kosmo` owner나 `kosmo_migration`, 서로의 역할 또는 다른 privilege escalation 역할의 member가 아니어야 하며(MUST NOT), SUPERUSER, CREATEDB, CREATEROLE과 REPLICATION은 비활성이어야 한다(MUST NOT).

#### Scenario: 역할과 credential을 새로 provision함

- **WHEN** 기존 owner workload가 실행 중인 임의의 Helm 배포 환경 release에 Expand manifest를 적용한다
- **THEN** API와 Worker용 LOGIN 역할 및 서로 다른 credential Secret이 추가된다
- **AND** 기존 `kosmo`와 `kosmo_migration` 역할·credential은 변경되지 않는다

#### Scenario: 역할별 RLS attribute와 privilege escalation 경계를 확인함

- **WHEN** API 또는 Worker credential로 PostgreSQL role 속성과 membership을 확인한다
- **THEN** 해당 identity는 owner, migration 또는 상대 runtime 역할을 획득할 수 없다
- **AND** API identity는 `BYPASSRLS=false`, Worker identity는 `BYPASSRLS=true`이다
- **AND** SUPERUSER, CREATEDB, CREATEROLE과 REPLICATION은 모두 비활성이다

### Requirement: runtime 역할은 객체 privilege를 선점하지 않는다

**Authority / Provenance:** Linear `PROD-369`; downstream Linear `PROD-724`, `PROD-713`, `PROD-715`, `PROD-716`, `PROD-709`. 이 change는 `kosmo_api`, `kosmo_worker`에 schema/table/sequence privilege, default privilege, ownership 또는 grant option을 부여해서는 안 되며(MUST NOT), 공통 객체 권한과 default privilege는 PROD-724가, API RLS policy는 PROD-713이, API/Worker credential transition은 PROD-715/716이, workload credential selector는 PROD-709가 소유해야 한다(MUST).

#### Scenario: role provisioning 직후 객체 권한을 확인함

- **WHEN** role과 credential만 provision한 직후 catalog privilege를 확인한다
- **THEN** 두 runtime 역할에는 이 change가 부여한 schema/table/sequence privilege나 default privilege가 없다
- **AND** 기존 application 객체 owner는 변경되지 않는다

#### Scenario: schema 변경과 권한 상승을 거부함

- **WHEN** 각 runtime credential로 persistent schema/table 생성·변경, ownership 변경 또는 owner 역할 획득을 시도한다
- **THEN** PostgreSQL이 권한 부족으로 작업을 거부한다

### Requirement: Expand 배포는 기존 workload 선택과 RLS policy를 바꾸지 않는다

**Authority / Provenance:** Linear `PROD-369`; downstream Linear `PROD-709`, `PROD-724`, `PROD-713`, `PROD-715`, `PROD-716`; Worker foundation Linear `PROD-730`. 이 change는 새 역할과 credential만 추가해야 한다(MUST). API/Web/Worker workload의 기본 database Secret과 Web trusted federation ingress/Temporal Worker DB Activity의 Secret 선택, 기존 owner workload의 connection 설정, `kosmo` LOGIN 상태, `kosmo_migration`의 LOGIN→`SET ROLE kosmo` 계약, 객체 privilege와 모든 도메인 RLS policy는 변경해서는 안 된다(MUST NOT). API Rollout에는 Worker credential을 주입해서는 안 된다(MUST NOT).

#### Scenario: 구버전 workload와 병행 배포함

- **WHEN** Expand role/credential manifest를 배포한다
- **THEN** 실행 중인 owner workload는 기존 Secret과 owner identity로 재시작 없이 계속 동작하고 기본 비활성 Worker의 credential seam도 owner fallback을 유지한다
- **AND** 새 credential은 어떤 workload에도 선택되지 않는다
- **AND** API Rollout에는 Worker credential이 주입되지 않는다
- **AND** 도메인 RLS policy는 추가되거나 변경되지 않는다

#### Scenario: Expand 선언을 되돌림

- **WHEN** 후속 workload가 새 credential을 사용하기 전에 Expand 배포 선언을 이전 revision으로 되돌린다
- **THEN** 기존 owner workload와 migration 경계는 영향 없이 유지된다
- **AND** retained database role이나 ACL이 남는 경우에도 workload 선택이나 행 접근 의미는 바뀌지 않으며 재적용 가능한 상태로 남는다

### Requirement: 실제 credential로 권한 경계를 검증한다

**Authority / Provenance:** Linear `PROD-369`. 배포 검증은 두 runtime의 실제 credential로 `current_user`, role 속성, membership과 object ownership 부재를 확인해야 하며(MUST), Credential 원문이나 connection string은 로그, PR, Linear 또는 test artifact에 노출해서는 안 된다(MUST NOT).

#### Scenario: API credential 검증

- **WHEN** provision된 API credential로 검증 세션을 연다
- **THEN** `current_user`는 `kosmo_api`이고 owner/Worker 역할 획득과 `BYPASSRLS`가 불가능하다
- **AND** 이 change에서 객체 privilege나 ownership을 받지 않는다

#### Scenario: 비운영 환경에서 production 전 역할 경계를 검증함

- **WHEN** 환경별 비운영 credential과 DatabaseRole이 준비된다
- **THEN** API와 Worker credential로 `current_user`, role 속성, membership과 object ownership 부재를 production apply 전에 검증한다
- **AND** 이 비운영 환경 검증은 production sync/apply 승인을 의미하지 않는다

#### Scenario: Worker credential 검증

- **WHEN** provision된 Worker credential로 검증 세션을 연다
- **THEN** `current_user`는 `kosmo_worker`이고 owner/API 역할 획득은 불가능하며 `BYPASSRLS`는 활성이다
- **AND** 이 change에서 객체 privilege나 ownership을 받지 않는다

### Requirement: production apply는 별도 수동 승인을 요구한다

**Authority / Provenance:** Linear `PROD-369`; 2026-08-10 사용자 결정. PR merge, manifest 준비 또는 CI 통과는 production sync/apply를 승인하지 않으며(MUST NOT), 운영자는 Vault source 준비와 rollback·검증 절차를 확인한 뒤 사용자의 별도 명시적 승인을 받아야 한다(MUST).

#### Scenario: 승인 없이 manifest가 준비됨

- **WHEN** PR과 Helm manifest가 검증됐지만 production apply에 대한 별도 명시적 승인이 없다
- **THEN** 운영자는 production에 DatabaseRole이나 VaultStaticSecret을 생성·동기화하지 않는다
- **AND** 기존 production owner workload와 migration 경계만 유지한다

#### Scenario: 승인 뒤 production에 적용함

- **WHEN** Vault source와 rollback·검증 절차가 준비되고 사용자가 production apply를 명시적으로 승인한다
- **THEN** 승인된 release와 범위에 한해 두 runtime role과 credential source를 적용한다
- **AND** 적용 직후 destination Secret, DatabaseRole readiness와 실제 credential 경계를 검증한다
