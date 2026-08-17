## Why

ADR 0024와 PROD-776/779로 GraphQL RLS와 operation 전용 DB session을 제거했지만, application runtime은 여전히 `kosmo_api`와 `kosmo_worker`로 분리된 credential·ACL·Secret·Helm 경계를 보유한다. API, Web, Worker와 Fedify consumer가 기존 `kosmo_worker` 기반의 하나의 non-owner runtime principal을 공유하도록 정렬해 불필요한 역할 분기와 owner credential 소비를 제거한다.

## What Changes

- retained `kosmo_worker`를 `LOGIN NOBYPASSRLS` shared application runtime role로 확정한다.
- API, Web, Temporal Worker와 Fedify consumer application DB의 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source를 같은 `kosmo_worker` principal로 정렬한다.
- **BREAKING** application workload에서 owner `kosmo`와 `kosmo_api` application credential consumer·SecretRef 및 API 전용 selector를 제거하고, shared `kosmo_worker` credential consumer로 전환한다. 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 rollback window까지 유지하며 PROD-781에서 제거한다.
- application runtime이 schema/table owner가 되지 않는 경계를 유지한다.
- migration owner와 Fedify MessageQueue 전용 database/role/credential, 기존 Pooler resource와 표준 PG\* 계약은 유지한다.
- Worker/Fedify/Temporal 기능과 GraphQL/application visibility·owner policy, hidden/deleted Post owner cleanup, `deletePost`의 Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup 및 viewer-independent Reaction count는 변경하지 않는다.
- 기존 immutable migration과 contract SQL은 선반영하지 않는다. `kosmo_api` ACL/default ACL/role/Secret provisioning 제거는 PROD-781 contract scope이며, production Secret sync/apply, credential cutover와 live 검증은 별도 승인 없이는 수행하지 않는다. `PROD-712`는 runtime owner credential 폐기와 schema owner `kosmo`의 `NOLOGIN`만 소유한다.

## Authority / Provenance

- Canonical:
  - `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
  - `docs/architecture/core-services.md`
  - `docs/operations/postgres-session-pool.md` (현재 target architecture와 production 실행 경계를 설명하는 historical 운영 문서)
- Linear Contract: `PROD-780`
- Linear Implementations: `PROD-780` (implementation, integration verification, active spec sync, archive)
- 선행/관련: 완료 `PROD-776`, `PROD-779`; 관련 `PROD-715`, `PROD-716`; 후속 `PROD-781`(legacy role·ACL·Secret contract), `PROD-712`(owner credential/NOLOGIN)
- Historical boundary: 취소된 `PROD-707`, `PROD-767`과 완료된 `PROD-713`의 GraphQL RLS 목표는 `PROD-776`/ADR 0024 이후 재활성화하지 않는다.

## Capabilities

### New Capabilities

- `application-runtime-postgres-role`: API, Web, Worker와 Fedify consumer가 shared `kosmo_worker` non-owner principal을 사용하고 분리된 `kosmo_api` runtime role 소비를 제거하는 role·credential·Helm 계약.

### Modified Capabilities

- `runtime-postgres-scram-credential-provisioning`: 기존 API/Worker 두 runtime role·Secret provisioning을 유지하면서 `kosmo_worker`를 `NOBYPASSRLS`로 축소하고 shared Worker Secret rotation target을 API/Web/Worker/Fedify 4 consumer로 확장한다.
- `workload-postgres-credential-selection`: API/Fedify consumer의 owner process source와 Web/Worker의 Worker source를 하나의 shared application runtime `PG*` source로 정렬한다.
- `temporal-worker-runtime-foundation`: Worker의 역할별 DB 입력 seam을 shared `kosmo_worker` 표준 PG env 계약으로 정렬하되 Worker registration·lifecycle은 유지한다.

## Impact

Helm workload env·SecretRef와 application runtime credential consumer, shared Worker Secret rotation restart 및 비운영 role/catalog/render 검증이 영향을 받는다. 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning과 immutable migration history는 rollback-compatible 상태로 유지하고 PROD-781이 후속 제거한다. GraphQL schema와 resolver/application policy, core service 경계, Fedify queue transport, migration owner와 Pooler resource는 영향 범위에서 제외한다. `PROD-780`이 API/Web/Worker/Fedify PG\* transition, workload consumer removal, 전체 통합검증과 적용되는 active runtime spec sync/archive를 소유하며, object ACL/legacy role contract sync는 PROD-781이 소유한다. 기존 active `cut-over-worker-postgres-credentials`와 `grant-runtime-postgres-application-object-privileges`는 Gate에서 직접 수정하지 않는다.
