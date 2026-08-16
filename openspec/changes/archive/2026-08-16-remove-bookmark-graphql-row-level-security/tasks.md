## 1. PROD-778 Bookmark RLS catalog 철회

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/post.md`
- `PROD-778`

**Deliverable**

이미 main에 병합된 Bookmark RLS를 새 forward migration으로 제거하고, schema metadata·snapshot·최종
catalog를 RLS 없는 Bookmark 상태로 정렬한다.

**Guardrails**

- 기존 migration history와 archived `apply-bookmark-graphql-owner-rls`는 수정·삭제하지 않는다.
- Bookmark 외 table RLS, Post policy, Worker/Fedify/Temporal policy, role/ACL/credential은 변경하지 않는다.
- operation session, `ctx.db`, actor GUC와 runtime role 통합은 PROD-778에 포함하지 않는다.
- 파일별 Bookmark migration behavior test는 추가하지 않는다.
- production preflight, sync/apply, cutover와 live 검증은 수행하지 않는다.

**Verification**

- 빈 schema migration replay와 이미 Bookmark RLS migration이 적용된 비운영 schema의 catalog를 확인한다.
- Bookmark RLS가 disabled이고 Bookmark policy가 없으며 기존 migration history와 다른 table policy가
  unchanged인지 확인한다.

- [x] 1.1 Bookmark schema metadata와 snapshot을 target application-policy 계약에 맞게 정렬한다.
  - Evidence: `packages/core/db/tables.ts`의 Bookmark `withRLS`와 세 `pgPolicy`만 제거하고 unique/index/FK는 유지했으며, generated snapshot은 Bookmark `isRlsEnabled=false`와 Post/PostContent RLS/policy를 그대로 보존한다.
- [x] 1.2 기존 Bookmark RLS history를 수정하지 않고 policy 제거·RLS 비활성화 compensating forward migration을 추가한다.
  - Evidence: `drizzle/20260816061735_prod_778_remove_bookmark_graphql_rls/migration.sql`이 기존 history를 수정하지 않고 Bookmark 세 policy를 DROP한 뒤 RLS를 DISABLE한다.
- [x] 1.3 generic migration replay와 비운영 schema/catalog 검증을 실행해 Bookmark-only scope와 최종 RLS 부재를 증명한다.
  - Evidence: 전용 disposable PostgreSQL에서 `pnpm --filter @kosmo/core test:migrate:smoke`가 통과했고, catalog 조회 결과 RLS table은 `post`, `post_content`만 남고 Bookmark policy count는 `0`이며 기존 Post/PostContent policy 네 개가 남았다.

## 2. PROD-778 Bookmark GraphQL 계약 회귀

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-778`

**Deliverable**

selected Profile 기반 application owner predicate와 Bookmark Node, `Profile.bookmarks`,
`Post.viewerBookmark`, create/delete의 기존 shape·payload·pagination·멱등성·cache 동작을 유지한다.

**Guardrails**

- hidden/deleted 또는 조회 불가능한 Target Post의 Bookmark row와 생성 시각을 유지하고 Owner delete와
  `DELETE RETURNING` payload를 보존한다.
- `Bookmark.post`는 기존 Post 조회 경계에 따라 nullable이고 owner connection은 hidden Target edge를
  제외한다.
- application `profileId` predicate와 Post visibility policy를 제거·완화하지 않는다.
- Bookmark Notification 동작은 변경하지 않고 이 change 범위에서 제외한다.
- 파일별 migration behavior test를 새로 추가하지 않는다.

**Verification**

- 기존 Bookmark GraphQL integration에서 owner/other Profile, invalid selected Profile, Node/connection,
  viewer loader, create/delete, duplicate/repeated mutation을 검증한다.
- hidden/Tombstone/unavailable Target에서 row 유지, nullable Post, connection 제외와 Owner delete payload를
  검증한다.

- [x] 2.1 Bookmark GraphQL resolver·loader·core action의 selected Profile application owner 조건과
      기존 payload/cache 경계를 유지한다.
- [x] 2.2 기존 GraphQL integration을 실행·보강해 hidden Target, Node/connection/viewer와 create/delete
      회귀를 증명한다.
- [x] 2.3 Bookmark Notification 동작과 다른 table policy에 변경이 없는지 diff와 관련 회귀 결과로
      확인한다.

- Evidence: GraphQL integration `apps/api/tests/integration/graphql/bookmark.test.ts` 15/15 통과, core `services/bookmark.test.ts` 10/10 통과. 변경 diff에는 Bookmark metadata, forward migration/snapshot과 OpenSpec task evidence만 있으며 Bookmark 생성 Notification 없음과 Post/PostContent policy 보존을 catalog/diff로 확인했다.

## 3. PROD-778 비운영 완료·OpenSpec handoff

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/domain/objects/bookmark.md`
- `PROD-778`

**Deliverable**

PROD-778의 Bookmark 구현과 비운영 검증이 과장 없이 Ready PR로 전달되고, 두 active capability delta가
sync된 뒤 PROD-778이 전체 완료 증거와 OpenSpec archive를 소유한다.

**Guardrails**

- PR/CI/OpenSpec 완료를 production migration apply, principal cutover 또는 live 검증 증거로 표현하지
  않는다.
- Post/PostContent 및 다른 table RLS, Worker/Fedify/Temporal, operation session/`ctx.db`/actor GUC,
  runtime role/ACL/credential은 scope 밖에 둔다.
- strict validation은 최신 canonical 문서와 PROD-778 계약과 일치할 때만 완료로 간주한다.

**Verification**

- 관련 GraphQL/core regression, formatting/lint/type/migration checks와 OpenSpec strict validation을
  통과한다.
- diff가 Bookmark metadata/migration/snapshot 및 필요한 기존 GraphQL 회귀 검증으로 한정됐는지 확인한다.
- 전체 task와 비운영 완료 증거가 존재한 뒤 두 capability delta spec sync와 archive 결과를 확인한다.

- [x] 3.1 관련 formatting·lint·type·migration 및 GraphQL regression checks를 실행하고 결과를 기록한다.
- [x] 3.2 diff와 검증 증거에서 Bookmark-only scope, 후속 PROD-779/780 handoff와 production 금지를 확인한다.
- [x] 3.3 모든 구현·비운영 검증 task 완료 후 두 capability delta를 동기화하고 OpenSpec change를 archive하며, requirement가 모두 제거된 빈 `bookmark-graphql-row-level-security` active spec shell을 삭제한다.
