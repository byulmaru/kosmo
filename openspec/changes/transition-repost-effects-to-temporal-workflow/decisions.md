## Context

이 기록은 PROD-725·PROD-677과 Post·Notification canonical 문서가 확정한 Repost 및 공통 Post Delete
transaction·후속 효과 경계를 proposal, capability delta와 구현 지침으로 구체화한 결정만 담는다. 기존
`add-post-reposts` change의 process-local `postCommit` 계약은 최신 Linear authority와 충돌하므로 이 change에서
동기화한다.

## Decision Records

### command가 아니라 committed transition의 효과만 Workflow로 실행한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `PROD-725`
- Status: Active
- Context / Problem: Repost 또는 Post Delete transaction까지 Activity로 이동하면 기존 동기 GraphQL·ActivityPub 결과와 Core domain policy를 Temporal retry 의미에 결합한다.
- Decision Outcome: Core가 Repost create와 `deletePost` transaction을 동기적으로 commit한다. 최초 Repost 생성에는 Repost Workflow를, `deletePost`의 모든 최초 Tombstone에는 공통 Delete Workflow를 시작한다. Delete input의 `effectKind`는 commit된 관계 조합에서 `CONTENT`(Current Content가 있는 일반 Post·Reply·Quote) 또는 `REPOST`(Content 없이 Repost Source만 있는 순수 Repost)로 도출한다. duplicate·no-op·rollback은 Workflow를 시작하지 않는다.
- Alternatives Considered: transaction Activity, proposed Repost ID, command receipt와 outbox는 PROD-725 범위에서 명시적으로 제외됐다.
- Consequences: commit→start gap에서 효과가 유실될 수 있으나 committed Repost와 caller 성공은 유지한다. caller database handle과 반환형 `postCommit`은 제거한다.
- Confirmation / Follow-up: Core/API/Fedify test에서 ordinary Content와 Repost를 포함한 rollback·duplicate·no-op의 no-start와 start failure 격리를 확인한다.

### 공통 `postDeleteWorkflow`가 관계 기반 Delete 효과를 선택한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-677`, `PROD-725`
- Status: Active
- Context / Problem: `deletePost`는 ordinary Post·Reply·Quote와 pure Repost를 모두 Tombstone으로 전이하는 공통 domain 진입점인데, pure Repost만 별도 Delete Workflow로 보내면 Workflow 이름과 실제 삭제 사건 경계가 어긋난다.
- Decision Outcome: 모든 최초 Tombstone commit은 type `postDeleteWorkflow`, ID `post-delete:{postId}`의 공통 Delete Workflow를 시작한다. Input은 `{ postId, origin, effectKind }`이며 `effectKind`는 committed relation shape에서 산출한다. `CONTENT`와 `origin=LOCAL`은 canonical Delete(Note) handoff를, `REPOST`는 Repost Notification cleanup을 수행하고 `origin=LOCAL`이면 canonical Undo(Announce) handoff를 추가한다. `origin=ACTIVITYPUB`에서는 어떤 outbound echo도 수행하지 않는다.
- Alternatives Considered: ordinary Delete와 Repost Delete를 별도 Workflow로 유지하는 방식은 공통 `deletePost` 사건을 구조별 runtime 경계로 다시 나누므로 채택하지 않았다. Workflow Activity에서 관계를 추론하거나 Tombstone을 다시 분류하는 방식 대신 committed transition 결과가 `effectKind`를 전달한다.
- Consequences: Delete Workflow는 Content와 Repost 효과를 하나의 stable identity로 수렴시키며, Repost Tombstone에만 필요한 actor/source/createdAt/visibility projection으로 Undo를 만든다. ordinary delete 적용과 검증 증거는 PROD-677이, 공통 구현·통합은 PROD-725가 소유한다.
- Confirmation / Follow-up: Content·Reply·Quote·pure Repost의 Local 삭제, ActivityPub-origin no-echo, duplicate/no-op 및 Workflow input effectKind를 통합 검증한다.

