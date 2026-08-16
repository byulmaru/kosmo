## Context

PR #602으로 Bookmark owner RLS가 `main`에 병합됐다. 현재 schema metadata는 Bookmark table을 RLS
table로 선언하고 `kosmo_api`에 selected Profile equality를 기준으로 한 SELECT/INSERT/DELETE policy를
생성한다. GraphQL은 이미 `Bookmark` Node loader, `Post.viewerBookmark`, `Profile.bookmarks`, create/delete
service와 resolver에서 `profileId`를 기준으로 application owner 조건을 적용한다.

Bookmark row와 Target Post의 노출은 서로 다른 생명주기를 가진다. Tombstone·hidden Target Post에서도 Owner의
Bookmark row와 삭제 결과는 유지해야 하며, `Bookmark.post`와 owner connection edge만 기존 `postAccessWhere`
경계를 적용한다. ADR 0024는 이 요청별 SNS policy를 PostgreSQL RLS가 아니라 application policy로 두고,
Bookmark RLS를 새 forward migration으로 철회하도록 정했다.

## Goals / Non-Goals

**Goals:**

- 이미 병합된 Bookmark RLS enablement와 policy를 migration history를 고치지 않고 compensating forward
  migration으로 제거한다.
- Bookmark metadata와 최종 schema catalog를 RLS 없는 상태로 정렬한다.
- selected Profile application owner predicate, Node/connection/viewer/create/delete GraphQL 계약,
  hidden/deleted Target Post row 유지·owner delete·`DELETE RETURNING` payload를 보존한다.
- active `bookmark-graphql-row-level-security` capability의 네 RLS 요구사항을 모두 제거하고,
  `bookmark` capability에 target application-policy contract를 delta로 추가하며 archived RLS change는
  역사로 남긴다.

**Non-Goals:**

