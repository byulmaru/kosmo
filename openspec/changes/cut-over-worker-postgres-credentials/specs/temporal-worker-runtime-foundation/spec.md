## MODIFIED Requirements

### Requirement: Worker workload 기본 DB source

**Authority / Provenance:** `PROD-730`, `PROD-715` — 활성화된 Worker Deployment는 chart가 생성한 `kosmo_worker` PgBouncer URL과 PROD-369의 release별 Worker Secret ref를 process 기본 `DATABASE_URL`/`DATABASE_PASSWORD`로 사용해야 한다(MUST). 별도 Worker credential selector, `WORKER_DATABASE_*` application connection을 만들거나 foundation 자체가 business DB connection을 열어서는 안 된다(MUST NOT).

#### Scenario: 역할별 credential이 구성됨

- **WHEN** Worker component를 활성화한다
- **THEN** Deployment의 기본 `DATABASE_*`는 Worker source를 참조한다
- **AND** `DATABASE_URL`은 chart가 고정된 `kosmo_worker` username, `kosmo` database와 기존 PgBouncer endpoint로 생성한다
- **AND** `DATABASE_PASSWORD`는 같은 release의 `*-postgres-worker` Secret `password` key를 참조한다
- **AND** `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않는다

#### Scenario: Worker credential values 입력 부재

- **WHEN** 기본 values와 임의 배포 환경을 렌더한다
- **THEN** `postgres.credentials.worker` 설정 없이 release naming만으로 Worker URL과 Secret ref를 생성한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 기본 DB 입력이 존재해도 connection을 열지 않는다
