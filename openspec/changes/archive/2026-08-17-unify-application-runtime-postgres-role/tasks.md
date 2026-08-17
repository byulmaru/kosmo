## 1. PROD-780 shared application runtime source와 consumer 정렬

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

API, Web, Temporal Worker와 Fedify consumer application DB가 같은 release-derived `kosmo_worker` credential과 표준 PG\* source를 사용하고, API 전용 runtime consumer가 제거된다. `PROD-780`이 이 source/consumer 구현과 전체 통합검증, active spec sync/archive를 소유한다.

**Guardrails**

- `kosmo_worker`는 `LOGIN NOBYPASSRLS` non-owner runtime role로 유지한다.
- `DATABASE_URL`, `DATABASE_PASSWORD`, URL/password selector, owner `kosmo` 및 `kosmo_api` application workload SecretRef/consumer를 runtime에 남기지 않는다. 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 PROD-781까지 유지한다.
- migration owner, Fedify MessageQueue 전용 database/role/credential과 기존 Pooler resource를 변경하지 않는다.
- GraphQL operation session, actor GUC, `ctx.db`, `OPERATION_DATABASE_URL`, application policy와 Worker/Fedify/Temporal 기능을 다시 도입하거나 변경하지 않는다.
- `worker-database` Secret rotation restart target에는 API Rollout, Web Rollout, Temporal Worker Deployment와 Fedify consumer Deployment를 포함하고 migration Job·Fedify MessageQueue 전용 consumer는 포함하지 않는다.

**Verification**

- dev/prod static Helm render에서 네 application workload의 PG\* source와 SecretRef를 비교하고 owner/API workload consumer·SecretRef 부재와 기존 API role/Secret provisioning 보존을 확인한다.
- `worker-database` Secret rotation render에서 API Rollout, Web Rollout, Temporal Worker Deployment와 Fedify consumer Deployment가 restart target으로 연결되는지 확인한다.
- migration Job과 Fedify MessageQueue manifest가 application source와 분리되고 Pooler resource가 보존되는지 확인한다.

- [x] 1.1 API, Web, Worker와 Fedify consumer의 application DB source를 retained `kosmo_worker` 표준 PG\* 계약으로 정렬한다.
- [x] 1.2 API/Web/Worker/Fedify workload에서 owner/API role SecretRef·consumer와 API 전용 application credential selector를 제거하고, `kosmo_api` DatabaseRole/ACL/Secret provisioning은 PROD-781까지 유지한다.
- [x] 1.3 `worker-database` Secret rotation restart target에 API Rollout·Web Rollout·Temporal Worker Deployment·Fedify consumer Deployment를 포함하고 migration/queue consumer는 제외한다.
- [x] 1.4 migration owner·queue source·Pooler와 GraphQL/application/Worker/Fedify/Temporal 보존 경계를 diff로 확인한다.

## 2. PROD-780 existing ACL·role provisioning과 rollback 경계 보존

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `openspec/changes/grant-runtime-postgres-application-object-privileges/`
- `PROD-781`
- `PROD-780`

**Deliverable**

기존 `kosmo_api`/`kosmo_worker` object ACL, default ACL, role·Secret provisioning과 immutable migration history가 rollback window까지 보존되고, shared `kosmo_worker`의 `NOBYPASSRLS`와 non-owner runtime 경계가 비운영에서 확인된다.

**Guardrails**

- 이미 적용된 migration의 directory/name/hash/SQL을 수정·이동·재생성하지 않으며 contract SQL을 선반영하지 않는다.
- `kosmo_api`/`kosmo_worker` existing ACL·default ACL·role·Secret provisioning을 revoke/drop/remove하지 않는다. 해당 contract removal은 production transition·drain·rollback window 뒤 PROD-781이 소유한다.
- `kosmo_worker`는 schema/table owner, migration owner 또는 queue owner가 아니며 grant option·DDL·ownership 권한을 얻지 않는다.
- workload consumer 전환을 이유로 RLS policy, actor helper, GraphQL/application policy를 변경하지 않는다.

**Verification**

- disposable PostgreSQL에서 기존 migration replay와 fixture role을 사용해 `current_user`, `rolcanlogin`, `rolbypassrls`, owner, existing ACL, default ACL과 금지 권한을 검사한다.
- representative application CRUD와 금지된 DDL/ownership/regrant 거부를 확인하고 migration history hash 및 role/Secret render 보존을 비교한다.

- [x] 2.1 retained `kosmo_worker`의 `LOGIN NOBYPASSRLS`와 non-owner lifecycle, 기존 two-role ACL/provisioning 보존을 role/catalog contract에 반영한다.
- [x] 2.2 ACL revoke/drop, default ACL 변경, role/Secret provisioning 제거 또는 contract SQL이 diff에 없는지 확인하고 PROD-781 dependency를 기록한다.
- [x] 2.3 disposable existing-migration replay와 role-level catalog/CRUD/금지권한/rollback-compatible provisioning 검증을 통과시킨다.

