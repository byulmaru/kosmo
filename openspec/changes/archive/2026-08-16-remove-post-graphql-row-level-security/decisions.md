## Context

이 기록은 ADR 0024와 PROD-777이 확정한 `post` capability의 GraphQL application authorization/visibility 경계, Post/PostContent RLS 철회, Tombstone deletion contract와 obsolete change 이력 처리를 구현 전에 고정한다. `apply-graphql-post-viewer-rls-policies`의 당시 RLS 계약은 obsolete active change/delta로 보존하되 현재 결정의 authority가 아니다.

## Decision Records

### GraphQL Post authorization과 visibility는 중앙 application policy가 집행한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/policies/post-list.md`, PROD-777
- Status: Active
- Context / Problem: Post/PostContent authorization, visibility, eligibility, owner와 목록 정책은 이미 application predicate가 소유한다. DB session actor 상태에 같은 규칙을 추가하면 요청별 SNS policy가 두 계층에 중복된다.
- Decision Outcome: GraphQL Post authorization과 visibility는 중앙 application policy가 집행한다. PostgreSQL RLS와 actor GUC는 이 결과를 만들기 위한 요구사항이 아니다. 기존 viewer/list/pagination/PostContent 결과는 그대로 보존한다.
- Alternatives Considered: `kosmo_api` RLS를 계속 유지하거나 application predicate를 RLS predicate로 대체하는 선택은 ADR 0024의 경계와 중복 방지 목적에 맞지 않으므로 선택하지 않는다.
- Consequences: Post/PostContent RLS를 제거해도 resolver/selector의 기존 visibility, eligibility, owner와 목록 조건을 삭제·단순화할 수 없다.
- Confirmation / Follow-up: PROD-777 구현 PR에서 기존 GraphQL viewer/list/PostContent 회귀와 RLS/actor GUC 비의존 경계를 확인한다.

### Post/PostContent RLS는 새 compensating forward migration으로 제거한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `memory/database-migrations.md`, PROD-777
- Status: Active
- Context / Problem: Post/PostContent RLS migration은 `main`에 병합되어 있으므로 기존 migration history를 수정하면 replay와 배포 이력이 깨진다.
- Decision Outcome: 기존 RLS migration, snapshot과 적용 history는 수정·삭제하지 않고 새 migration으로 `post`와 `post_content`의 RLS를 disable하며 네 기존 policy를 drop한다. 일반 object ACL, owner ownership과 다른 table 정책은 보존한다.
- Alternatives Considered: 기존 migration을 squash·수정하거나 catalog에서 수동으로만 제거하는 방식은 forward history와 재현 가능한 schema를 보존하지 못하므로 선택하지 않는다.
- Consequences: implementation PR은 metadata와 새 migration을 함께 제공하고 blank replay 및 catalog 검증을 통과해야 한다.
- Confirmation / Follow-up: `relrowsecurity`, 네 policy 부재, migration replay와 object ACL을 정확한 비운영 revision에서 확인한다. production 적용은 별도 승인을 요구한다.

### Post 삭제는 owner-scoped Tombstone UPDATE와 기존 payload를 유지한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, PROD-777
- Status: Active
- Context / Problem: Post 삭제는 row를 물리 삭제하는 동작이 아니라 owner가 Active row를 Tombstone으로 전환하고 후속 effect를 실행하는 현재 contract다. RLS 철회가 이 transaction과 payload를 바꾸면 owner cleanup과 Repost lifecycle이 깨진다.
- Decision Outcome: owner는 viewer visibility와 무관하게 Active Post를 `UPDATE post SET state = DELETED, deleted_at = now() ... RETURNING currentContentId, id, replyParentId, repostSourceId`로 전환한다. GraphQL payload는 `postId`와 nullable `repostSource`를 제공한다. DELETED 반복은 같은 payload를 반환하고 최초 `deleted_at`과 no-post-commit 의미를 유지하며, 다른 owner와 missing Post는 각각 `PERMISSION_DENIED`와 `NOT_FOUND`로 전환하지 않는다.
- Alternatives Considered: physical DELETE, owner에게 visibility를 다시 요구하는 방식, DELETED 반복을 오류로 바꾸는 방식과 payload 재설계는 현재 Post domain/GraphQL contract에 맞지 않으므로 선택하지 않는다.
- Consequences: ordinary Post, Quote와 reply는 pure Repost Notification cleanup 대상이 아니며, pure Repost만 처음 Tombstone 전이 후 삭제된 Repost row의 `post.id`를 Notification `sourceId`로 사용해 post-commit cleanup을 한 번 시도한다. Cleanup 실패는 로그로 격리하고 Tombstone과 GraphQL 성공을 바꾸지 않는다.
- Confirmation / Follow-up: owner visibility-independent deletion, idempotent repeat/no post-commit, owner/missing error, `postId`/`repostSource` payload와 pure Repost cleanup/failure isolation을 PROD-777 회귀로 확인한다.

