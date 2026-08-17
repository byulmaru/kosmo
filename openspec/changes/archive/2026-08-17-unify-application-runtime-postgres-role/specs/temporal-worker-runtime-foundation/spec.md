## MODIFIED Requirements

### Requirement: Worker 역할별 DB 입력 seam

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. 항상 렌더되는 Temporal Worker Deployment는 API 역할과 Fedify 역할의 별도 credential values가 아니라 retained `kosmo_worker`의 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source를 process 기본 DB로 사용해야 한다(MUST). `DATABASE_URL`/`DATABASE_PASSWORD`, 별도 Worker credential selector, `WORKER_DATABASE_*` application connection 또는 Fedify DB context를 만들거나 Worker runtime registration·lifecycle을 이 change에서 변경해서는 안 된다(MUST NOT).

#### Scenario: Worker가 shared Worker source를 사용함

- **WHEN** 유효한 immutable release image로 Worker component를 렌더한다
- **THEN** Deployment는 기존 direct read-write Service, `PGPORT=5432`, `PGUSER=kosmo_worker`, `PGDATABASE=kosmo`와 release별 Worker Secret `PGPASSWORD` ref를 가져야 한다
- **AND** `DATABASE_URL`/`DATABASE_PASSWORD`, API/Fedify 역할별 URL·password selector, `WORKER_DATABASE_*`와 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않아야 한다

#### Scenario: shared source의 부분 구성

- **WHEN** historical API 또는 Fedify URL·password selector를 일부만 제공하거나 activation 값을 추가·생략한 채 chart를 렌더한다
- **THEN** Worker는 역할별 selector를 조합하거나 owner fallback을 사용하지 않고 chart-derived shared Worker PG\* source를 사용해야 한다
- **AND** Worker registration, startup, readiness, shutdown과 Temporal task behavior는 이 role 전환으로 변경되지 않아야 한다
