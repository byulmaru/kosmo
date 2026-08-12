## Why

`kosmo_api`와 `kosmo_worker`는 비소유 LOGIN 역할로 provision되었지만 application schema와 table을 사용할 object ACL이 아직 없다. RLS를 GraphQL Query/Mutation에만 적용하면서 두 runtime 역할이 같은 application 객체 DML 기반을 사용하려면, 기존 owner workload와 병행 가능한 공통 권한 migration이 필요하다.

## What Changes

- `kosmo_api`와 `kosmo_worker`에 `kosmo` database의 `public` schema `USAGE`를 부여한다.
- 두 역할에 현재 `public` application table 전체의 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 부여한다.
- owner `kosmo`가 이후 `public`에 만드는 table에도 같은 DML ACL이 적용되도록 default privileges를 선언한다.
- application object owner는 `kosmo`로 유지하고 runtime 역할에는 DDL, ownership, grant option, `TRUNCATE`, `REFERENCES`, `TRIGGER`를 부여하지 않는다.
- 현재 application table은 UUID 기본값을 사용하므로 sequence ACL은 추가하지 않는다. sequence 또는 identity를 도입하는 후속 migration이 필요한 권한을 함께 소유한다.
- RLS policy, actor helper ACL, credential provisioning·선택·cutover, queue database, migration history와 production 작업은 이 변경에서 제외한다.

## Authority / Provenance

- Canonical: `docs/operations/production-migrations.md`, `openspec/specs/production-migration-gate/spec.md`, `openspec/specs/runtime-postgres-scram-credential-provisioning/spec.md`
- Linear Contract: PROD-724
- Linear Implementations: PROD-724

## Capabilities

### New Capabilities

- `runtime-postgres-application-object-privileges`: GraphQL principal `kosmo_api`와 비GraphQL trusted workload principal `kosmo_worker`가 owner `kosmo`의 application table에 공통 CRUD DML ACL을 갖는 계약

### Modified Capabilities

없음.

## Impact

- Drizzle forward migration과 snapshot
- PostgreSQL `public` schema, 현재 application table ACL, owner `kosmo`의 future table default ACL
- local/disposable full replay 및 비운영 role/catalog/DML 검증
- 후속 PROD-713 GraphQL RLS policy와 PROD-715/716 principal transition의 공통 선행 조건

기존 CloudNativePG PgBouncer, DatabaseRole/Vault Secret, workload selector, migration identity, `kosmo_fedify_queue` database와 production runtime에는 직접 변경이 없다.
