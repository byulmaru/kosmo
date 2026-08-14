## 1. PROD-724 application object ACL migration

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- PROD-724
- PROD-616

**Deliverable**

`kosmo_api`와 `kosmo_worker`가 owner `kosmo`의 현재와 future `public` application table에 공통 CRUD DML ACL을 갖는다.

**Guardrails**

- 두 역할의 current table DML 집합을 동일하게 유지한다.
- object owner는 `kosmo`로 유지한다.
- DDL, ownership, grant option, schema `CREATE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`를 부여하지 않는다.
- application sequence와 `drizzle` migration history에 권한을 부여하지 않는다.
- 기존 migration runner의 `kosmo_migration` 연결과 `SET ROLE kosmo` 경계를 유지한다.
- application migration에서 runtime role을 생성·변경하거나 credential을 다루지 않는다.

**Verification**

- 빈 disposable database의 full migration replay가 성공한다.
- catalog에서 schema/table/default ACL, owner, sequence와 migration history 제외를 전수 확인한다.

- [x] 1.1 두 runtime 역할에 `public` schema `USAGE`와 현재 application table 전체의 공통 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 부여하는 additive forward migration을 구현한다.
- [x] 1.2 owner `kosmo`가 이후 `public`에 만드는 table에 두 역할의 같은 CRUD DML을 부여하는 default ACL을 구현한다.
- [x] 1.3 migration artifact와 schema snapshot을 저장소의 기존 Drizzle migration 계약에 맞게 정렬한다.

## 2. PROD-724 disposable·정적 검증

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- PROD-724
- PROD-616

**Deliverable**

빈 database에서 전체 migration을 재현할 수 있고, 허용된 ACL과 금지된 권한의 catalog 증거가 일치한다.

**Guardrails**

- catalog 검증 성공을 RLS policy, workload principal cutover 또는 production 적용 증거로 사용하지 않는다.
- stage-specific 영구 credential이나 실제 Vault 값을 test fixture에 기록하지 않는다.
- disposable 검증은 PROD-369과 동등한 비소유 runtime role fixture를 migration 전에 준비하고, role lifecycle을 application migration에 넣지 않는다.

**Verification**

- full replay 뒤 두 역할의 schema/table privilege 집합을 비교한다.
- `pg_default_acl`, object owner와 grant option을 검사한다.
- 금지 권한, application sequence grant와 `drizzle` history 접근 부재를 검사한다.
- 관련 workspace lint, format, typecheck와 database test를 실행한다.

- [x] 2.1 disposable PostgreSQL에 PROD-369과 동등한 비소유 runtime role fixture를 test-only로 준비하고, 빈 database에서 전체 migration replay와 migration smoke test를 통과시킨다.
- [x] 2.2 두 역할의 current table CRUD DML, owner `kosmo`, future table default ACL과 모든 금지 권한을 catalog assertion으로 검증한다.
- [x] 2.3 두 runtime 역할의 대표 CRUD DML 성공과 DDL·ownership·재위임 거부를 disposable database에서 검증한다.
- [x] 2.4 관련 workspace 검증과 OpenSpec strict validation을 통과시킨다.

## 3. PROD-724 비운영 검증과 완료

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- PROD-724

**Deliverable**

비운영 환경에서 두 runtime 역할의 공통 object ACL이 실제로 동작하며, production 작업 없이 변경의 완료 증거와 archive 경계가 충족된다.

**Guardrails**

- GraphQL RLS policy와 actor helper ACL은 PROD-713에 남긴다.
- workload credential 선택·principal cutover는 PROD-715/716에 남긴다.
- Production preflight, Vault 확인, sync/apply, cutover와 post-apply live 검증을 수행하거나 완료 조건으로 삼지 않는다.
- PR merge, 이슈 Done과 OpenSpec archive는 production 작업 승인이 아니다.

**Verification**

- dev 등 비운영 환경에서 두 runtime 역할의 `current_user`, 대표 CRUD DML과 금지 권한 거부를 확인한다.
- 실제 ACL·owner·default ACL evidence를 PROD-724에 기록한다.
- delta spec 동기화와 archive 후 전체 OpenSpec strict validation을 통과시킨다.

- [ ] 3.1 비운영 환경에서 `kosmo_api`와 `kosmo_worker`의 공통 application CRUD DML과 금지 권한 거부를 live 검증한다.
- [ ] 3.2 검증 범위가 object ACL뿐이며 RLS policy·principal cutover·production 적용을 증명하지 않는다는 evidence를 PROD-724에 기록한다.
- [ ] 3.3 전체 범위와 비운영 검증이 완료되면 delta spec을 동기화하고 이 change를 archive한다.
