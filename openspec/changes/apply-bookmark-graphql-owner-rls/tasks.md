## 1. PROD-771 Bookmark owner RLS policy

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- PROD-771

**Deliverable**

`bookmark`가 `kosmo_api`의 selected Profile owner SELECT, INSERT와 DELETE를 PostgreSQL RLS로 강제한다.

**Guardrails**

- policy role은 `kosmo_api`뿐이며 FORCE RLS, Worker policy, role/ACL/credential 변경이 없다.
- UPDATE 권한과 Target Post visibility 조건을 추가하지 않는다.
- owner와 `kosmo_worker` BYPASSRLS, application owner predicate를 유지한다.
- 다른 table RLS를 변경하지 않는다.

**Verification**

- schema metadata와 migration SQL에서 table RLS/FORCE와 policy command/role/qual/check를 확인하고, PostgreSQL catalog는 정확한 branch revision의 일회성 비운영 증거로 확인한다.
- blank database migration replay와 snapshot chain을 검증한다.

- [x] 1.1 Bookmark schema metadata에 GraphQL-only owner SELECT, INSERT와 DELETE policy를 반영한다.
- [x] 1.2 additive migration과 snapshot을 생성하고 기존 helper·ACL·다른 table migration history를 수정하지 않았는지 확인한다.
- [x] 1.3 policy role/command, FORCE off, no UPDATE/Worker/Post predicate를 정적·catalog 수준에서 검증한다.

## 2. PROD-771 GraphQL과 role-level owner matrix

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- PROD-771

**Deliverable**

Bookmark Node, `Profile.bookmarks`, `Post.viewerBookmark`, create/delete가 selected Profile별로 격리되고 hidden Target에서도 row 유지와 owner delete 계약을 보존한다.

**Guardrails**

- hidden Target Post를 Bookmark policy에서 다시 판정하지 않는다.
- Bookmark 전용 persistent migration behavior test를 새 파일이나 기존 smoke 파일에 추가하지 않는다.
- 기존 GraphQL shape, payload, pagination, 멱등성과 cache 계약을 유지한다.
- production database, Vault 또는 cluster principal을 검증에 사용하지 않는다.

**Verification**

- 기존 Bookmark GraphQL integration에서 owner/other Profile, Node/connection/viewer loader, create/delete와 hidden Target 계약을 검증한다.
- 정확한 branch revision의 격리 PostgreSQL에서 `SET ROLE kosmo_api`, actor setting과 `kosmo_worker` BYPASSRLS를 사용한다.
- owner/other/missing/empty/malformed context의 SELECT/INSERT/DELETE, UPDATE 거부와 hidden Target owner delete는 정확한 branch revision의 일회성 비운영 role matrix로 검증하고 repository test로 고정하지 않는다.

- [x] 2.1 기존 Bookmark GraphQL integration을 RLS principal에서 실행하고 selected Profile 전환·Node·connection·viewer·create/delete 회귀를 보강한다.
- [x] 2.2 hidden Target에서 Bookmark row/Node 유지, nullable Post, connection 제외와 owner delete를 검증한다.
- [x] 2.3 `kosmo_api` owner/other/missing/empty/malformed command matrix와 owner·`kosmo_worker` BYPASSRLS 무회귀를 격리 PostgreSQL에서 검증한다.

## 3. PROD-771 completion과 downstream handoff

**Authority / Provenance**

- `docs/domain/objects/bookmark.md`
- PROD-771
- PROD-767

**Deliverable**

PROD-771의 독립 구현·비운영 검증과 downstream coverage/cutover 경계가 과장 없이 전달된다.

**Guardrails**

- GraphQL application owner predicate와 operation session lifecycle을 제거·변경하지 않는다.
- PR/CI/OpenSpec 완료를 production sync/apply/cutover/live 증거로 사용하지 않는다.
- production preflight, sync/apply, principal cutover와 live 검증은 수행하지 않는다.

**Verification**

- 관련 GraphQL/core regression, formatting/lint/type checks, migration smoke와 OpenSpec target/all strict validation을 통과한다.
- 변경 범위에 다른 table policy, production 또는 credential 변경이 없는지 확인한다.
- 전체 change 완료 뒤 delta spec 동기화와 archive 결과를 strict validation으로 확인한다.

- [x] 3.1 repository formatting·lint·type/migration checks와 OpenSpec target/all strict validation을 통과시킨다.
- [x] 3.2 diff와 검증 증거에서 Bookmark-only scope, downstream PROD-767/716 경계와 production 금지를 확인한다.
- [ ] 3.3 전체 구현·비운영 검증 완료 뒤 delta spec을 동기화하고 OpenSpec change를 archive한다.
