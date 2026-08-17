## Context

PROD-369/724와 PROD-715/722는 API·Worker role provisioning, object ACL과 workload별 표준 PG source를 단계적으로 준비했다. 그 결과 현재 chart에는 `kosmo_api`와 `kosmo_worker`가 함께 존재하고 API/Fedify consumer와 Web/Worker의 runtime source가 역사적으로 갈라져 있다. `kosmo_worker`라는 이름을 API·Web·Worker·Fedify 전체의 shared principal로 재사용하면 실제 ownership과 후속 제거 경계를 더 흐리므로, 이 change는 `kosmo_runtime`를 새로 provision하고 application workload만 그 principal로 전환한다.

기존 `kosmo_api`와 `kosmo_worker` role·ACL·default ACL·Vault/CNPG Secret provisioning은 각각 PROD-781과 PROD-782의 rollback window까지 유지한다. 따라서 새 runtime role과 ACL은 기존 자산을 대체하는 것이 아니라 additive하게 추가되며, legacy contract 제거와 production cutover는 이 change의 완료 조건이 아니다.

## Goals / Non-Goals

**Goals:**

- `kosmo_runtime LOGIN NOBYPASSRLS` DatabaseRole과 release-derived Vault/VSO basic-auth Secret을 provision한다.
- migration runner의 owner `kosmo` 경계에서 `kosmo_runtime`에 현재 `public` application table CRUD와 future table default ACL을 additive하게 부여한다.
- API, Web, Temporal Worker와 Fedify consumer application DB가 동일한 direct read-write Service와 `kosmo_runtime` Secret의 표준 PG\* source를 사용하도록 전환한다.
- runtime Secret rotation이 네 application workload를 재시작하도록 연결하고 migration/queue consumer는 제외한다.
- 기존 API/Worker role provisioning, migration owner, queue, Pooler와 application behavior를 보존한다.

**Non-Goals:**

- `kosmo_api` 또는 `kosmo_worker` role·ACL·default ACL·Secret provisioning의 revoke/drop/removal. 각각 PROD-781/PROD-782가 소유한다.
- owner `kosmo` credential retirement 또는 schema owner `NOLOGIN` (PROD-712 소유).
- GraphQL resolver/schema, application visibility/owner policy, RLS policy/actor helper, operation session/context DB.
- Worker/Fedify/Temporal registration, retry, delivery, queue transport 또는 Pooler resource.
- production preflight, Secret sync/apply, credential cutover, live query와 post-apply 검증.
- dedicated file-per-migration behavior test. Existing migration smoke/replay와 disposable evidence를 재사용한다.

## Implementation Guidance

### Current Constraints

- `kosmo_runtime`는 기존 `kosmo_worker`의 이름 변경이 아니라 별도 PostgreSQL role과 credential이다. 두 legacy role은 chart와 Vault/VSO에 계속 선언되어야 하며, `kosmo_worker`의 기존 `BYPASSRLS` attribute도 PROD-782까지 보존한다.
- application table은 `public`에 있고 owner는 `kosmo`다. migration runner는 `kosmo_migration`으로 연결한 뒤 `SET ROLE kosmo`를 수행하므로 default privilege owner를 명시한다.
- migration은 application role을 생성하거나 attribute를 바꾸지 않는다. CNPG `DatabaseRole` reconcile가 `LOGIN`, `NOBYPASSRLS`, non-owner attributes와 password Secret을 소유한다.
- `public` 밖의 `drizzle` migration history와 현재 application sequence는 ACL migration 대상이 아니다. future sequence/identity를 도입하는 별도 migration이 필요 권한을 함께 선언한다.
- Fedify domain application DB와 `FEDIFY_QUEUE_DATABASE_URL`/password는 별도 connection이다. queue는 `kosmo_fedify_queue` role/database를 계속 사용한다.

### Recommended Approach

