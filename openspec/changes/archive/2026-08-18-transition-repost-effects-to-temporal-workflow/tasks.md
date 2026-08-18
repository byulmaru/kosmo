## 1. 공용 Repost 저장 경계

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-401`, `PROD-495`, `PROD-725`

**Deliverable**

Local과 ActivityPub 입력을 모두 받는 하나의 public `repostPost` action이 자체 transaction에서 Repost를 저장하고,
ActivityPub 입력이면 기존 `ActivityPubPosts` mapping도 함께 저장·갱신한다.

**Guardrails**

- Local·ActivityPub input의 Source visibility, derived visibility와 duplicate/concurrent 결과를 기존 계약대로 유지한다.
- ActivityPub mapping은 일반 `createPost`와 같은 저장 경계에 두되 별도 materialization action·public transaction helper를 만들지 않는다.
- PROD-495의 URI identity, current generation replacement, duplicate/no-op과 no-lock semantics를 변경하지 않는다.
- Workflow Activity에서 mapping이나 domain Post를 새로 저장하지 않는다.

**Verification**

- Core test가 Local/AP input, 최초 create, duplicate, current generation replacement, URI collision과 rollback을 검증한다.
- affected Core typecheck/lint와 focused DB test 결과를 기록한다.

- [x] 1.1 public `repostPost` input union과 AP mapping 저장을 구현한다.
- [x] 1.2 PROD-495 identity/generation/no-lock regression을 검증한다.

## 2. ActivityPub caller 경계

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `PROD-495`, `PROD-677`, `PROD-725`

**Deliverable**

Verified Announce는 공용 `repostPost`를 호출하고, verified Undo는 read-only mapping/actor resolution 뒤 공용
`deletePost`를 호출한다.

**Guardrails**

- Fedify가 domain Repost transaction handle이나 `postCommit`을 전달하지 않는다.
- 별도 ActivityPub materialization/Undo action을 만들거나 유지하지 않는다.
- Undo mapping lookup과 Tombstone transition을 하나의 caller-owned atomic transaction이라고 주장하지 않는다.
- ActivityPub-origin transition은 outbound echo를 만들지 않는다.

**Verification**

- Announce/Undo integration test가 actor·URI 검증, current generation, superseded Undo, duplicate와 echo suppression을 검증한다.
- AP rejection과 committed delete result가 기존 acknowledgement 경계를 유지하는지 확인한다.

- [x] 2.1 Announce caller를 공용 `repostPost` input으로 연결한다.
- [x] 2.2 Undo caller를 read-only resolution 후 공용 `deletePost`로 연결한다.

## 3. Core commit 뒤 Workflow start

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `PROD-677`, `PROD-722`, `PROD-725`

**Deliverable**

Core가 최초 Repost create와 최초 Post/Repost Tombstone commit 뒤 event-specific Workflow start를 소유하고,
duplicate/no-op/rollback에는 start하지 않는다.

**Guardrails**

- Repost create는 `post-repost:{postId}`, Content-bearing delete는 `post-delete:{postId}`, pure Repost delete는
  `repost-delete:{postId}`를 사용한다.
- 모든 신규 Workflow input은 `{ postId, origin }`이고 relation discriminator나 serialized snapshot을 넣지 않는다.
- commit 뒤 start 실패는 committed domain result와 caller 성공을 바꾸지 않는다.
- 기존 Post Create type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`를 변경하지 않는다.

**Verification**

- Core test가 최초 transition, duplicate/no-op, rollback, stable start options와 start failure isolation을 검증한다.
- Delete 결과 payload와 ActivityPub origin echo suppression 회귀를 확인한다.

- [x] 3.1 Repost create와 common delete의 Workflow start policy를 구현한다.
- [x] 3.2 start failure/duplicate start과 caller 성공 격리 테스트를 추가한다.

## 4. Effects Workflow와 Activity

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `PROD-725`

**Deliverable**

Repost create, Post Delete와 Repost Delete Workflow가 Notification과 Local-origin queue handoff를 독립 Activity로
재시도한다.

**Guardrails**

- Repost create는 Notification create와 Local Announce, Repost Delete는 Notification cleanup과 Local Undo, Post
  Delete는 Local Delete(Note)만 적용한다.
- ActivityPub origin에서는 outbound Announce/Delete/Undo를 적용하지 않는다.
- queue acceptance까지만 Activity가 책임지고 remote retry/ordering은 Fedify에 남긴다.
- Notification create/delete 경합을 위해 `FOR UPDATE`나 row lock을 추가하지 않는다.

**Verification**

- Activity retry, idempotency, independent terminal failure, no-op와 queue acknowledgement semantics를 검증한다.
- Notification unavailable predicate와 기존 canonical producer 재사용을 확인한다.

- [x] 4.1 event별 Workflow와 Activity를 구현한다.
- [x] 4.2 Activity retry/independent effects/echo suppression 테스트를 추가한다.

## 5. Singleton Worker registry

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-722`, `PROD-725`

**Deliverable**

하나의 process-global Worker host와 task queue에 기존 Post Create 및 새 Repost/Delete business source를 compile-time
고정 registry로 등록한다.

**Guardrails**

- optional/empty registration, test-only business export, generic registry builder와 두 번째 Worker host를 추가하지 않는다.
- Worker credential, workload activation, health foundation과 production rollout을 변경하지 않는다.

**Verification**

- Worker build/typecheck가 registry와 workflow source를 확인한다.
- 기존 Post Create external type/ID가 유지되는지 정적 검사를 수행한다.

- [x] 5.1 fixed Worker registry에 event별 source를 조립한다.
- [x] 5.2 Worker registration과 existing Post Create compatibility를 검증한다.

## 6. Existing add-post-reposts artifacts 동기화

**Authority / Provenance**

- `openspec/changes/add-post-reposts`
- `PROD-669`, `PROD-725`

**Deliverable**

기존 Repost capability 문서가 process-local `postCommit`을 현재 Temporal effects ownership으로 잘못 남기지 않도록
정렬한다.

**Guardrails**

- Repost 제품 관계·Notification Best Effort·hidden unavailable 계약을 변경하지 않는다.
- PROD-725의 implementation boundary를 add-post-reposts의 새 제품 요구사항으로 확장하지 않는다.

**Verification**

- active decision/design와 PROD-725 proposal의 범위·소유권·archive 책임이 일치하는지 확인한다.

- [x] 6.1 superseded process-local decision과 active Temporal decision을 정합화한다.

## 7. 통합 검증과 archive gate

**Authority / Provenance**

- `memory/issue-openspec-workflow.md`
- `memory/commit-pr.md`
- `PROD-725`

**Deliverable**

코드·테스트·OpenSpec strict validation과 PR/CI evidence를 분리해 기록하고, 전체 구현 slice가 끝난 뒤에만 change를
archive할 수 있는 상태를 만든다.

**Guardrails**

- PR/CI와 dev-live evidence를 production cutover 증거로 취급하지 않는다.
- production sync/apply/cutover/live verification은 별도 승인 없이 수행하지 않는다.
- 통합 검증이 남아 있으면 tasks를 완료 처리하거나 archive하지 않는다.

**Verification**

- affected package checks, focused integration checks와 `openspec validate --strict` 결과를 기록한다.

- [x] 7.1 affected checks와 OpenSpec strict validation을 통과시킨다.
- [x] 7.2 전체 change 완료·archive 여부를 별도 판단한다.
