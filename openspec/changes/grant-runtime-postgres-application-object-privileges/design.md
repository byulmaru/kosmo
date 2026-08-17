> **Reconciliation (2026-08-17, PROD-780):** 이 설계는 PROD-724가 이미 추가한
> `kosmo_api`·`kosmo_worker` **legacy** ACL의 범위와 검증 경계를 보존한다. 현재 application
> workload principal은 PROD-780의 `kosmo_runtime LOGIN NOBYPASSRLS`이며, API legacy ACL cleanup은
> PROD-781, Worker legacy ACL cleanup은 PROD-782가 소유한다. 아래의 GraphQL RLS 및 옛 principal
> cutover 언급은 historical/superseded context로만 읽어야 하며 현재 정책의 권위가 아니다.

## Context

PROD-369은 `kosmo_api`와 `kosmo_worker`를 비소유 LOGIN 역할로 provision했고, PROD-724는 이
legacy role의 application object ACL을 additive하게 추가했다. 현재 migration runner는
`kosmo_migration`으로 연결한 뒤 `SET ROLE kosmo`를 수행하므로 schema object와 default privilege의
owner 기준은 `kosmo`다. PROD-780 이후 실제 application workload는 새 `kosmo_runtime` principal을
사용하며, 이 change는 그 principal의 migration·workload 전환을 소유하지 않는다.

PROD-724 당시에는 RLS를 GraphQL Query/Mutation의 `kosmo_api`에만 적용하고 비GraphQL trusted
workload의 `kosmo_worker`는 `BYPASSRLS`를 사용하는 것으로 기록했지만, 이 workload 분류는
PROD-780으로 superseded되었다. Historical contract에서 두 legacy role의 application table DML을
역할별로 세분화하지 않은 사실과 PostgreSQL ACL 검사가 별도로 필요하다는 사실은 계속 보존한다.

## Goals / Non-Goals

**Goals:**

- 기존 owner workload와 병행 가능한 additive forward migration으로 두 legacy role의 schema/table ACL을 보존·검증한다.
- 현재 application table 전체와 owner `kosmo`가 만드는 future table에 두 legacy role의 같은 CRUD DML 계약을 적용한다.
- owner, historical legacy role attributes, migration identity, PgBouncer와 credential 경계를 보존한다.
- local/disposable replay와 비운영 legacy ACL 검증만으로 이 change의 구현/OpenSpec 완료 경계를 판단할 수 있게 한다.

**Non-Goals:**

- Post/PostContent RLS와 actor policy 또는 helper ACL
- `kosmo_runtime` 역할·Secret provisioning, workload selector와 principal cutover(PROD-780)
- `kosmo_api` 및 `kosmo_worker` legacy ACL/role cleanup(PROD-781/PROD-782)
- `kosmo_fedify_queue` database/role과 queue adapter ACL
- `drizzle` migration history 접근
- owner NOLOGIN 전환
- production preflight, sync/apply, cutover와 post-apply live 검증

## Implementation Guidance

### Current Constraints

- application table은 `public`에 있고 owner는 `kosmo`다.
- 현재 application ID는 UUID 기본값을 사용하며 application sequence가 없다. migration history의 `SERIAL`은 `drizzle` schema 안에 있다.
- `BYPASSRLS`는 schema/table ACL을 대신하지 않는다.
- default privileges는 object를 만드는 owner와 schema에 종속되므로 session의 effective role과 `FOR ROLE kosmo`를 명확히 해야 한다.
- `kosmo_runtime`가 현재 workload 기본 principal이므로 legacy ACL 보존과 principal 전환을 같은 migration이나 검증 결과로 간주하면 안 된다.
- 현재 disposable database harness는 database만 다시 만들고 PROD-369의 legacy cluster role을 생성하지 않으므로, 역할 fixture 없이 GRANT migration을 replay하면 `role does not exist`로 실패한다.

### Recommended Approach

하나의 forward Drizzle migration에서 다음 순서로 선언하는 것이 기본 경로다.

1. `GRANT USAGE ON SCHEMA public TO kosmo_api, kosmo_worker`
2. `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kosmo_api, kosmo_worker`
3. `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kosmo_api, kosmo_worker`