- Post/PostContent 또는 다른 table RLS와 Post visibility policy 변경
- Worker/Fedify/Temporal policy, role/ACL/credential 또는 runtime role 통합
- operation DB session, `ctx.db`, actor GUC 또는 Pooler 제거
- Bookmark 제품 동작, GraphQL shape, pagination, 멱등성, cache 변경
- Bookmark에 정의된 Notification 동작 변경
- 파일별 migration behavior test 추가
- production preflight, Secret sync/apply, migration apply, principal cutover와 live 검증

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`의 Bookmark table metadata가 RLS 선언과 세 policy를 소유한다. target schema에는
  이 table-level RLS metadata가 없어야 하므로 metadata와 generated snapshot이 실제 catalog와 함께 정렬돼야
  한다.
- 이미 main에 병합된 `20260814134143_prod_771_bookmark_owner_rls` migration은 수정·삭제할 수 없다.
  새 migration은 기존 정책을 제거하고 table RLS를 비활성화하는 순서로 작성해야 하며, rollback 또는 history
  rewrite를 구현 결과로 삼지 않는다.
- `apps/api/src/graphql/resolvers/bookmark/ref.ts`와 `field/profile.ts`는 selected Profile owner 조건을
  적용한다. `field/profile.ts`의 Post/Profiles/Instances join과 `postAccessWhere`는 Bookmark row 권한이
  아니라 Target Post edge 후보 필터이므로 RLS predicate로 옮기거나 제거하지 않는다.
- `packages/core/services/bookmark.ts`의 create는 conflict 후 owner row를 다시 읽고 delete는
  `RETURNING`을 사용한다. `apps/api` mutation resolver는 selected Profile을 전달하고 Post field가 hidden
  Target에서 nullable 결과를 만든다. 이 경로의 owner predicate·payload 의미를 유지해야 한다.
- Bookmark Notification 동작은 이 migration의 변경 근거가 아니며 이 change 범위에서 제외한다.

### Recommended Approach

1. Bookmark schema metadata에서 RLS 선언과 Bookmark policy metadata를 제거해 일반 table 정의로 되돌린다.
2. 기존 migration history를 그대로 둔 새 compensating migration과 snapshot을 생성한다. migration은
   Bookmark policy를 제거하고 table RLS를 비활성화하며, 최종 catalog에서 Bookmark RLS/policy가 없어졌는지
   확인할 수 있어야 한다.
3. GraphQL resolver와 core service의 selected Profile application predicates를 유지한다. 특히 Node와
   viewer loader의 owner filter, connection의 Post access filter, create의 Post access 검사, delete의
   owner+ID `RETURNING`을 변경하지 않는다.
4. 기존 Bookmark GraphQL integration으로 owner/other Profile, Node/connection/viewer, create/delete,
   hidden Target과 repeated mutation payload를 검증한다. generic migration replay와 schema/catalog check를
   사용하고 Bookmark 전용 migration behavior test 파일은 추가하지 않는다.
5. 변경 diff가 Bookmark metadata/migration/snapshot 및 필요한 회귀 검증에 한정됐는지 확인하고, 두 active
   capability delta가 canonical contract와 일치하는지 검토한다. archive sync가 모든 requirement를 제거한 빈
   `bookmark-graphql-row-level-security` spec shell을 남기면 retired capability 파일도 제거한다. CI와 OpenSpec
   strict validation을 통과한 뒤 PROD-778이 구현·검증·delta sync·archive 증거를 소유한다.

### Allowed Alternatives

- migration SQL은 Drizzle generated migration을 보완하는 hand-written DDL이어도 된다. 단, 기존 migration
  history를 수정하지 않고 동일한 최종 catalog(Bookmark RLS disabled, Bookmark policy absent)를 만들며,
  다른 table·role·session 경계를 변경하지 않아야 한다.
- schema snapshot 생성 방식은 repository의 현재 migration tooling을 따를 수 있다. 최종 snapshot과
  `packages/core/db/tables.ts` metadata가 target schema를 동일하게 표현해야 한다.

### Known Traps

- 이미 병합된 migration을 편집하거나 삭제하면 신규·기존 환경의 migration history가 갈라진다.
- metadata만 지우고 compensating migration을 만들지 않으면 이미 적용된 schema에 Bookmark RLS가 남는다.
- policy만 drop하고 RLS를 비활성화하지 않거나 반대로 table RLS만 끄고 policy를 남기면 catalog 계약이
  불명확해진다.
- Bookmark policy에 Target Post visibility/lifecycle을 다시 넣으면 hidden Target owner Node/delete 계약을
  깨뜨린다.
- application `profileId` predicate를 RLS 제거와 함께 삭제하면 다른 selected Profile의 Bookmark가 노출되거나
  변경된다.
- operation session, `ctx.db`, actor GUC, runtime role 또는 Worker/Fedify/Temporal 파일을 함께 정리하면
  PROD-779/780 경계를 선점한다.
- 새 migration을 production에 preflight/sync/apply하거나 live catalog를 확인한 것을 구현 완료 증거로
  표현하면 안 된다.

## Risks / Trade-offs

- [DB 계층의 중복 owner enforcement를 제거하면 application predicate 누락 위험이 남는다] → 기존 central
  GraphQL owner checks와 integration regression을 유지하고, 정책 계층의 변경은 별도 upstream 결정으로
  다룬다.
- [보상 migration이 환경별 기존 catalog 차이를 드러낼 수 있다] → blank replay와 schema/catalog check를
  비운영 격리 환경에서 실행하고, migration history는 수정하지 않는다.
- [RLS 제거와 후속 operation session/role 정리가 서로 다른 시점에 반영될 수 있다] → 이번 change는
  Bookmark policy와 GraphQL 계약만 완료로 보고 PROD-779/780을 별도 handoff로 유지한다.

## Migration Plan

1. 최신 `origin/main`의 Bookmark RLS migration history와 metadata를 기준으로 compensating migration을
   생성한다.
2. 빈 schema replay와 현재 Bookmark GraphQL regression을 실행하고, Bookmark RLS disabled/policy absent 및
   다른 table policy 무변경을 확인한다.
3. 변경을 Ready PR로 제출하고 PROD-778의 CI·비운영 검증·OpenSpec sync/archive 책임을 완료한다.
4. production preflight/sync/apply/cutover/live는 수행하지 않는다. target 동작을 되돌려야 하는 경우에도
   migration history를 수정하지 않고 별도 승인된 새 forward migration이 필요하다.

## Open Questions

없음.
