## 1. PROD-720 Pair lifecycle domain transition

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- PROD-720
- 2026-08-25 pair lifecycle design approval

**Deliverable**

하나의 방향성 Profile pair에 대한 Follow initial policy, pending request terminal transition과 exact-row retry reconstruction을 pair lifecycle contract로 구현한다.

**Guardrails**

- state는 `INITIAL`, `PENDING`, `ESTABLISHED`, `REJECTED`, `CANCELLED`로 제한하고 Established 이후 Unfollow를 이 lifecycle에 넣지 않는다.
- follower/followee 순서, 기존 domain policy, uniqueness, exact-row mutation과 count 원자성을 보존한다.
- domain `operationId`, command receipt, generic ledger와 pending expiry를 추가하지 않는다.
- Activity payload는 JSON-serializable IDs/status만 사용한다.

**Verification**

- open-policy Follow와 approval-required Follow의 state transition
- approve/accept/reject/cancel/undo의 exact expected-row 처리
- Activity completion loss 뒤 DB state 및 deterministic candidate/expected ID 기반 retry reconstruction
- stale old-generation command, duplicate/no-op 뒤 terminal 재시도, refollow와 rollback/concurrency test

- [x] 1.1 pair key, lifecycle command/result DTO와 transaction-only domain executor를 구현한다.
- [x] 1.2 candidate domain row ID 배정, expected row validation과 DB state retry reconstruction을 구현·검증한다.
- [x] 1.3 미배포 draft operation receipt schema/migration과 operation-scoped helper를 제거하고 migration/privilege 검증을 갱신한다.

## 2. PROD-720 Pair lifecycle Temporal Workflow

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- PROD-720
- 2026-08-25 pair lifecycle design approval

**Deliverable**

결정적 pair Workflow가 UWS initial/terminal Update를 하나씩 처리하고, pending lifetime에는 대기하며, terminal transition 뒤 FIFO effects를 drain하고 종료한다.

**Guardrails**

- `workflowId=profile-follow-pair:{followerProfileId}:{followeeProfileId}`를 사용한다.
- 실행 중에는 `USE_EXISTING`, 종료된 동일 ID에는 `ALLOW_DUPLICATE`를 사용한다.
- handler는 transaction commit 결과 뒤 즉시 반환하고 effects/pending lifetime을 기다리지 않는다.
- one-in-flight Update admission, FIFO effect batches, sibling settlement과 terminal queue drain을 보장한다.
- pending effect terminal failure는 기록하되 다음 terminal Update를 막지 않는다. terminal queue를 모두 drain한 뒤에만 complete/fail한다.
- PENDING Workflow에 expiry를 적용하지 않는다. 잘못 직접 시작된 INITIAL만 별도 bounded admission guard를 가질 수 있다.

**Verification**

- real Temporal UWS에서 initial Follow result가 effects보다 먼저 반환되는지 검증
- delayed transaction 동안 duplicate/concurrent Update가 하나만 실행되는지 검증
- pending effect failure 뒤 approve/reject/cancel/undo가 계속 처리되는지 검증
- terminal queue sibling retry/failure, Worker restart/replay와 final complete/fail 검증
- exact-row removal transaction Activity retry 소진 시 Update와 Workflow가 함께 실패하는지 검증

- [x] 2.1 pair lifecycle Workflow, state machine, one-in-flight handler와 orphan INITIAL guard를 구현한다.
- [x] 2.2 transition effect batch FIFO queue, ordered phase의 순차 drain, 기존 effect Activity/stable source identity 재사용, Activity 수와 관계없는 공용 `settleEffects` 정산과 failure recording을 구현한다. 별도 create/delete Effects Workflow는 만들지 않는다.
- [x] 2.3 existing pending request read-only ID Activity와 terminal Update-with-Start bootstrap을 구현한다.
- [x] 2.4 production Worker registry에 pair·exact-row removal Workflow와 필요한 Activities를 등록하고, main에 포함된 적 없는 standalone Follow Effects Workflow registration은 제거한다.

## 3. PROD-720 API·Fedify caller 전환

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- PROD-720
- 2026-08-25 pair lifecycle design approval

**Deliverable**

GraphQL과 verified ActivityPub ingress가 방향성 pair ID와 expected row identity로 Follow lifecycle command를 실행하고, Unfollow는 별도 short command로 실행한다.

**Guardrails**

- session/membership와 signature/actor/object/recipient 검증은 ingress에 남긴다.
- inbound Follow direct Accept handoff를 이동하지 않는다.
- ActivityPub-origin transition은 outbound Follow/Undo echo를 만들지 않는다.
- pair Workflow의 routing 위험은 expected request/follow row exact check로 제한한다.

**Verification**

- API Follow, approve, reject, cancel, unfollow success/error mapping
- existing pending request terminal command의 lazy bootstrap
- Fedify Follow/Accept/Reject/Undo, direct Accept와 no-echo
- stale expected row 및 refollow ABA guard

- [x] 3.1 공용 Temporal client 경계가 결정적 pair Workflow ID와 UWS `USE_EXISTING`/`ALLOW_DUPLICATE` 정책을 소유하게 한다.
- [x] 3.2 GraphQL Follow·Follow Request caller를 pair lifecycle Update 경계로 전환하고 Unfollow short command를 분리한다.
- [x] 3.3 verified ActivityPub Follow/Accept/Reject/Undo caller를 같은 pair lifecycle로 전환하고 direct Accept/no-echo를 보존한다.
- [x] 3.4 API/Fedify 통합 검증과 existing pending bootstrap fixture를 갱신한다.

## 4. PROD-720 전체 통합·문서·PR 검증

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- PROD-720
- 2026-08-25 pair lifecycle design approval

**Deliverable**

Canonical 계약, delta specs, pair lifecycle implementation과 real Temporal validation이 같은 수명·identity·failure semantics를 설명한다. Active specs 반영은 archive gate가 소유한다.

**Guardrails**

- production rollout과 Web E2E 병렬화는 포함하지 않는다.
- merge/production과 local/CI validation을 구분한다.
- 새 설계가 구현되지 않은 동안 기존 implementation task를 완료로 표시하지 않는다.
- OpenSpec archive는 모든 implementation slice와 cross-slice 검증이 완료된 뒤 담당자가 수행한다.

**Verification**

- canonical docs, Linear PROD-720, delta specs와 decisions 정합성 검토
- focused Core/API/Fedify/Worker test
- full Web E2E with real Temporal server/Worker
- lint, type, prettier, strict OpenSpec, migration smoke와 diff review

- [x] 4.1 canonical follow docs, delta specs와 PROD-720 계약을 pair lifecycle로 동기화한다.
- [x] 4.2 focused 및 full Web real Temporal lifecycle/effects validation을 통과시킨다.
- [x] 4.3 lint, type, prettier, strict OpenSpec, migration과 diff 검증을 통과시킨다.
