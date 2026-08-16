## Context

PR #599에서 Post/PostContent GraphQL RLS가 `main`에 병합되었고, 현재 Drizzle metadata는 두 table의 `withRLS`와 `kosmo_api` viewer/transition policy를 선언한다. 동시에 GraphQL resolver·selector·service에는 Post Visibility, Post Eligibility, owner와 목록 policy를 계산하는 application predicate가 이미 있다. ADR 0024는 요청별 SNS authorization과 visibility를 DB session actor state로 중복하지 않고 중앙 application policy가 집행하도록 방향을 바꿨다.

이 change는 새 capability를 만드는 것이 아니라 기존 `post` capability의 authorization 경계를 수정한다. 기존 viewer/list/pagination/PostContent 동작은 별도 재정의하지 않고 보존 scenario로 남긴다. Post 삭제는 physical DELETE가 아니라 현재 core service가 수행하는 owner-scoped Tombstone UPDATE와 GraphQL payload를 보존한다.

`apply-graphql-post-viewer-rls-policies`는 모든 artifact가 완료된 obsolete active change다. 이 change를 구현하기 전 obsolete delta를 active 목록에서 제거하고 history를 보존하기 위해 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`를 PROD-777 owner가 실행한다. 그 뒤 이 change의 `post` delta는 정상 archive에서 canonical `openspec/specs/post/spec.md`에 sync한다.

## Goals / Non-Goals

**Goals:**

- `post` capability의 GraphQL authorization/visibility enforcement를 중앙 application policy로 고정하고 PostgreSQL RLS와 actor GUC 의존성을 제거한다.
- Post/PostContent의 GraphQL RLS enablement와 네 policy를 새 compensating forward migration으로 제거한다.
- 기존 Post viewer/list/pagination/PostContent 관찰 동작을 보존한다.
- owner-scoped Tombstone UPDATE, owner visibility-independent Active 삭제, DELETED 반복의 idempotent payload/no post-commit, owner/missing 오류와 GraphQL `postId`/`repostSource`를 보존한다.
- pure Repost만 실제 전이 후 post-commit Repost Notification cleanup을 실행하고, 실패를 격리하며 ordinary Post/Quote/reply에는 적용하지 않는다.
- Post의 viewer-independent Reaction count 계약을 변경하지 않는다.

**Non-Goals:**

- Bookmark, Reaction 또는 다른 table의 RLS 변경
- Worker/Fedify/Temporal ingress, Post application visibility policy 자체, operation session/`ctx.db`/actor GUC 제거, runtime role·credential 변경
- 기존 migration 파일·snapshot·적용 history의 수정/삭제
- 파일별 migration behavior test
- production preflight, sync/apply, cutover와 live 검증

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`의 `Posts`와 `PostContents`는 `pgTable.withRLS`와 각각의 `kosmo_api` policy metadata를 사용한다. Bookmark metadata는 같은 파일에 있으므로 변경 범위를 분리해야 한다.
- 적용된 migration `20260814090950_prod_713_post_viewer_rls`는 `post_graphql_viewer_select`, `post_graphql_transition_all`, `post_content_graphql_viewer_select`, `post_content_graphql_transition_all`을 생성한다. 기존 migration을 편집하면 forward migration 원칙과 replay 증거가 깨진다.
- PostContent의 RLS policy는 부모 Post를 참조했지만, 최종 application 조회는 기존 Post authorization/visibility policy와 PostContent object 경로가 소유한다. RLS 제거 후 direct ID가 application 경로를 건너뛰지 않도록 call graph를 확인한다.
- `deletePost`는 먼저 Post row를 조회해 owner를 확인한 뒤 Active row만 `UPDATE ... SET state=DELETED, deleted_at=now() ... RETURNING currentContentId,id,replyParentId,repostSourceId`로 전환한다. 이미 DELETED인 owner 호출은 같은 payload를 만들지만 update 결과와 post-commit effect는 없다.
- pure Repost 판정은 반환된 구조의 `currentContentId`와 `replyParentId`가 null이고 `repostSourceId`가 non-null인 경우다. 이 경우에만 commit 후 삭제된 pure Repost row의 `post.id`를 Notification `sourceId`로 사용해 Repost Notification cleanup을 시도하며 cleanup 실패는 Tombstone/GraphQL 성공을 바꾸지 않는다.

### Recommended Approach

