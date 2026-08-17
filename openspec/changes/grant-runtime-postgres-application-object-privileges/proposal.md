> **Reconciliation (2026-08-17, PROD-780):** 이 change는 PROD-724에서 추가한
> `kosmo_api`·`kosmo_worker`의 **legacy** application object ACL을 기록하고 검증하는 문서다.
> 현재 application workload principal은 PROD-780의 `kosmo_runtime LOGIN NOBYPASSRLS`이며,
> 이 change의 두 legacy role은 API의 PROD-781과 Worker의 PROD-782가 각각 후속 제거할 때까지
> rollback 자산으로 보존한다. 아래의 RLS와 기존 cutover 언급은 PROD-724 당시의 historical/superseded
> context이며 현재 workload 또는 GraphQL 권한의 권위가 아니다.

## Why

PROD-724는 비소유 legacy 역할인 `kosmo_api`와 `kosmo_worker`가 application schema와 table을
사용하도록 owner workload와 병행 가능한 공통 object ACL을 추가했다. 현재 workload principal은
PROD-780에서 `kosmo_runtime`로 정렬되었으므로, 이 change는 새 principal을 정의하거나 GraphQL
가시성 정책을 결정하지 않고 legacy ACL의 보존·검증 범위와 후속 제거 경계를 명확히 한다.

## What Changes

- legacy `kosmo_api`와 `kosmo_worker`에 `kosmo` database의 `public` schema `USAGE`를 부여한다.
- 두 legacy role에 현재 `public` application table 전체의 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 부여한다.
- owner `kosmo`가 이후 `public`에 만드는 table에도 두 legacy role의 같은 DML ACL이 적용되도록 default privileges를 선언한다.
- application object owner는 `kosmo`로 유지하고 legacy role에는 DDL, ownership, grant option, `TRUNCATE`, `REFERENCES`, `TRIGGER`를 부여하지 않는다.
- 현재 application table은 UUID 기본값을 사용하므로 sequence ACL은 추가하지 않는다. sequence 또는 identity를 도입하는 후속 migration이 필요한 권한을 함께 소유한다.
- RLS policy, actor helper ACL, 현재 `kosmo_runtime` credential provisioning·선택·cutover, legacy role cleanup, queue database, migration history와 production 작업은 이 변경에서 제외한다.

## Authority / Provenance

- Canonical: `docs/operations/production-migrations.md`, `openspec/specs/production-migration-gate/spec.md`, `openspec/specs/runtime-postgres-scram-credential-provisioning/spec.md`
- Linear Contract: PROD-724
- Linear Implementations: PROD-724

## Capabilities

### New Capabilities

- `runtime-postgres-application-object-privileges`: legacy principals `kosmo_api`와 `kosmo_worker`가 owner `kosmo`의 application table에 공통 CRUD DML ACL을 갖고 후속 cleanup 전까지 이를 보존하는 계약

### Modified Capabilities

없음.

## Impact

- Drizzle forward migration과 snapshot
- PostgreSQL `public` schema, 현재 application table ACL, owner `kosmo`의 future table default ACL
- local/disposable full replay 및 legacy role/catalog/DML 검증
- 후속 PROD-781 API legacy cleanup과 PROD-782 Worker legacy cleanup이 각각 소비하는 historical ACL 계약

기존 CloudNativePG PgBouncer, DatabaseRole/Vault Secret, workload selector, migration identity, `kosmo_fedify_queue` database와 production runtime에는 직접 변경이 없다.
