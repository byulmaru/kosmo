## ADDED Requirements

### Requirement: trusted 실행 경계는 명시적 Worker connection을 사용한다

**Authority / Provenance:** Linear `PROD-710`, `PROD-715` — Web trusted federation ingress와 Temporal Worker DB Activity는 `WORKER_DATABASE_URL`/`WORKER_DATABASE_PASSWORD`로 생성한 명시적 database connection을 사용해야 한다(MUST). API/Web BFF 기본 connection이나 전역 owner database singleton으로 trusted SQL을 실행해서는 안 된다(MUST NOT).

#### Scenario: Web trusted federation ingress 실행

- **WHEN** Web가 검증된 inbound federation 요청의 database 작업을 실행한다
- **THEN** 해당 작업은 명시적으로 전달된 Worker connection을 사용한다
- **AND** Web BFF 기본 connection은 사용하지 않는다

#### Scenario: Temporal Worker DB Activity 실행

- **WHEN** 등록된 Temporal Worker DB Activity가 database 작업을 실행한다
- **THEN** Activity가 호출하는 core/Fedify 작업은 명시적으로 전달된 Worker connection을 사용한다
- **AND** process 전역 기본 connection으로 fallback하지 않는다

### Requirement: Worker credential은 기존 PgBouncer를 통해 독립 전환한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-715` — Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 Worker connection만 Vault/VSO가 공급한 `kosmo_worker` LOGIN + `BYPASSRLS` SCRAM credential로 기존 CloudNativePG PgBouncer에 연결해야 한다(MUST). PgBouncer를 우회하거나 API/Web BFF 기본 connection을 바꾸거나 API Rollout에 Worker credential을 노출해서는 안 된다(MUST NOT).

#### Scenario: Worker credential cutover

- **WHEN** Worker selector를 production `kosmo_worker` Pooler URL과 완전한 password Secret source로 설정한다
- **THEN** Web trusted ingress와 Temporal Worker DB Activity의 명시적 Worker connection만 새 source를 사용한다
- **AND** API/Web BFF 기본 connection은 기존 source를 유지한다

#### Scenario: API Worker credential 비주입

- **WHEN** Worker selector가 활성화된 manifest를 렌더한다
- **THEN** API Rollout에는 `WORKER_DATABASE_*` 또는 동등한 trusted Worker DB 입력이 없다

### Requirement: Worker credential source는 독립적으로 rollback한다

**Authority / Provenance:** Linear `PROD-715` — 시스템은 API/Web BFF 기본 connection과 application SQL을 변경하지 않고 Worker selector만 승인된 owner source로 되돌릴 수 있어야 한다(MUST). Worker 인증 실패 중 owner credential로 자동 재시도해서는 안 된다(MUST NOT).

#### Scenario: Worker selector rollback

- **WHEN** Worker selector를 비활성화하고 API selector와 workload image를 유지한다
- **THEN** PROD-710의 명시적 Worker handle만 승인된 기존 owner connection을 사용한다
- **AND** API/Web BFF 기본 connection과 migration은 바뀌지 않는다

### Requirement: production 전환은 별도 승인과 live role 검증을 요구한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-715` — 별도 사용자의 명시적 승인 없이 production Secret sync/apply 또는 workload cutover를 수행해서는 안 된다(MUST NOT). 승인된 전환 뒤에는 Web trusted ingress와 Temporal Worker connection의 Pooler 경로, `current_user = 'kosmo_worker'`와 `rolbypassrls = true`를 검증해야 한다(MUST).

#### Scenario: 승인 없는 production 변경

- **WHEN** OpenSpec, 코드, PR 또는 CI가 준비됐지만 production 승인이 없다
- **THEN** production Secret sync, manifest apply, Argo sync와 workload cutover를 수행하지 않는다

#### Scenario: 승인된 production 전환 검증

- **WHEN** 사용자가 production 전환을 별도로 승인하고 rollout이 완료된다
- **THEN** 두 명시적 Worker connection이 기존 PgBouncer를 사용하고 `current_user = 'kosmo_worker'`임을 검증한다
- **AND** `rolbypassrls = true`, API Worker credential 부재와 기본 connection 불변을 검증한다
