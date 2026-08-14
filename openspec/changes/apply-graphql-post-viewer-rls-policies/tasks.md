## 1. PROD-713 Post/PostContent RLS policy

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/profile.md`
- PROD-713

**Deliverable**

`post`와 `post_content`가 `kosmo_api`의 selected Profile viewer 및 현재 GraphQL Mutation 호환 DML을 PostgreSQL RLS로 강제한다.

**Guardrails**

- policy role은 `kosmo_api`뿐이며 FORCE RLS, Worker policy, role/ACL/credential 변경이 없다.
- DIRECT는 author-only interim이고 account-only/malformed context는 private actor 권한을 얻지 않는다.
- 각 table의 permissive `FOR ALL`과 restrictive SELECT policy는 `kosmo_api`에만 한정하고 장기 actor authorization으로 취급하지 않는다.
- owner와 `kosmo_worker` BYPASSRLS, application predicate와 순수 Repost source predicate를 유지한다.

**Verification**

- schema metadata, migration SQL과 PostgreSQL catalog에서 table RLS/FORCE와 policy command/role/qual/check를 확인한다.
- blank database migration replay와 snapshot chain을 검증한다.

- [x] 1.1 Post/PostContent schema metadata에 GraphQL-only SELECT 및 permissive transition DML policy를 반영한다.
- [x] 1.2 additive migration과 snapshot을 생성하고 기존 helper·ACL migration history를 수정하지 않았는지 확인한다.
- [x] 1.3 policy role/command/mode, FORCE off, no Worker/queue policy와 table당 `RESTRICTIVE SELECT`·`PERMISSIVE ALL` 조합을 정적 검증한다.

## 2. PROD-713 role-level policy matrix

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- PROD-713

**Deliverable**

isolated PostgreSQL에서 viewer, author DML, PostContent parent, owner/Worker bypass와 fail-closed 결과를 지속적으로 재현한다.

**Guardrails**

- production database, Vault 또는 cluster principal을 검증에 사용하지 않는다.
- Account 전체 membership을 일반 viewer로 인정하지 않는다.
- Notification recipient execution은 PROD-766, Temporal 전환 후 DML removal은 PROD-765에 남긴다.
- 증명된 plan 병목 없이 index를 추가하지 않는다.

**Verification**

- existing isolated test database wrapper에서 실제 `SET ROLE kosmo_api`와 actor setting을 사용한다.
- anonymous/account-only/empty/malformed, author/follower/stranger, DIRECT, DELETED 전체 숨김, suspended author, PostContent direct ID를 검증한다.
- 두 table의 visible Active row INSERT/UPDATE/DELETE가 actor setting과 무관하게 허용되고 SELECT viewer matrix는 넓어지지 않으며 ACTIVE→DELETED 전이는 거부되는지 실제 SQL로 검증한다.

- [x] 2.1 catalog와 viewer SELECT/PostContent parent/DELETED 전체 숨김 matrix를 자동 검증한다.
- [x] 2.2 두 table의 permissive `FOR ALL` command matrix, actor context 비의존성과 restrictive SELECT 결합을 자동 검증한다.
- [x] 2.3 owner와 `kosmo_worker` BYPASSRLS 무회귀, policy plan과 blank replay를 검증한다.

## 3. PROD-713 integration과 completion handoff

**Authority / Provenance**

- `docs/domain/objects/post.md`
- PROD-713
- Downstream PROD-716, PROD-765, PROD-766

**Deliverable**

PROD-713의 독립 구현 증거와 downstream cutover/contract 경계가 과장 없이 전달된다.

**Guardrails**

- GraphQL viewer/author와 순수 Repost source predicate를 이번 change에서 제거하지 않는다.
- PROD-766 완료 전 PROD-716 principal cutover를 완료하지 않는다.
- PR merge, CI, 이슈 Done 또는 OpenSpec archive는 production sync/apply/live 검증 승인이 아니다.
- production preflight, sync/apply와 post-apply live 검증은 이 change의 task나 archive 조건에 포함하지 않는다.

**Verification**

- 관련 GraphQL/core regression, formatting/lint/type checks, migration smoke와 OpenSpec strict validation을 통과한다.
- PR에는 migration 배포, 실제 principal cutover, Notification 후속과 production 운영 상태를 구분해 기록한다.

- [x] 3.1 Post create/reply/repost와 owner 경로 delete regression을 통과시키고 `kosmo_api` delete는 PROD-677 전까지 cutover하지 않는 경계를 검증한다.
- [x] 3.2 repository formatting·lint·type/migration checks와 OpenSpec target/all strict validation을 통과시킨다.
- [ ] 3.3 PR merge 뒤 정확한 비운영 revision에서 policy catalog와 representative role matrix를 확인하고, delta spec 동기화·archive 및 Linear 완료 증거를 정리한다.
