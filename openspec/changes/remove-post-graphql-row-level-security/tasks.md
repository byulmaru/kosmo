## 0. PROD-777 obsolete Post RLS change archive

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `memory/issue-openspec-workflow.md`
- PROD-777

**Deliverable**

구현 전에 obsolete active change/delta를 active 목록에서 제거하되 당시 artifact와 provenance는 archive history로 보존한다.

**Guardrails**

- obsolete `apply-graphql-post-viewer-rls-policies` artifact를 소급 수정하거나 삭제하지 않는다.
- `--skip-specs`를 사용해 obsolete RLS delta가 canonical `post` spec에 동기화되지 않도록 한다.

**Verification**

- archive 결과와 active change 목록에서 history 보존 및 obsolete delta 제거를 확인한다.

- [x] 0.1 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`를 실행하고 결과를 확인한다.

## 1. PROD-777 Post/PostContent RLS metadata와 compensating migration

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `memory/database-migrations.md`
- PROD-777

**Deliverable**

`main`에 이미 병합된 Post/PostContent GraphQL RLS를 새 forward migration으로 제거하고, `post` capability metadata와 migration replay가 같은 최종 catalog 상태를 표현한다.

**Guardrails**

- 기존 migration 파일·snapshot·적용 history를 수정하거나 삭제하지 않는다.
- `post`와 `post_content`의 RLS를 disable하고 네 기존 policy를 drop하되 일반 object ACL, owner ownership, columns, FK, index와 check는 보존한다.
- Bookmark·Reaction 등 다른 table RLS와 Worker/Fedify/Temporal/Post application policy, operation session·`ctx.db`·actor GUC, runtime role·credential은 변경하지 않는다.
- production preflight, sync/apply, cutover와 live 검증을 수행하지 않는다.
- 파일별 migration behavior test를 추가하지 않는다.

**Verification**

- 새 migration이 current `origin/main`과 blank database에서 순서대로 replay된다.
- `post`/`post_content`의 RLS disabled와 네 policy 부재, 기존 ACL/ownership 및 다른 table 정책을 catalog query로 확인한다.
- schema/snapshot parity와 repository formatting/lint/type checks를 통과한다.

- [x] 1.1 `post` capability schema metadata에서 Post/PostContent GraphQL RLS 선언을 제거하고 일반 schema 정의와 다른 table policy를 보존한다.
- [x] 1.2 기존 Post/PostContent RLS migration history를 건드리지 않는 compensating forward migration과 snapshot을 작성한다.
- [x] 1.3 blank replay 및 current-main 이후 replay에서 RLS disabled, 네 policy 부재, ACL/ownership 무변경을 확인한다.

## 2. PROD-777 application authorization과 Post deletion 회귀

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/policies/post-list.md`
- PROD-777

**Deliverable**

GraphQL Post authorization/visibility는 중앙 application policy로 집행되고 기존 viewer/list/pagination/PostContent 결과가 보존된다. Post deletion은 owner-scoped Tombstone UPDATE와 기존 GraphQL payload/effect contract를 보존한다.

**Guardrails**

- 기존 application visibility, eligibility, owner와 list/pagination 조건을 삭제·재설계하지 않는다.
- PostContent direct/nested 조회가 application Post policy를 우회하지 않는다.
- Post deletion은 physical DELETE가 아니라 `UPDATE ... SET state=DELETED, deleted_at=now() ... RETURNING currentContentId,id,replyParentId,repostSourceId`를 사용한다.
- owner는 viewer visibility와 무관하게 Active Post를 삭제할 수 있고, DELETED 반복은 동일 payload/no post-commit, other owner는 `PERMISSION_DENIED`, missing은 `NOT_FOUND`여야 한다.
- GraphQL payload의 `postId`와 nullable `repostSource`를 유지한다.
- pure Repost만 최초 Tombstone 전이 후 삭제된 Repost row의 `post.id`를 Notification `sourceId`로 사용해 post-commit Repost Notification cleanup을 수행하며, 실패를 격리한다. ordinary Post/Quote/reply는 대상이 아니다.
- Post의 viewer-independent Reaction count 계약을 변경하지 않는다.

**Verification**

- 기존 GraphQL/core regression으로 guest·author·established follower·권한 없는 viewer, hidden/deleted Post, PostContent direct ID와 기존 목록 pagination 결과를 확인한다.
- owner visibility-independent Active 삭제, Tombstone state/deletedAt, DELETED 반복의 동일 payload/no post-commit, other-owner/missing 오류를 확인한다.
- `postId`/`repostSource` payload와 pure Repost Notification cleanup·실패 격리, ordinary/Quote/reply 제외를 확인한다.
- 구현 diff가 operation session/actor GUC/role 통합과 무관함을 self-review한다.

- [x] 2.1 기존 application Post/PostContent authorization/visibility, eligibility, owner와 list/pagination 경로를 유지한 채 GraphQL 회귀를 실행한다.
- [x] 2.2 owner의 visibility-independent Active Tombstone UPDATE, DELETED 반복 payload/no post-commit, other-owner `PERMISSION_DENIED`, missing `NOT_FOUND` 회귀를 통과시킨다.
- [x] 2.3 GraphQL `postId`/`repostSource`, pure Repost Notification cleanup·failure isolation과 ordinary/Quote/reply 제외 회귀를 통과시킨다.
- [x] 2.4 RLS 제거 때문에 기존 resolver/selector predicate나 Post policy가 삭제·재구현되지 않았는지 변경 범위를 검토한다.

## 3. PROD-777 obsolete change archive와 canonical post sync

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `memory/issue-openspec-workflow.md`
- PROD-777

**Deliverable**

PROD-777이 obsolete active change/delta의 history 보존, 새 `post` delta의 canonical sync, 구현·검증·Ready PR handoff와 이 change의 정상 archive를 모두 소유한다. production 실행은 별도 승인 대기로 남는다.

**Guardrails**

- obsolete `apply-graphql-post-viewer-rls-policies` artifact를 소급 수정하거나 삭제하지 않는다.
- 새 `post` delta는 구현·검증 완료 후 정상 archive하여 canonical `openspec/specs/post/spec.md`에 sync한다.
- CI, migration replay, 비운영 catalog/GraphQL 검증과 OpenSpec strict validation을 production 적용이나 live cutover 증거로 과장하지 않는다.
- 모든 선언된 구현·검증 task와 canonical sync가 끝나기 전 새 change를 archive하지 않는다.

**Verification**

- `openspec validate remove-post-graphql-row-level-security --strict`가 성공한다.
- PR 본문과 Linear PROD-777에 changed scope, 검증 결과, 제외 범위, supersede 관계와 archive owner를 기록한다.
- canonical `post` spec sync 후 새 change를 정상 archive하고 archive 결과를 확인한다.

- [ ] 3.1 strict OpenSpec validation과 repository checks 결과를 기록하고 구현 PR을 Ready 상태로 handoff한다.
- [ ] 3.2 구현 완료 후 `post` delta와 canonical `openspec/specs/post/spec.md`의 sync를 확인하고 old change artifact를 수정하지 않는다.
- [ ] 3.3 PROD-777이 전체 구현·검증·canonical sync 완료를 확인한 뒤 새 change를 정상 archive한다.