### 배포된 Post Create Workflow 외부 identity를 유지한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-722`, `PROD-725`, `docs/architecture/core-services.md`
- Status: Active
- Context / Problem: PROD-725가 Worker business registration을 확장하더라도 이미 배포된 Post Create Workflow의 type과 ID를 바꾸면 기존 caller와 실행 history의 Temporal 호환성이 깨진다.
- Decision Outcome: 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 그대로 유지한다. Repost에는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Delete에는 type `postDeleteWorkflow`·ID `post-delete:{postId}`를 새로 사용한다.
- Alternatives Considered: Create Workflow를 새 event naming으로 rename하거나 기존 ID를 event registry 변경에 맞춰 재생성하는 방식은 호환성을 깨므로 채택하지 않았다.
- Consequences: Worker는 기존 Post Create source와 registry slot을 보존하면서 Repost·Delete source를 추가한다. 세 event는 하나의 host/task queue를 공유하지만 Create 외부 identity는 변하지 않는다.
- Confirmation / Follow-up: Worker registration과 Post Create start-options test에서 기존 type·ID가 동일하게 유지되는지 확인한다.

### verified Announce와 Undo의 mapping을 Core Repost transaction이 함께 소유한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-725`
- Status: Active
- Context / Problem: Fedify caller가 `repostPost(tx)` 또는 `deletePost(tx)`와 ActivityPub mapping 저장·검증을 조립하면 database handle을 제거할 수 없고 원자성 소유자가 분산된다.
- Decision Outcome: specialized Core action은 검증된 actor/source/activity identity를 받아 Repost 상태와 current ActivityPub mapping을 같은 transaction에서 저장한다. Fedify ingress는 protocol 검증·관측을 유지한다.
- Alternatives Considered: mapping을 Workflow Activity에서 저장하거나 caller transaction에 유지하는 방식은 state transaction과 effects 경계를 분리하지 못하므로 채택하지 않았다.
- Consequences: Core input은 Fedify request context나 vocab 객체가 아니라 serializable identity·timestamp만 받는다. 기존 mapping uniqueness와 current-generation semantics는 유지한다.
- Confirmation / Follow-up: inbound Announce·Undo duplicate, URI collision, superseded generation과 rollback 통합 검증을 유지한다.

### Repost 생성과 공통 Post Delete는 event-specific stable Workflow identity를 사용한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-725`
- Status: Active
- Context / Problem: Repost 생성 뒤 같은 Post identity가 Tombstone으로 전이되므로 Post ID만 사용하는 종료 Workflow ID를 Repost와 Delete event가 공유할 수 없다. 반면 Delete 사건 자체는 ordinary Post·Reply·Quote와 pure Repost 모두의 공통 `deletePost` transition이다.
- Decision Outcome: Repost 생성은 Repost Workflow, 모든 Post 삭제는 공통 Delete Workflow로 분리하고 각 Workflow ID를 committed Post ID와 event 경계에서 파생한다. 같은 event의 중복 start는 기존 execution으로 수렴하고 종료된 ID는 재사용하지 않는다. Repost Workflow input은 `{ postId, origin }`, Delete Workflow input은 `{ postId, origin, effectKind }`를 보존하며, Delete Activity는 Tombstone row에 남은 relation projection을 다시 읽어 Content Delete 또는 Repost Undo identity를 만든다.
- Alternatives Considered: Repost ID 하나의 Workflow를 장기 실행하거나 하나의 discriminated transition input으로 두 event를 합치는 방식은 event lifecycle과 retry 경계를 불필요하게 결합하므로 채택하지 않았다.
- Consequences: Tombstone 뒤 재Repost는 새 Repost identity와 새 Repost Workflow를 사용한다. Tombstone Repost의 보존 projection은 author Profile state와 독립적으로 local Undo identity를 제공하므로 Profile 비활성화만으로 Undo를 no-op하지 않는다. duplicate/no-op은 누락 효과 backfill 계기가 아니다.
- Confirmation / Follow-up: event별 start options 검증과 Repost→Content/Delete 또는 Repost/Delete→재Repost integration에서 identity 분리를 확인한다.

### Notification과 federation handoff는 독립 Activity이며 queue acceptance에서 성공한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-448`, `PROD-725`
- Status: Active
- Context / Problem: 한 효과를 먼저 await하면 terminal failure가 다른 효과 시도를 막고, Temporal Activity가 remote delivery까지 소유하면 Fedify MessageQueue의 retry·ordering 경계와 중복된다.
- Decision Outcome: accepted Workflow는 적용 가능한 Notification과 Fedify handoff Activity를 독립적으로 실행해 모두의 최종 결과를 수집한다. Fedify Activity 성공은 queue acceptance이고 remote retry·ordering은 Fedify가 소유한다. Notification은 canonical Best Effort projection과 unavailable 결과 숨김을 유지하며, create/delete 경합을 직렬화하기 위한 `FOR UPDATE` 또는 row lock을 추가하지 않는다.
- Alternatives Considered: 직렬 effects, Temporal에서 remote HTTP 직접 delivery, custom relay와 Notification create/delete의 `FOR UPDATE`·row lock 직렬화는 효과 독립성·기존 transport ownership 또는 Best Effort 성능 경계를 깨므로 채택하지 않았다.
- Consequences: queue acknowledgement가 모호하면 같은 canonical activity의 duplicate enqueue나 remote request가 가능하다. Notification create/delete 경합에서는 stale row가 남을 수 있지만 unavailable predicate가 모든 API surface에서 숨긴다. cross-system exactly-once는 보장하지 않는다.
- Confirmation / Follow-up: 한 Activity terminal failure 뒤 다른 Activity 실행, canonical identity retry와 queue acceptance 경계, stale Notification의 hidden unavailable 결과와 lock 없는 create/delete 경합을 검증한다.

