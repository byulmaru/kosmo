## 1. PROD-780 `kosmo_runtime` role·Secret provisioning

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

각 release가 `kosmo_runtime LOGIN NOBYPASSRLS` DatabaseRole과 release-derived Vault/VSO basic-auth Secret을 제공한다.

**Guardrails**

- `kosmo_runtime`는 schema/table/migration/queue owner가 아니며 `superuser`, `createdb`, `createrole`, `replication`, membership와 grant option을 갖지 않는다.
- 기존 `kosmo_api` role·Secret provisioning과 `kosmo_worker` role·`BYPASSRLS` attribute·Secret provisioning은 각각 PROD-781/PROD-782까지 유지한다.
- Secret value는 values, rendered manifest, OpenSpec 또는 log에 출력하지 않는다.

**Verification**

- dev/prod static Helm render에서 runtime DatabaseRole, Secret source/destination, role attributes와 legacy resource 보존을 확인한다.
- runtime Secret의 username/password transformation과 release-derived naming을 비민감한 metadata로 확인한다.

- [x] 1.1 `kosmo_runtime` DatabaseRole과 non-owner `LOGIN NOBYPASSRLS` attributes를 provision한다.
- [x] 1.2 release-derived runtime Vault/VSO Secret과 password SecretRef를 provision하고 legacy API/Worker Secret provisioning을 보존한다.
- [x] 1.3 role reclaim/lifecycle과 queue/migration resource 분리를 static render에서 검증한다.

## 2. PROD-780 additive current-table/default-ACL migration

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `PROD-724`
- `PROD-780`

**Deliverable**

새 runtime principal이 migration 적용 시점의 `public` application table을 CRUD하고 owner `kosmo`가 이후 만드는 application table에도 같은 CRUD default ACL을 받는다.

**Guardrails**

- migration은 기존 `kosmo_migration` → `SET ROLE kosmo` 경계에서 실행되며 role 생성/attribute 변경/credential 값을 포함하지 않는다.
- migration과 migration Job에 DatabaseRole readiness polling을 추가하지 않으며, role 부재 시 grant가 즉시 실패하도록 둔다.
- `kosmo_api`·`kosmo_worker` existing ACL/default ACL을 revoke/rewrite하지 않고 sequence·`drizzle` history 권한을 추가하지 않는다.
- `GRANT ALL PRIVILEGES`, object ownership, DDL, `TRUNCATE`, `REFERENCES`, `TRIGGER`, grant option은 부여하지 않는다.
- 기존 migration file/name/hash를 수정·삭제·재생성하지 않는다.

**Verification**

- disposable role fixture로 full migration replay를 실행한다.
- runtime current-table ACL, future-table default ACL, owner, representative CRUD와 금지 작업 거부를 catalog/SQL로 확인한다.

- [x] 2.1 additive forward migration으로 runtime schema USAGE와 current `public` table CRUD를 부여한다.
- [x] 2.2 `FOR ROLE kosmo IN SCHEMA public` future table default CRUD를 부여하고 sequence/history 범위를 제외한다.
- [x] 2.3 isolated full replay와 catalog/representative DML/negative permission 검증을 통과시킨다.

## 3. PROD-780 application workload source·rotation 전환

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

API, Web, Temporal Worker와 Fedify consumer의 process-wide application DB consumer가 동일한 `kosmo_runtime` standard PG\* source와 runtime Secret을 사용한다.

**Guardrails**

- `PGUSER=kosmo_runtime`과 동일한 direct read-write Service/DB/port/runtime password ref를 사용한다.
- owner `kosmo`, `kosmo_api`, `kosmo_worker` application credential consumer·SecretRef와 URL/password selector fallback을 남기지 않는다. role/Secret provisioning의 존속과 workload consumer를 혼동하지 않는다.
- runtime Secret restart target은 API Rollout, Web Rollout, Worker Deployment, Fedify consumer Deployment만 포함하고 migration Job·Fedify MessageQueue 전용 consumer는 제외한다.
- legacy API/Worker Secret provisioning은 유지하되 더 이상 이를 소비하지 않는 application workload의 restart target 연결은 제거한다.
- queue URL/password, migration source, Pooler resource와 Worker/Fedify/Temporal registration·lifecycle은 유지한다.

**Verification**

- dev/prod static render에서 네 application workload의 PG\* source/SecretRef와 runtime Secret restart targets를 비교한다.
- migration/queue manifest 및 Pooler resource가 별도 source로 보존되는지 확인한다.

- [x] 3.1 API/Web/Worker/Fedify application DB source를 `kosmo_runtime` standard PG\* contract로 전환한다.
- [x] 3.2 legacy workload consumer/selector를 제거하되 API/Worker role·Secret provisioning을 보존한다.
- [x] 3.3 runtime Secret rotation restart target을 네 application workload에 연결하고 migration/queue target을 제외한다.

## 4. PROD-780 application behavior·non-production verification

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `PROD-780`

**Deliverable**

runtime identity 전환이 기존 GraphQL/application policy, Post cleanup/returning, Notification cleanup, Reaction count와 Worker/Fedify/Temporal behavior를 변경하지 않았음을 code/CI와 비운영 evidence로 증명한다.

**Guardrails**

- GraphQL schema/payload, visibility/owner predicate, operation session, actor GUC, RLS policy/helper를 변경하지 않는다.
- hidden/deleted Post owner cleanup, `UPDATE ... RETURNING`/`DELETE ... RETURNING`, Notification cleanup과 viewer-independent Reaction count를 약화하지 않는다.
- production preflight/sync/apply/cutover/live와 Secret/role mutation은 실행하지 않는다.

**Verification**

- 관련 workspace lint/format/typecheck와 Core/API/Fedify/Worker 회귀를 실행한다.
- exact non-production revision에서 `current_user=kosmo_runtime`, `rolbypassrls=false`, ACL/owner와 queue/migration 분리를 확인한다.
- code/CI, non-production evidence, production 미실행 범위를 별도로 기록한다.

- [x] 4.1 기존 application/GraphQL/core/Worker/Fedify regression을 실행한다.
- [x] 4.2 non-production role/catalog/CRUD/readiness와 source separation evidence를 수집한다.
- [x] 4.3 production 미실행 및 PROD-781/PROD-782/PROD-712 후속 ownership을 completion evidence에 기록한다.

## 5. PROD-780 OpenSpec Gate·통합 완료

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `PROD-780`
- `PROD-781`, `PROD-782`, `PROD-712` (후속 ownership)

**Deliverable**

최신 `kosmo_runtime` scope와 구현·검증 결과가 적용되는 active runtime spec에 정합하게 반영되고, 전체 change가 완료된 뒤 archive할 수 있다.

**Guardrails**

- 구현 전에는 task를 완료로 표시하거나 archive하지 않는다.
- 기존 active ACL/credential change의 historical evidence는 superseded boundary로 보존하되, 최신 authority와 충돌하는 normative 문구를 근거로 사용하지 않는다.
- spec sync/archive는 구현과 통합 검증 완료 후 수행하며 production 승인으로 해석하지 않는다.

**Verification**

- target change strict validation과 전체 strict validation을 실행한다.
- final implementation review에서 `kosmo_runtime` role/ACL/source와 legacy ownership boundary를 재확인한다.

- [x] 5.1 구현 전 OpenSpec Gate에서 proposal/design/decisions/spec deltas/tasks의 authority·scope·ownership 정합성을 검토한다.
- [x] 5.2 구현·통합 검증 완료 후 적용되는 runtime spec sync/archive와 post-archive strict validation을 수행한다.