### 이 change의 실행 범위는 Post/PostContent RLS 철회와 `post` delta로 한정한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, PROD-777
- Status: Active
- Context / Problem: ADR 0024는 Post/PostContent RLS 철회와 operation session·actor GUC·runtime role 정리를 서로 다른 구현 slice로 분리한다.
- Decision Outcome: 이 change는 `post` capability의 application policy 경계와 Post/PostContent RLS 철회만 다룬다. 다른 table RLS, Worker/Fedify/Temporal ingress, Post application policy 재설계, operation session·`ctx.db`·actor GUC 제거, runtime role 통합·credential cutover는 포함하지 않는다.
- Alternatives Considered: 한 migration 또는 한 PR에서 전체 GraphQL DB session과 role 구조까지 함께 정리하는 선택은 독립 rollout·검증 경계를 합치므로 선택하지 않는다.
- Consequences: PROD-777 구현은 후속 PROD-779/PROD-780 코드를 선점하지 않으며, 현재 operation session이 필요한 동안 관련 runtime 설정을 제거하지 않는다.
- Confirmation / Follow-up: PR self-review와 changed-file scope로 제외 범위를 확인하고 후속 이슈 의존성을 Linear에 유지한다.

### obsolete Post RLS change는 history를 보존한 뒤 archive한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/issue-openspec-workflow.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, PROD-777
- Status: Active
- Context / Problem: 완료된 `apply-graphql-post-viewer-rls-policies`는 현재 방향과 맞지 않는 obsolete active change/delta지만, 당시 구현 이력과 provenance는 보존해야 한다.
- Decision Outcome: PROD-777 owner는 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`를 실행해 obsolete delta를 active 목록에서 제거하고 history를 보존한다. 새 `post` delta는 이 change 완료 후 정상 archive로 canonical post spec에 sync한다.
- Alternatives Considered: obsolete change를 삭제하거나 기존 artifact를 소급 수정하는 방식은 provenance를 잃고 history를 재현할 수 없으므로 선택하지 않는다.
- Consequences: old change archive와 새 change archive는 별도 completion step이며, PROD-777이 둘의 순서·검증·archive evidence를 소유한다.
- Confirmation / Follow-up: 구현 완료 시 archive command 결과, canonical `post` spec sync와 strict validation을 Linear/PR 완료 evidence에 기록한다.

### 기존 GraphQL Post/PostContent RLS viewer·transition 결정은 application policy 결정으로 대체한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-713, PROD-777
- Status: Superseded
- Context / Problem: PROD-713이 정의한 `kosmo_api` viewer RLS와 Temporal 전환 중 permissive DML policy는 Post/PostContent GraphQL 행 경계를 DB에 두는 당시 방향이었다. ADR 0024와 PROD-777은 그 방향을 철회한다.
- Decision Outcome: 당시의 Post/PostContent RLS viewer/transition 계약은 중앙 application authorization/visibility와 compensating migration 결정으로 대체한다. 당시 migration과 obsolete active change/delta는 재현 가능한 history로 보존한다.
- Alternatives Considered: 기존 RLS contract를 계속 active로 유지하거나 새 policy를 추가로 쌓는 선택은 현재 canonical 경계와 중복되므로 선택하지 않는다.
- Consequences: `apply-graphql-post-viewer-rls-policies`는 지정 archive 명령으로 history를 보존한 뒤 active 목록에서 제거되며, 새 `post` delta가 현재 canonical spec을 소유한다.
- Confirmation / Follow-up: 구현 완료 뒤 old change archive와 PROD-777의 supersede 관계, canonical `post` spec sync 및 archive evidence를 확인한다.

## Remaining Decisions

- 없음. operation session·actor context 제거와 runtime role 통합은 각각 PROD-779/PROD-780 후속 contract에서 결정한다.

## Superseded Decisions

- PROD-713의 `kosmo_api` Post/PostContent viewer RLS, permissive transition DML과 actor-session enforcement 결정은 중앙 application policy 및 새 compensating migration 결정으로 대체되었다. 기존 migration·artifact는 history로 보존하고 현재 구현 근거로 사용하지 않는다.