이 historical migration은 기존 runner가 `SET ROLE kosmo`를 완료한 뒤 실행된다. schema-wide
current-table grant는 승인된 “legacy role별 최소 table matrix 없음” 계약을 직접 표현하고,
`public` 밖의 `drizzle` history를 자연스럽게 제외한다. 현재 `kosmo_runtime` ACL은 PROD-780이
별도로 소유한다.

검증 전 test-only bootstrap에서 `kosmo_api`와 `kosmo_worker`를 PROD-369과 동등한 비소유 legacy
role attribute로 준비한다. Application migration 자체에는 `CREATE ROLE`, `ALTER ROLE` 또는
credential을 넣지 않는다. 그 뒤 빈 disposable database의 full migration replay, catalog의
schema/table/default ACL과 owner assertion, 두 legacy role의 대표 CRUD DML, 금지 권한 거부를
분리해 수행한다. RLS policy와 무관하게 object ACL 자체를 검증할 수 있어야 한다.

### Allowed Alternatives

동일한 `public` application table 전체를 빠짐없이 포함하고 future table default ACL을 유지한다면, 현재 table 이름을 migration에 명시적으로 열거할 수 있다. 다만 역할별 allowlist나 서로 다른 DML 집합으로 축소하는 방식은 허용되지 않는다.

### Known Traps

- `GRANT ALL PRIVILEGES`는 승인되지 않은 `TRUNCATE`, `REFERENCES`, `TRIGGER`까지 포함하므로 사용하지 않는다.
- `ALTER DEFAULT PRIVILEGES`를 `FOR ROLE kosmo` 없이 migration login 역할 기준으로 적용하면 future table ACL이 누락될 수 있다.
- `ON ALL SEQUENCES`를 사용하면 application에 필요하지 않은 권한을 넓히거나 migration history 경계를 혼동할 수 있다.
- local replay를 통과시키기 위해 application migration에서 legacy role 또는 current `kosmo_runtime`를 생성하면 CNPG DatabaseRole/Vault provisioning과 ownership이 중복되므로 금지한다.
- catalog ACL 성공을 historical GraphQL RLS policy, `kosmo_runtime` workload principal cutover 또는 production 적용의 증거로 해석하지 않는다.
- rollback 목적으로 migration 파일을 수정하거나 삭제하지 않는다.

## Risks / Trade-offs

- [두 역할의 table-level 권한이 동일해 세밀한 최소권한이 아니다] → 사용자가 승인한 trust boundary를 명시하고 DDL·ownership·grant option·비CRUD table 권한은 계속 제한한다.
- [schema-wide grant가 migration 시점의 모든 `public` table을 포함한다] → `public`을 application schema로 유지하고 catalog 검증에서 대상과 owner를 전수 확인한다.
- [future sequence/identity 도입 시 INSERT가 실패할 수 있다] → 해당 객체를 도입하는 후속 migration이 필요한 sequence ACL을 함께 선언하도록 계약화한다.
- [legacy ACL forward revoke 뒤 downstream workload가 실패할 수 있다] → PROD-781/PROD-782의
  legacy cleanup은 각 consumer와 독립적으로 rollback할 수 있도록 조정한다.

## Migration Plan

1. PROD-369의 비운영 legacy role readiness를 선행 증거로 확인한다.
2. disposable cluster에 PROD-369-equivalent legacy test role을 준비한 뒤 forward migration과 snapshot을 추가하고 빈 database에서 전체 replay한다.
3. catalog로 current ACL, default ACL, owner와 금지 권한을 검증한다.
4. 비운영 환경에서 두 legacy role의 대표 CRUD DML과 금지 작업 거부를 검증한다.
5. PROD-781과 PROD-782가 각각 legacy API·Worker ACL cleanup의 선행 historical evidence로 소비한다.

문제가 발견되면 기존 migration을 되돌려 쓰지 않고 새 forward migration으로 이 변경이 추가한 schema/table/default ACL을 회수한다. Production 작업은 이 계획에 포함하지 않으며 별도 명시 승인과 운영 절차를 사용한다.

## Open Questions

없음.
