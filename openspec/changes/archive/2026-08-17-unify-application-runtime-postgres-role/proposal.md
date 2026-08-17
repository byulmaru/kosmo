## Why

현재 application workload가 `kosmo_api`와 `kosmo_worker`라는 역사적 역할 이름과 credential 경계를 함께 소비하고 있어, API·Web·Worker·Fedify consumer의 실제 책임을 표현하는 하나의 runtime principal이 없다. `kosmo_worker`를 다른 workload까지 재명명해 재사용하는 대신 목적에 맞는 `kosmo_runtime`를 additive하게 도입하고, 기존 역할과 rollback 자산을 후속 contract까지 보존하면서 application runtime을 전환한다.

## What Changes

- `kosmo_runtime` `LOGIN NOBYPASSRLS` CloudNativePG `DatabaseRole`과 release-derived Vault/VSO basic-auth Secret을 새로 provision한다.
- `kosmo_runtime`에 `public` schema `USAGE`, migration 적용 시점의 현재 application table `SELECT`·`INSERT`·`UPDATE`·`DELETE`, owner `kosmo`의 future table에 대한 같은 default ACL을 부여하는 additive forward migration을 추가한다.
- API, Web, Temporal Worker와 Fedify consumer의 application DB 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source와 Secret rotation restart target을 `kosmo_runtime`로 전환한다.
- 기존 `kosmo_worker` role·ACL·default ACL·Secret provisioning은 PROD-782의 후속 제거 전까지, 기존 `kosmo_api` role·ACL·default ACL·Secret provisioning은 PROD-781의 후속 제거 전까지 유지한다. 이 change는 두 legacy contract의 revoke/drop/removal을 선반영하지 않는다.
- migration owner, Fedify MessageQueue 전용 database/role/credential, Pooler resource와 application policy 및 Worker/Fedify/Temporal behavior를 보존한다.
- GraphQL/application visibility·owner policy, hidden/deleted Post owner cleanup, `deletePost`의 Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup과 viewer-independent Reaction count를 변경하지 않는다.
- production Secret sync/apply, credential cutover, preflight와 live 검증은 별도 승인 없이는 수행하지 않는다.

## Authority / Provenance

- Canonical:
  - `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
  - `docs/architecture/core-services.md`
  - `docs/operations/postgres-session-pool.md` (historical 운영 문서; target architecture와 production 실행 금지 경계만 참조)
  - `docs/operations/production-migrations.md`
- Linear Contract: `PROD-780`
- Linear Implementations: `PROD-780` (runtime role·migration·workload 전환·통합 검증·적용되는 spec sync/archive)
- 후속 contract: `PROD-781` (`kosmo_api` legacy contract), `PROD-782` (`kosmo_worker` legacy contract), `PROD-712` (owner `kosmo` credential/`NOLOGIN`)
- Historical boundary: 취소된 `PROD-707`, `PROD-767`과 완료된 `PROD-713`의 GraphQL RLS 목표는 ADR 0024 이후 재활성화하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `application-runtime-postgres-role`: 기존 shared runtime role 계약을 `kosmo_runtime` 신규 role·Secret·additive ACL과 application workload 전환으로 수정한다.
- `runtime-postgres-scram-credential-provisioning`: 기존 `kosmo_api`·`kosmo_worker` provisioning을 보존하면서 `kosmo_runtime` role·Secret과 runtime rotation target을 추가한다.
- `workload-postgres-credential-selection`: API/Web/Worker/Fedify application consumer를 `kosmo_runtime` 표준 PG source로 정렬한다.
- `temporal-worker-runtime-foundation`: Worker의 process-wide application DB source를 `kosmo_runtime`로 정렬하고 registration·lifecycle은 유지한다.

## Impact

Helm `DatabaseRole`/VaultStaticSecret/VSO destination, API/Web/Worker/Fedify application env·SecretRef, runtime Secret rotation targets, additive Drizzle migration과 disposable role/catalog 검증이 영향을 받는다. GraphQL schema/resolver, application policy, queue transport, migration owner, Pooler와 기존 `kosmo_api`·`kosmo_worker` role/ACL/Secret provisioning은 보존한다. 구현·검증·OpenSpec Gate만 다루며 production sync/apply/cutover/live는 범위 밖이다.
