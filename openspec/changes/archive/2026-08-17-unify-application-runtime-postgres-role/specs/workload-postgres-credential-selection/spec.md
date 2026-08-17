## MODIFIED Requirements

### Requirement: API·Web·Worker·Fedify application DB source는 `kosmo_runtime`를 공유한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. API, Web, Temporal Worker와 Fedify consumer application DB는 하나의 새 `kosmo_runtime` PostgreSQL source를 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`로 사용해야 한다(MUST). `kosmo_api`, `kosmo_worker` 또는 owner `kosmo` application credential source를 workload에 소비시키거나 서로 다른 application runtime source를 만들어서는 안 된다(MUST NOT). Legacy role·Secret provisioning의 존속은 별도 lifecycle contract다.

#### Scenario: shared runtime source 선택

- **WHEN** API, Web, Worker와 Fedify consumer manifest를 유효한 immutable release image로 렌더한다
- **THEN** 각 workload의 process-wide application DB env는 같은 direct read-write Service, `PGPORT=5432`, `PGUSER=kosmo_runtime`, `PGDATABASE=kosmo`와 같은 release runtime Secret `password` ref를 사용해야 한다
- **AND** process-wide application DB에는 `DATABASE_URL`, `DATABASE_PASSWORD`, API/Worker/Fedify custom selector 또는 owner fallback이 없어야 한다

#### Scenario: legacy provisioning과 consumer를 구분함

- **WHEN** 기존 API/Worker DatabaseRole, Secret, ACL/default ACL 설정이 values와 rendered manifest에 남아 있는지 검사한다
- **THEN** 해당 provisioning은 후속 rollback window까지 보존되어야 하지만 application workload의 runtime source로 해석되거나 투영되지 않아야 한다
- **AND** migration owner와 Fedify MessageQueue 전용 source만 각자의 별도 경계를 유지해야 한다

### Requirement: Fedify consumer는 runtime application source와 queue source를 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. Fedify consumer가 domain application DB를 사용하는 경우 API·Web·Worker와 같은 `kosmo_runtime` process-wide PG\* source를 사용해야 한다(MUST). Fedify MessageQueue transport의 전용 URL/password와 `kosmo_fedify_queue` database/role은 application source와 분리해야 한다(MUST).

#### Scenario: Fedify consumer와 queue source 분리

- **WHEN** Fedify consumer와 MessageQueue manifest를 함께 렌더한다
- **THEN** domain application DB consumer는 runtime `kosmo_runtime` PG\* source를 사용해야 한다
- **AND** `FEDIFY_QUEUE_DATABASE_URL`/password는 전용 `kosmo_fedify_queue` database/role source를 유지해야 하며 application PG source로 fallback해서는 안 된다

#### Scenario: legacy Fedify application selector 비소비

- **WHEN** historical `postgres.credentials.fedify`, `FEDIFY_DATABASE_*` 또는 owner/API/Worker application source를 설정한다
- **THEN** runtime은 이를 shared application source나 queue source로 재해석하지 않아야 한다
- **AND** 명시된 standard runtime PG\* source와 전용 queue source 외의 implicit fallback을 만들지 않아야 한다

### Requirement: selector는 runtime source를 대체하지 않는다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. application runtime의 API/Fedify/Worker URL·password selector trio와 partial/complete source validation은 process-wide source로 사용해서는 안 된다(MUST NOT). 모든 application workload는 chart-derived `kosmo_runtime` PG\* source를 사용해야 한다(MUST).

#### Scenario: legacy selector 설정 비소비

- **WHEN** API, Worker 또는 Fedify selector의 URL·Secret name·key 중 일부 또는 전체를 설정한다
- **THEN** Helm/runtime은 해당 selector를 application DB source로 해석하거나 owner/legacy custom 값을 혼합하지 않아야 한다
- **AND** 지원되는 application source는 runtime PG\* source여야 한다

#### Scenario: 표준 source의 단일 경계

- **WHEN** selector 없이 application manifest를 렌더한다
- **THEN** API, Web, Worker와 Fedify consumer가 같은 release-derived runtime Secret의 `PGPASSWORD` ref를 가져야 한다
- **AND** queue와 migration credential은 이 source 선택에 영향을 받지 않아야 한다

## REMOVED Requirements

### Requirement: 기존 runtime 연결과 rendered manifest 보존

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`

**Reason:** owner `-app` Secret과 `DATABASE_URL`/`DATABASE_PASSWORD` byte-identity baseline은 `kosmo_runtime` 표준 PG\* source 전환 뒤 current runtime 계약이 아니다.

**Migration:** migration owner 경계만 유지하고 API/Web/Worker/Fedify application workload는 runtime source를 사용한다. Legacy API/Worker role·Secret provisioning은 후속 rollback contract까지 보존한다.

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`

**Reason:** 별도 `FEDIFY_DATABASE_*` application selector는 제거됐으며 Fedify consumer의 domain DB는 다른 application workload와 같은 runtime PG\* source를 사용한다.

**Migration:** Fedify MessageQueue의 `FEDIFY_QUEUE_DATABASE_URL`/password와 `kosmo_fedify_queue` database/role만 별도 secondary source로 유지한다.
