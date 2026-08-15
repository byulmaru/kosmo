## ADDED Requirements

### Requirement: Worker workload 기본 DB source

**Authority / Provenance:** Linear `PROD-715` — 기존 `workloads.enabled && worker.enabled` activation gate에서 렌더되는 Worker Deployment는 chart가 생성한 direct read-write Service의 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` env로 process 기본 `kosmo_worker` DB source를 사용해야 한다(MUST). `DATABASE_URL`/`DATABASE_PASSWORD`, 별도 Worker credential selector, `WORKER_DATABASE_*` application connection을 만들거나 Worker runtime registration/lifecycle을 이 change에서 변경해서는 안 된다(MUST NOT).

#### Scenario: Worker Deployment가 렌더됨

- **WHEN** `workloads.enabled=true`와 `worker.enabled=true`로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment를 생성한다
- **AND** Worker template의 기존 activation gate를 유지한다
- **AND** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo_worker`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 같은 release의 `*-postgres-worker` Secret `password` key를 참조한다
- **AND** `DATABASE_URL`/`DATABASE_PASSWORD`를 투영하지 않고 postgres.js의 표준 PG env 해석을 사용하며, process-wide DB source fallback이나 완전성 flag를 두지 않는다
- **AND** `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않는다

#### Scenario: Worker credential values 입력 부재

- **WHEN** 기본 values에서 `workloads.enabled=true`와 `worker.enabled=false`를 사용하거나 `worker.enabled`를 생략한다
- **THEN** Worker resources를 생성하지 않는다
- **AND** Worker credential PG env와 Secret ref는 enabled Worker template에만 투영된다

## REMOVED Requirements

### Requirement: Worker 역할별 DB 입력 seam

**Authority / Provenance:** Linear `PROD-730`, `PROD-709`, `PROD-715`

**Reason:** API/Fedify URL과 password selector를 Worker에 투영하는 historical seam은 process 기본 DB를 표준 `PG*` source 하나로 통일한 최신 계약과 충돌한다.

**Migration:** enabled Worker Deployment는 chart-derived direct `kosmo_worker` `PG*` source만 사용한다. 별도 `DATABASE_*`/`FEDIFY_DATABASE_*` selector와 partial credential validation은 제거하며 registration이 없는 기본 비활성 lifecycle은 PROD-722 activation까지 유지한다.