### 하나의 Worker host에 domain별 고정 registration을 조립한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`, `PROD-725`
- Status: Active
- Context / Problem: Post Create 전용으로 보이는 현재 registration에 Repost와 Delete를 추가하면서 event별 host·task queue 또는 범용 startup abstraction을 만들 가능성이 있다.
- Decision Outcome: process-global Worker host와 task queue는 하나를 유지하고, Post Create/Repost/Delete event source의 Workflow·Activity를 production entrypoint의 compile-time registry에 정적으로 조립한다.
- Alternatives Considered: event별 Worker process와 task queue는 독립 운영 요구가 없고, optional registry builder는 이미 제거한 startup 복잡도를 되살리므로 채택하지 않았다.
- Consequences: Worker bundle은 여러 business Workflow를 포함하지만 lifecycle·health·shutdown owner는 계속 하나다. 새 event는 source module만 추가한다.
- Confirmation / Follow-up: Worker build와 registration test로 구현을 검증한다. dev에서 Post Create/Repost/Delete Workflow가 같은 Worker revision에 poll되는지는 merge 이후 rollout evidence로 별도 확인하며 OpenSpec completion이나 archive를 막지 않는다.

### Announce mapping 교체와 Undo 경합에 새 잠금을 추가하지 않는다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-725`
- Status: Active
- Context / Problem: current Announce URI 교체와 이전 Undo가 동시에 겹칠 때 완전한 순서를 만들기 위해 row/advisory lock 또는 serializable retry를 추가할 유인이 있다.
- Decision Outcome: 기존 unique constraint와 멱등 action 수렴을 유지하고 `FOR UPDATE`, advisory lock 또는 serializable retry를 새로 추가하지 않는다.
- Alternatives Considered: 강제 직렬화는 network·queue 효과와 무관한 domain transaction의 경합 비용과 복잡도를 높이며 PROD-725에서 요구되지 않는다.
- Consequences: 명확한 선후관계가 없는 교차 경합에서 새 Announce가 Active Repost를 남긴다고 보장하지 않는다. 이후 유효한 delivery는 기존 멱등 경로로 수렴한다.
- Confirmation / Follow-up: 기존 concurrent Announce·Undo integration 시나리오를 유지하고 새 lock query가 없는지 검토한다.

### Repost Notification base를 제공하는 parent change를 먼저 archive한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-389`, `PROD-725`
- Status: Active
- Context / Problem: canonical `notification` spec에는 아직 Repost 요구사항이 없고 active `add-post-reposts` delta가 이를 추가한다. PROD-725 change가 존재하지 않는 base requirement를 MODIFIED로 선언하면 archive 순서에 따라 validation과 최종 계약이 달라진다.
- Decision Outcome: `add-post-reposts`의 Notification delta를 PROD-725 retry 계약으로 먼저 동기화하고, 구현·통합 검증 뒤 `add-post-reposts`를 먼저 archive한다. 그 canonical base 위에서 이 change를 archive한다.
- Alternatives Considered: 두 active change가 같은 Repost Notification requirement를 각각 ADDED로 소유하면 중복 archive 충돌이 생기므로 채택하지 않았다.
- Consequences: 구현은 한 PR 또는 순차 PR로 수행할 수 있지만 OpenSpec completion과 archive는 두 단계다. 이 change만 먼저 archive하지 않는다.
- Confirmation / Follow-up: parent archive 뒤 canonical `notification` spec과 이 change를 strict validation하고 integration/archive owner를 명시한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `add-post-reposts`의 PROD-669 process-local `postCommit` 실행 경계는 2026-08-16 승인된 PROD-725 event-specific Repost/Delete Workflow 경계로 대체된다. Notification의 canonical Best Effort와 unavailable 결과 숨김 lifecycle은 유지된다.
