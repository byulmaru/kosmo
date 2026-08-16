## MODIFIED Requirements

### Requirement: Worker workload 기본 DB source

**Authority / Provenance:** Linear `PROD-715`, superseded rendering boundary `PROD-722` — 유효한 immutable release image가 지정된 chart에서 항상 렌더되는 Worker Deployment는 chart가 생성한 direct read-write Service의 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` env로 process 기본 `kosmo_worker` DB source를 사용해야 한다(MUST). `DATABASE_URL`/`DATABASE_PASSWORD`, 별도 Worker credential selector, `WORKER_DATABASE_*` application connection을 만들거나 Worker runtime registration/lifecycle을 이 change에서 변경해서는 안 된다(MUST NOT).

#### Scenario: Worker Deployment가 렌더됨

- **WHEN** 유효한 immutable release image로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment를 생성한다
- **AND** Worker template은 별도 activation key 없이 render된다
- **AND** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo_worker`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 같은 release의 `*-postgres-worker` Secret `password` key를 참조한다
- **AND** `DATABASE_URL`/`DATABASE_PASSWORD`를 투영하지 않고 postgres.js의 표준 PG env 해석을 사용하며, process-wide DB source fallback이나 완전성 flag를 두지 않는다
- **AND** `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않는다

#### Scenario: Worker credential values 입력 부재

- **WHEN** 과거 workload 또는 Worker activation 값을 추가하거나 생략한 채 유효한 immutable release image로 chart를 렌더한다
- **THEN** Worker resources를 항상 생성한다
- **AND** Worker credential PG env와 Secret ref는 항상 렌더되는 Worker template에 투영된다