1. chart helper가 release-derived runtime Secret/DatabaseRole resource name을 만든다. VaultStaticSecret은 `kubernetes/kosmo/<env>/runtime-database` static KV path와 basic-auth destination을 사용하며, `kosmo_runtime` username/password만 sync한다. API/Worker legacy Secret resource는 제거하지 않는다.
2. `kosmo_runtime` DatabaseRole은 `LOGIN`, `NOBYPASSRLS`, `superuser=false`, `createdb=false`, `createrole=false`, `replication=false`, `inRoles=[]`, `databaseRoleReclaimPolicy=retain`으로 선언한다.
3. 하나의 additive forward migration에서 owner `kosmo` 경계로 다음을 수행한다.
   - `GRANT USAGE ON SCHEMA public TO kosmo_runtime`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kosmo_runtime`
   - `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kosmo_runtime`
     기존 `kosmo_api`·`kosmo_worker` ACL/default ACL을 revoke하거나 재작성하지 않는다.
4. API/Web/Worker/Fedify application workload의 process-wide `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`를 runtime Secret source로 바꾼다. `PGUSER=kosmo_runtime`을 사용하고 `DATABASE_URL`, `DATABASE_PASSWORD`, owner/API/Worker selector fallback은 추가하지 않는다.
5. runtime Secret 변경 restart target은 API Rollout, Web Rollout, Temporal Worker Deployment, Fedify consumer Deployment로 제한한다. application consumer 전환과 함께 legacy API/Worker Secret의 application restart target 연결은 제거하되 Secret provisioning 자체는 유지한다. migration Job과 Fedify MessageQueue 전용 consumer는 runtime Secret을 참조하지 않는다.
6. static render, disposable full replay/catalog와 representative CRUD/금지 작업으로 새 role·ACL·source·분리 경계를 검증한다. 실제 Secret value는 출력하지 않는다.

### Allowed Alternatives

동일한 `kosmo_runtime` identity, `NOBYPASSRLS`, release-derived Secret, `public` current-table CRUD와 `FOR ROLE kosmo` future-table default ACL을 보장하는 chart/helper와 migration 구성이 허용된다. 기존 role/Secret provisioning을 삭제하거나 role 이름을 `kosmo_worker`에서 in-place rename하는 대안, `GRANT ALL PRIVILEGES`, role별 table allowlist, production 실행은 허용하지 않는다.

### Known Traps

- `kosmo_worker`를 새 shared principal로 계속 사용하면 이번 naming/ownership 결정을 우회한다. 새 app consumer는 반드시 `kosmo_runtime`을 사용하고 `kosmo_worker` 자산은 보존만 한다.
- migration이 `CREATE ROLE`/`ALTER ROLE`을 포함하면 CNPG provisioning과 충돌한다. disposable fixture는 migration 전에 test-only bootstrap으로 준비한다.
- DatabaseRole reconcile을 기다리는 polling을 immutable migration이나 migration Job에 넣으면 이후 replay/deploy에도 영구 운영 경계가 남는다. migration은 role 부재 시 즉시 실패하고 wave 2 workload 전환을 차단한다.
- `ALTER DEFAULT PRIVILEGES`에 `FOR ROLE kosmo`를 생략하면 future table ACL이 migration login 기준으로 적용될 수 있다.
- `GRANT ALL PRIVILEGES`, sequence grant, `drizzle` history grant는 승인 범위를 넓힌다.
- runtime Secret rotation target에 migration/queue를 포함하면 credential ownership을 침범한다.
- CI green, Helm render, dev rollout과 migration replay는 production apply/cutover나 legacy role 제거 증거가 아니다.
- runtime role의 `NOBYPASSRLS`와 object ACL은 별개다. 둘 다 catalog와 representative DML로 검증한다.

## Risks / Trade-offs

- [새 role과 두 legacy role의 Secret/ACL이 일시적으로 공존함] → 역할별 lifecycle owner와 후속 이슈를 명시하고, 이 change에서는 additive 전환만 수행한다.
- [workload 전환과 migration 적용 순서가 어긋남] → role/Secret readiness, forward migration, rendered consumer source를 별도 gate로 검증한다.
- [공용 runtime role의 table CRUD가 세밀하지 않음] → 승인된 current-table/default-ACL 범위만 부여하고 DDL·ownership·grant option·비CRUD 권한을 금지한다.
- [Secret naming/path drift] → release-derived helper와 runtime SecretRef를 네 application workload에서 동일하게 비교한다.

## Migration Plan

1. 최신 `origin/main`과 PROD-780 authority에서 legacy role 보존·후속 ownership·production 금지를 다시 확인한다.
2. 비운영 chart에서 `kosmo_runtime` DatabaseRole과 runtime Vault/VSO Secret을 추가하고 `kosmo_api`·`kosmo_worker` resources가 계속 렌더되는지 확인한다.
3. disposable role fixture를 준비한 뒤 full migration replay를 실행하고 `kosmo_runtime` current-table CRUD/default ACL, owner와 금지 권한을 검사한다.
4. exact non-production revision에서 API/Web/Worker/Fedify application workload의 `current_user=kosmo_runtime`, standard PG\* source와 runtime Secret rotation target을 확인한다. queue/migration source와 Pooler는 별도로 확인한다.
5. implementation PR은 code/CI와 non-production evidence만 보고한다. production Secret sync/apply/cutover/live 및 `kosmo_api`/`kosmo_worker` contract removal은 각각 별도 승인·후속 이슈로 남긴다.

Rollback은 application chart/workload consumer 변경을 release 단위로 되돌릴 수 있게 유지하고, legacy role/Secret provisioning을 rollback 자산으로 보존한다. additive migration을 기존 파일 수정으로 되돌리지 않으며, 실제 production rollback/cutover 절차는 별도 승인된 운영 문서를 따른다.

## Open Questions

없음. PROD-780 Issue Gate가 `kosmo_runtime` 신규 provision, additive current-table/default-ACL migration, 네 application consumer 전환과 legacy role 후속 ownership을 확정했다.
