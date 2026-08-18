## 1. Repost의 public action 경계

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-401`, `PROD-495`, `PROD-725`
- Status: Active
- Decision Outcome: Local과 ActivityPub Repost는 하나의 public `repostPost` action을 사용한다. action은 `origin = LOCAL | ACTIVITYPUB` 입력을 받고 자체 transaction에서 Repost를 저장한다. ActivityPub 입력은 검증된 Announce URI와 delivery metadata를 전달하고 기존 `ActivityPubPosts` mapping을 일반 `createPost`와 같은 저장 경계에서 처리한다.
- Alternatives Considered: ActivityPub 전용 materialize action, transaction 내부 helper를 public API로 노출, caller-owned transaction
- Consequences: caller는 DB handle을 전달하지 않으며 Local/ActivityPub이 같은 Repost 정책과 결과 경계를 공유한다. ActivityPub mapping의 저장 위치만 Post 생성과 일관되게 맞추고 PROD-495의 관찰 가능한 semantics는 유지한다.

## 2. Undo는 read-only resolution 뒤 공용 deletePost를 사용한다

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-495`, `PROD-677`, `PROD-725`
- Status: Active
- Decision Outcome: Fedify는 verified actor와 current Announce URI를 read-only로 확인하고, 조건을 만족하면 공용 `deletePost`에 `postId`, actor identity와 `origin = ACTIVITYPUB`을 전달한다. 별도 Undo 전용 Core action이나 caller-owned transaction을 추가하지 않는다.
- Alternatives Considered: Undo 전용 Core action, mapping resolution과 Tombstone을 하나의 caller transaction으로 조립, Workflow Activity에서 domain mutation 수행
- Consequences: mapping lookup과 domain transition의 선후관계는 기존 PROD-495 semantics를 유지하며, 이 change가 새 atomicity·lock 보장을 주장하지 않는다. 최초 Tombstone commit 뒤 Repost Delete Workflow가 effects를 맡는다.

## 3. 후속 효과는 event별 Temporal Workflow에서 수행한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-677`, `PROD-722`, `PROD-725`
- Status: Active
- Decision Outcome: 새 Repost는 `postRepostWorkflow`/`post-repost:{postId}`, Content-bearing Post 삭제는 `postDeleteWorkflow`/`post-delete:{postId}`, pure Repost 삭제는 `repostDeleteWorkflow`/`repost-delete:{postId}`를 사용한다. 각 input은 `{ postId, origin }`이다. Notification과 Local-origin queue handoff는 독립 Activity로 재시도하고 ActivityPub-origin outbound echo는 억제한다.
- Alternatives Considered: process-local `postCommit`, 하나의 공통 delete Workflow, transaction Activity, outbox/command receipt
- Consequences: commit 뒤 Workflow start gap과 효과 terminal failure는 committed domain 결과와 분리된다. Notification Best Effort semantics와 no-lock 정책은 유지한다.

## 4. 기존 Worker와 Post Create 외부 계약을 유지한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`, `PROD-725`
- Status: Active
- Decision Outcome: 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`를 보존한다. 하나의 process-global Worker host와 task queue에 Repost/Post Delete/Repost Delete Workflow·Activity를 compile-time 고정 registry로 등록한다.
- Alternatives Considered: Workflow별 Worker host/task queue, optional registration, generic runtime registry builder, test-only business registration
- Consequences: Worker runtime 경계는 하나로 유지되고 event별 source만 정적으로 추가된다. Worker credential/workload rollout은 이 change가 결정하지 않는다.

## 5. 명시되지 않은 복구·원자성 계약은 추가하지 않는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-495`, `PROD-725`
- Status: Active
- Decision Outcome: PROD-495가 관찰 가능하게 정의한 ActivityPub identity, current generation 교체, duplicate/no-op 및 새 lock을 추가하지 않는 동작을 보존한다. PROD-725에 명시되지 않은 mapping atomicity, transaction Activity, proposed ID, receipt, outbox, reconciliation 또는 자동 backfill은 구현 계약으로 만들지 않는다.
- Alternatives Considered: 구현 중 발견한 추론을 OpenSpec 계약으로 승격
- Consequences: 구현자는 미정 동작을 임의로 확정하지 않고 Issue/Canonical/Linear gate로 되돌린다. 이번 change는 Temporal effects 전환에 필요한 경계만 소유한다.
