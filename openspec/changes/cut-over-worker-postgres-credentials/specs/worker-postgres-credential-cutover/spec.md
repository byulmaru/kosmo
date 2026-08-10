## ADDED Requirements

### Requirement: trusted 실행 경계는 명시적 Worker connection을 사용한다

**Authority / Provenance:** Linear `PROD-470`, `PROD-715` — Web의 trusted federation ingress와 Temporal Worker DB Activity는 PROD-470의 완전한 Worker client certificate input을 사용해 생성한 명시적 database connection을 사용해야 한다(MUST). Password가 없는 `kosmo_worker`를 `WORKER_DATABASE_PASSWORD`로 인증하거나 API/Web BFF 기본 connection 또는 전역 owner database singleton으로 fallback해서는 안 된다(MUST NOT).

#### Scenario: Web trusted federation ingress 실행

- **WHEN** Web가 검증된 inbound federation 요청을 처리하며 database 작업을 실행한다
- **THEN** 해당 요청의 database 작업은 명시적으로 생성·전달된 Worker connection을 사용한다
- **AND** Web BFF 기본 `DATABASE_URL` connection은 사용하지 않는다

#### Scenario: Temporal Worker DB Activity 실행

- **WHEN** 등록된 Temporal Worker DB Activity가 database 작업을 실행한다
- **THEN** Activity가 호출하는 core/Fedify 작업은 명시적으로 생성·전달된 Worker connection을 사용한다
- **AND** process 전역 기본 database connection으로 fallback하지 않는다

### Requirement: Worker credential은 API 기본 연결과 독립적으로 전환한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-470`, `PROD-715` — 시스템은 Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 Worker connection만 password 없는 `kosmo_worker` LOGIN + `BYPASSRLS` client certificate source로 전환해야 한다(MUST). API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD` connection을 바꾸거나 API Rollout에 Worker certificate·credential을 노출해서는 안 된다(MUST NOT).

#### Scenario: Worker credential cutover

- **WHEN** Worker selector를 production `kosmo_worker` URL과 완전한 client certificate/key/CA source로 설정한다
- **THEN** Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 Worker connection만 새 source를 사용한다
- **AND** API Rollout과 Web BFF 기본 connection은 기존 owner/API source를 유지한다
- **AND** `kosmo_worker` connection은 password fallback을 사용하지 않는다

#### Scenario: API Worker credential 비주입

- **WHEN** Worker selector가 활성화된 production manifest를 렌더한다
- **THEN** API Rollout에는 Worker certificate Secret·volume·path·connection option 또는 동등한 trusted Worker DB execution 입력이 없다

### Requirement: Worker credential source는 독립적으로 rollback한다

**Authority / Provenance:** Linear `PROD-470`, `PROD-715` — 시스템은 API/Web BFF 기본 connection과 application SQL을 변경하지 않고 Worker certificate selector만 기존 owner/password source로 되돌릴 수 있어야 한다(MUST). Rollback은 Worker connection을 API credential과 혼합하거나 실패한 certificate 인증을 password로 자동 재시도해서는 안 된다(MUST NOT).

#### Scenario: Worker selector rollback

- **WHEN** Worker selector를 승인된 owner fallback source로 되돌리고 API selector와 workload image를 유지한다
- **THEN** Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 Worker connection만 owner credential source로 돌아간다
- **AND** API/Web BFF 기본 connection과 migration connection은 바뀌지 않는다

### Requirement: production 전환은 별도 승인과 live role 검증을 요구한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-470`, `PROD-715` — 시스템 운영자는 별도 사용자의 명시적 승인 없이 production Worker certificate sync/apply 또는 workload cutover를 수행해서는 안 된다(MUST NOT). 승인된 전환 뒤에는 Web trusted federation ingress와 Temporal Worker connection의 certificate authentication, `current_user = 'kosmo_worker'` 및 `rolbypassrls = true`를 live environment에서 검증해야 한다(MUST).

#### Scenario: 승인 없는 production 변경

- **WHEN** OpenSpec, 코드, PR 또는 CI가 준비됐지만 production sync/apply에 대한 별도 사용자 승인이 없다
- **THEN** production Secret sync, manifest apply, Argo sync와 workload cutover를 수행하지 않는다

#### Scenario: 승인된 production 전환 검증

- **WHEN** 사용자가 production 전환을 별도로 승인하고 Web과 Worker rollout이 완료된다
- **THEN** 두 명시적 Worker connection의 `current_user`가 `kosmo_worker`임을 검증한다
- **AND** 해당 role의 `rolbypassrls`가 `true`임을 검증한다
- **AND** client cert/key/CA와 server hostname 검증을 사용하며 password fallback이 없음을 검증한다
- **AND** API Rollout에 Worker credential과 trusted Worker DB execution이 없고 API/Web BFF 기본 connection이 바뀌지 않았음을 검증한다