## 3. PROD-780 workload 회귀와 비운영 완료 증거

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

shared runtime role 전환이 기존 GraphQL/application policy, Post owner cleanup·`deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload·Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`·Notification cleanup·Reaction count와 Worker/Fedify/Temporal 동작을 바꾸지 않음을 증명하는 구현·비운영 검증 evidence가 준비된다.

**Guardrails**

- GraphQL schema·payload·후보·정렬·pagination과 application visibility/owner policy를 재설계하지 않는다.
- hidden/deleted Post owner cleanup, `deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup과 viewer-independent Reaction count를 제거하거나 viewer-dependent하게 만들지 않는다.
- production preflight/sync/apply/cutover/live와 Secret/role mutation을 실행하거나 완료 evidence로 주장하지 않는다.

**Verification**

- 관련 workspace lint/format/typecheck와 core/API/Fedify/Worker 회귀를 실행한다.
- exact non-production revision에서 각 application workload의 principal과 representative SQL, migration/queue 분리와 workload readiness를 확인한다.
- 결과를 code/CI, non-production live와 production 미실행 범위로 분리해 PROD-780에 기록할 초안을 준비한다.

- [x] 3.1 shared PG\* source와 role 변경 이후 기존 application/GraphQL/core/Worker/Fedify regression을 실행한다.
- [x] 3.2 non-production workload principal, ACL, migration/queue 분리와 대표 DML evidence를 수집한다.
- [x] 3.3 `PROD-780`이 implementation PR Ready, 전체 통합검증, active spec sync와 archive를 모두 소유한다고 기록하고, 전체 구현·검증 전에는 active change를 archive하지 않는다.

Evidence (2026-08-17): exact revision `301b7278`의 dev/prod static Helm render에서 API/Web/Worker/Fedify application consumer가 같은 `kosmo_worker` Worker Secret source를 사용하고 migration owner·Fedify MessageQueue source·Pooler가 분리된 것을 확인했다. Isolated disposable PostgreSQL에서 `current_user`, `rolbypassrls=false`, existing two-role ACL/default ACL, representative CRUD와 금지된 DDL·ownership·regrant 거부를 검증했다. PR #620은 Ready이며 production preflight/sync/apply/cutover/live는 수행하지 않았다.

## 4. PROD-780 active contract reconciliation

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

구현 결과와 기존 active `cut-over-worker-postgres-credentials`의 차이, 적용되는 runtime delta spec sync와 archive 책임이 사람이 검토 가능한 형태로 정리된다. ACL/role/Secret contract와 `grant-runtime-postgres-application-object-privileges` sync/archive는 PROD-781이 소유하고, runtime 구현·통합검증·적용되는 active spec sync·archive의 owner는 PROD-780이다.

**Guardrails**

- OpenSpec Gate에서 기존 active spec/change를 직접 rewrite하거나 구현·merge·production 승인의 증거로 삼지 않는다. 이 change에는 runtime workload consumer removal과 Secret restart artifact만 포함하고 ACL/role/Secret contract migration은 포함하지 않는다.
- 실제 구현 결과와 최신 canonical/Linear를 독립 대조한 뒤에만 delta spec sync와 archive를 수행한다.
- `PROD-781`은 production transition·drain·rollback window 뒤 `kosmo_api` ACL/default ACL/role/Secret contract와 관련 spec sync/archive를 소유한다. `PROD-712`는 runtime owner credential 폐기 및 schema owner `kosmo` `NOLOGIN`만 소유하며, PROD-780은 runtime transition·전체 통합검증·적용되는 active runtime spec sync/archive를 소유한다.

**Verification**

- `openspec validate unify-application-runtime-postgres-role --strict`와 전체 strict validation을 통과시킨다.
- sync/archive 후 전체 active spec과 canonical/Linear authority의 정합성을 다시 확인한다.

- [x] 4.1 active change conflict/supersede boundary와 PROD-780/PROD-781/PROD-712의 구현·contract·sync/archive ownership을 evidence에 정리한다.
- [x] 4.2 전체 구현·비운영 검증과 PR Ready 이후에만 delta spec sync/archive를 수행하고 post-archive strict validation을 실행한다.

Evidence (2026-08-17): PR #620 Ready 이후 네 capability delta를 canonical specs에 sync하고 `2026-08-17-unify-application-runtime-postgres-role`로 archive했다. CLI가 첫 `MODIFIED` block을 누락한 `workload-postgres-credential-selection` API credential requirement는 archived delta와 직접 대조해 동일하게 반영했으며, post-archive 전체 strict validation 98/98과 formatting/diff check를 통과했다.
