## Why

Bookmark owner RLS가 main에 병합됐지만, Kosmo GraphQL의 selected Profile 권한은 이미 application
policy가 소유하고 있으며 멘토링 결정에 따라 GraphQL 사용자 데이터에는 PostgreSQL RLS를 사용하지 않는다.
Bookmark 동작 계약과 hidden Target Post 관계를 보존하면서 병합된 RLS만 보상적 forward migration으로
철회해 현재 구현을 최종 application-policy 경계와 정렬한다.

## What Changes

- **BREAKING (database policy):** 이미 적용된 Bookmark RLS enablement와 `kosmo_api` owner policy를
  기존 migration history를 수정하지 않고 새 compensating forward migration으로 제거한다.
- Bookmark GraphQL Node, `Profile.bookmarks` connection, `Post.viewerBookmark`, `createBookmark`와
  `deleteBookmark`의 selected Profile 기반 application owner predicate와 공개 payload·pagination·멱등성
  계약을 유지한다.
- hidden/deleted 또는 조회 불가능한 Target Post에서도 Bookmark row·owner delete·`DELETE RETURNING`
  payload의 기존 계약을 보존하고, Post 노출만 기존 Post policy에 맡긴다.
- active `bookmark-graphql-row-level-security` capability에서 Bookmark RLS 요구사항을 모두 제거하고,
  `bookmark` capability에 selected Profile 기반 application owner enforcement target contract를 추가한다.
  기존 active spec과 archived `apply-bookmark-graphql-owner-rls` 기록은 역사로 보존한다.
- 다른 table RLS, Post policy, Worker/Fedify/Temporal 경계, operation session·`ctx.db`·actor GUC·runtime
  role 통합은 이 change에서 변경하지 않는다.
- 파일별 migration behavior test를 추가하지 않고 generic migration replay/catalog 검증과 기존 Bookmark
  GraphQL regression을 사용한다. production preflight/sync/apply/cutover/live는 수행하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`,
  `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`
- Linear Contract: [PROD-778](https://linear.app/byulmaru/issue/PROD-778/bookmark-graphql-rls%EB%A5%BC-%EC%A0%9C%EA%B1%B0%ED%95%98%EA%B3%A0-application-owner-policy%EB%A5%BC-%EC%9C%A0%EC%A7%80%ED%95%9C%EB%8B%A4)
- Linear Implementations: PROD-778가 구현·검증·OpenSpec sync/archive를 소유한다. 완료된 선행 Domain 결정은
  [PROD-776](https://linear.app/byulmaru/issue/PROD-776/postgresql-rls-%EC%A0%84%ED%99%98%EC%9D%84-%EC%B2%A0%ED%9A%8C%ED%95%98%EA%B3%A0-application-policy-%EA%B2%BD%EA%B3%84%EB%A5%BC-%ED%99%95%EC%A0%95%ED%95%9E%EB%8B%A4)이며
  PROD-778은 그 결정을 구현하는 독립 slice다.
- Historical context: 현재 active `openspec/specs/bookmark-graphql-row-level-security/spec.md`는 제거 대기 중인 이전 RLS 계약이며,
  archived `openspec/changes/archive/2026-08-14-apply-bookmark-graphql-owner-rls/`는 history다. 어느 쪽도 이 change의 독립 authority가 아니다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `bookmark-graphql-row-level-security`: 병합된 Bookmark RLS capability의 네 요구사항을 모두 제거하고
  history만 보존한다.
- `bookmark`: RLS 철회 뒤에도 selected Profile 기반 중앙 application policy와 기존 Bookmark GraphQL
  owner/hidden Target 계약을 유지하는 target contract를 추가한다.

## Impact

- Bookmark Drizzle metadata와 새 migration/snapshot에서 Bookmark RLS catalog 상태가 제거된다.
- Bookmark GraphQL selector/loader/service의 기존 application owner predicate와 Node, connection,
  viewer, create/delete 회귀 검증을 보존한다.
- hidden/deleted Target Post에서 row 유지·owner delete·payload를 검증한다.
- 두 active capability spec은 delta로 동기화되며, archived RLS proposal/design/decisions/tasks는 수정하지
  않는다. Bookmark Notification 동작은 변경하지 않고 이 change 범위에서 제외한다.
- 다른 table 정책, Post 정책, Worker/Fedify/Temporal, operation session/`ctx.db`/actor GUC/runtime role,
  production database와 credential에는 영향이 없다.
