## ADDED Requirements

### Requirement: 기존 workload PostgreSQL 연결 보존

**Authority / Provenance:** Linear `PROD-709` — 시스템은 역할별 credential 값을 명시하지 않은 기존 Helm values를 사용할 때 API, web/federation 및 migration workload의 현재 PostgreSQL 연결 환경을 동일하게 렌더해야 한다(MUST). Credential 선택 기능만 배포한 release는 workload의 database role, Secret, endpoint 또는 런타임 동작을 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 기존 values 렌더

- **WHEN** 역할별 PostgreSQL credential opt-in 없이 기존 values로 Helm manifest를 렌더한다
- **THEN** API와 web/federation은 현재 CloudNativePG owner `-app` Secret과 read-write Service 기반 `DATABASE_URL`을 그대로 사용하고, dev migration은 현재 owner fallback을, production migration은 별도 migration login/Secret과 `DATABASE_MIGRATION_ROLE=kosmo` 전환을 유지한다

#### Scenario: 지원 기능만 먼저 배포

- **WHEN** 새 credential 선택을 활성화하지 않은 chart version만 기존 workload에 배포한다
- **THEN** workload가 관찰하는 database identity와 연결 방식은 배포 전과 같아야 한다

### Requirement: API와 Web BFF의 공유 credential 선택

**Authority / Provenance:** Linear `PROD-709`, `PROD-369` — 시스템은 하나의 API PostgreSQL URL과 password Secret source를 API Rollout과 Web BFF의 기본 DB 연결에 공통으로 선택할 수 있게 해야 한다(MUST). API와 Web에 서로 다른 DB 인증 source를 만들어서는 안 되며(MUST NOT), opt-in은 실제 Secret 값이나 PostgreSQL role을 chart에서 생성하지 않고 이미 provision된 외부 Secret만 참조해야 한다(MUST).

#### Scenario: API credential 선택

- **WHEN** API PostgreSQL URL과 password Secret reference를 opt-in한다
- **THEN** API Rollout과 Web BFF 기본 `DATABASE_URL` 연결은 같은 source를 사용하고 별도 Web credential source는 렌더되지 않는다

#### Scenario: API credential rollback

- **WHEN** API credential opt-in을 제거하고 image와 system 설정을 유지한다
- **THEN** API Rollout과 Web BFF 기본 연결은 함께 기존 owner 연결로 돌아가며 federation/system 전용 connection 입력은 바뀌지 않는다

### Requirement: Web federation/system 전용 DB connection credential의 별도 선택

**Authority / Provenance:** Linear `PROD-709`, `PROD-706`, `PROD-715` — 시스템은 Web 프로세스의 federation/system 전용 DB connection에 별도 PostgreSQL URL과 password Secret source를 제공할 수 있어야 한다(MUST). 이 system 입력은 API Rollout에 주입되거나 Web BFF의 기본 `DATABASE_URL`을 덮어써서는 안 되며(MUST NOT), 이 change는 두 번째 DB connection 객체나 client를 생성하거나 해당 credential로 연결해서는 안 된다(MUST NOT).

#### Scenario: System credential 입력 선택

- **WHEN** system PostgreSQL URL과 password Secret reference를 opt-in한다
- **THEN** Web Rollout에만 federation/system 전용 DB connection 환경 입력이 추가되고 API Rollout과 Web BFF 기본 연결은 바뀌지 않는다

#### Scenario: System credential 입력 rollback

- **WHEN** system credential opt-in을 제거하고 image와 API 설정을 유지한다
- **THEN** Web의 federation/system 전용 DB connection 환경 입력만 제거되고 API Rollout과 Web BFF 기본 연결은 바뀌지 않는다

#### Scenario: 불완전한 역할 credential 선택 거부

- **WHEN** API 또는 system source에 PostgreSQL URL 또는 password Secret name/key 중 일부만 설정한다
- **THEN** Helm render는 custom 입력과 owner fallback을 섞지 않고 명확한 오류로 실패한다

### Requirement: Migration owner credential 경계

**Authority / Provenance:** Linear `PROD-709` — 시스템은 migration owner 연결을 API 및 system runtime credential 선택과 별도 설정 경계로 유지해야 한다(MUST). Runtime credential opt-in은 dev 또는 production migration Job의 credential, role 전환 또는 실행 순서를 암묵적으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Runtime 입력만 전환 준비

- **WHEN** API 또는 system runtime credential source를 opt-in하고 migration credential을 변경하지 않는다
- **THEN** migration Job은 기존 dev owner fallback 또는 production migration Secret과 `DATABASE_MIGRATION_ROLE` 계약을 그대로 사용한다

#### Scenario: Migration과 runtime 설정 비교

- **WHEN** rendered migration Job과 API/system Rollout의 PostgreSQL 환경을 검토한다
- **THEN** migration credential source는 두 runtime credential source 중 어느 하나에서 파생되지 않고 명시적으로 분리되어 있다

### Requirement: Password와 후속 file-based TLS 계약의 호환

**Authority / Provenance:** Linear `PROD-709`; 관련 후속 계약 Linear `PROD-470`은 `PGSSLCERT`, `PGSSLKEY`, `PGSSLROOTCERT` file-based TLS 활성화를 별도로 소유한다 — 시스템은 역할별 runtime 선택에서 password Secret과 `DATABASE_URL` 환경 계약을 지원해야 한다(MUST). 이 선택의 values와 render 경계는 후속 file-based TLS 입력과 독립적으로 합성할 수 있어야 하며(MUST), 이 change가 인증서 Secret, volume, PostgreSQL TLS 또는 client-certificate 인증을 생성하거나 활성화해서는 안 된다(MUST NOT).

#### Scenario: Password credential 선택

- **WHEN** workload가 별도 password Secret reference와 그 password 변수를 사용하는 PostgreSQL URL을 선택한다
- **THEN** workload는 Secret value가 rendered manifest에 나타나지 않은 채 선택한 password credential로 연결할 수 있다

#### Scenario: 후속 TLS 환경과 공존

- **WHEN** 후속 변경이 같은 workload에 PostgreSQL TLS file 환경과 volume을 추가한다
- **THEN** 역할별 URL·password Secret values는 후속 TLS mode의 URL 및 file 환경 선택과 충돌하지 않는 별도 입력 경계로 유지될 수 있다

### Requirement: Workload별 rollback과 downstream 비소유

**Authority / Provenance:** Linear `PROD-709`; downstream transition Linear `PROD-715`, `PROD-716` — 시스템은 API와 system의 PostgreSQL credential 선택을 image reference와 서로 독립적인 Helm 입력으로 제공해야 한다(MUST). 운영자는 한 역할 source의 선택 값만 제거해 이전 연결 경계로 rollback할 수 있어야 하며(MUST), 이 change는 실제 role/Secret provisioning, credential 전환, RLS policy 또는 downstream transition 검증을 포함해서는 안 된다(MUST NOT).

#### Scenario: API와 system 선택의 독립성

- **WHEN** API credential source와 federation/system 전용 connection source를 함께 opt-in한다
- **THEN** API/Web BFF 공유 연결과 Web federation/system 전용 connection 입력은 서로 다른 Secret source를 참조하고 어느 한쪽의 rollback이 다른 쪽을 바꾸지 않는다

#### Scenario: Expand 범위 검토

- **WHEN** 이 change의 manifest와 source diff를 검토한다
- **THEN** 새로운 Secret value, PostgreSQL role/grant/RLS 또는 API/system의 실제 non-owner credential 선택은 포함되지 않는다