1. 구현 전에 obsolete active change를 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`로 archive하고, 기존 artifact를 수정하지 않는다.
2. `Posts`와 `PostContents`에서 RLS 전용 metadata만 제거하고, 일반 columns, FK, index, check와 Bookmark policy는 그대로 둔다. `post` capability delta에는 기존 viewer/list/pagination/PostContent 동작을 새 규칙으로 복제하지 않고 application policy enforcement 경계와 보존 scenario만 기록한다.
3. 현재 `main`의 schema snapshot과 migration history를 기준으로 새 timestamped migration을 생성한다. migration은 `post`와 `post_content`의 네 기존 policy를 drop하고 두 table의 RLS를 disable하는 명령만 포함하며, object ACL·ownership을 바꾸는 GRANT/REVOKE는 포함하지 않는다.
4. 생성된 migration을 blank replay와 current main 이후 schema에서 검토해 두 table의 `relrowsecurity=false`, policy 부재, 다른 table 정책·ACL 무변경을 catalog query로 확인한다.
5. 기존 GraphQL/core regression에서 application visibility 결과와 PostContent 조회 경로, owner visibility-independent Active 삭제, DELETED 반복 payload/no post-commit, other-owner/missing 오류, `postId`/`repostSource` payload를 확인한다. pure Repost Notification cleanup과 실패 격리, ordinary/Quote/reply 제외도 함께 확인하고, 구현 PR과 Linear PROD-777에 supersede 관계와 PROD-777의 sync/archive 책임을 기록한다.

### Allowed Alternatives

- migration SQL은 Drizzle metadata diff가 생성한 동등한 `DROP POLICY`/`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` 표현을 사용할 수 있다. 최종 catalog 결과와 기존 object ACL 보존을 별도로 확인해야 한다.
- 이미 metadata에서 RLS 선언이 제거된 branch라면 migration을 수동 SQL로 작성할 수 있다. 정책 이름과 table 범위가 정확히 일치하고 history를 수정하지 않아야 한다.

### Known Traps

- `post`와 `post_content`만 제거해야 하는데 `bookmark` 또는 다른 table의 `withRLS`/policy를 함께 삭제하지 않는다.
- Post deletion을 physical DELETE로 바꾸거나 owner visibility check를 추가해 hidden Post 삭제를 막지 않는다.
- DELETED 반복 호출에서 `deleted_at`을 갱신하거나 post-commit cleanup을 다시 실행하지 않는다.
- ordinary Post, Quote 또는 reply를 pure Repost로 분류해 Repost Notification을 정리하지 않는다.
- `GRANT`를 되돌려 object ACL까지 축소하거나 `kosmo_worker`/owner 권한을 재설계하지 않는다. ACL과 role 통합은 별도 contract다.
- RLS 제거를 application predicate 삭제, Post policy 단순화, operation session/actor GUC 제거의 신호로 해석하지 않는다.
- migration replay/CI 성공을 production sync/apply/cutover 또는 live 검증으로 보고하지 않는다.

## Risks / Trade-offs

- [DB 행 경계를 제거하면 애플리케이션 predicate 누락이 직접 노출될 수 있다] → 중앙 application authorization/visibility policy와 기존 Node/list/PostContent regression을 유지·검증한다.
- [metadata와 catalog가 어긋날 수 있다] → 새 migration replay와 snapshot/schema parity, `pg_class`·`pg_policy` catalog 검증을 같은 PR에서 수행한다.
- [이미 병합된 RLS history와 새 rollback artifact가 혼동될 수 있다] → obsolete change를 지정 archive 명령으로 이력 보존하고, 새 `post` delta를 정상 archive하는 순서를 PR/Linear에 명시한다.
- [Tombstone transition과 post-commit cleanup을 함께 바꾸면 payload 또는 실패 격리가 깨질 수 있다] → 기존 core transaction과 pure Repost 분기·post-commit 경로를 유지하고 ordinary/Quote/reply 회귀를 확인한다.

## Migration Plan

1. obsolete active change를 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`로 archive해 history를 보존하고 obsolete delta를 active 목록에서 제거한다.
2. PROD-777 구현 branch를 최신 `origin/main`에서 만들고 metadata 변경과 compensating migration을 함께 작성한다.
3. blank database replay, migration smoke/catalog 검증, GraphQL/core regression과 formatting/lint/type checks를 실행한다. 파일별 migration behavior test는 추가하지 않는다.
4. Ready PR에서 implementation·verification·canonical `post` delta sync·archive 책임을 PROD-777에 귀속하고, production 단계는 별도 승인 대기로 남긴다.
5. 이 change의 구현 rollback이 필요하면 기존 migration history를 고치지 않고 새 forward migration을 추가로 작성한다. production rollback/apply는 별도 승인 없이는 수행하지 않는다.

## Open Questions

없음. operation session, actor context, runtime role 통합은 각각 PROD-779/PROD-780 후속 계약에서 결정한다.
