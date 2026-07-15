## Context

현재 main에는 local/remote 공통 `ProfileFollow`/`ProfileFollowRequest`, 저장 follow count, core follow action, remote actor materialization, Fedify send helper와 actor-scoped/shared inbox route가 있다. 반면 inbound correlation column과 Follow/Undo/Accept/Reject handler는 없다.

PROD-235와 구현 자식이 이 change의 source of truth다. PROD-323이 Follow Request를 pending-only로 확정했고, PROD-281이 relation/count transaction을 core service 책임으로 옮겼다. 닫힌 미병합 PR #232와 #234 및 기존 active change의 오래된 가정은 현재 계약이 아니며, PR #247 이후 inbox listener 경로는 새 registry 없이 싱글톤 federation에 activity handler를 등록할 수 있다.

## Goals / Non-Goals

**Goals:**

- shared change의 요구사항과 task를 Linear 구현 이슈에 일대일로 대응한다.
- inbound Follow의 first-wins identity를 유지하고 duplicate side effect를 막는다.
- request domain lifecycle과 ActivityPub protocol adapter를 분리한다.
- SUSPENDED 관계 보존과 UNRESPONSIVE reachability 복구를 명확히 구분한다.
- 공통 inbox route와 activity별 handler 책임을 분리해 remote-post 계약과 archive 순서 충돌을 만들지 않는다.

**Non-Goals:**

- 이 spec-only PR에서 코드, migration 또는 generated schema를 변경하는 일.
- remote-post Create validation, global receipt, PostContent/ProseMirror와 authenticated shared-inbox identity.
- delivery queue/retry/history, ActivityPub activity log.
- remote followers/following collection mirror.

## Implementation Guidance

### Current Constraints

- `ProfileFollow`와 `ProfileFollowRequest`는 follower/followee pair unique이며 request row의 존재 자체가 Pending이다.
- 저장 count는 established relation의 생성·삭제 transaction에서만 바뀌며 pending request는 count에 기여하지 않는다.
- `ProfileFollow.id`와 immutable `createdAt`이 outbound Follow identity와 generation을 파생할 수 있다.
- inbound remote Follow ID는 누락·재사용될 수 있으므로 actor/object 검증을 대체하지 않는다.
- Fedify `MemoryKvStore` idempotency는 process-local 최적화일 뿐 relation/request side effect의 durable source of truth가 아니다.

### Recommended Approach

#### PROD-243/272 pending-only boundary

PROD-243은 ActivityPub recipient·actor·object 검증 뒤 remote pending request 생성과 inbound correlation을 소유한다. PROD-272는 local request 생성과 local/remote 공통 read/approve/reject/cancel lifecycle을 소유한다. 두 구현은 기존 pending-only row와 actor pair uniqueness를 공유하지만 서로의 구현 또는 병합을 기다리지 않는다. 승인·거절 ActivityPub delivery는 request transition 이후 follow protocol port로 위임한다.

#### PROD-243 inbound Follow/Undo

Follow 대상 local actor를 먼저 검증한 뒤에만 unknown remote actor materialization을 허용한다. inbound correlation은 established relation 또는 pending request에 연결하고 identity/response metadata는 first-wins로 유지한다.

Undo는 저장된 actor pair에서 relation/request를 찾고 embedded Follow의 actor/object/recipient를 검증한다. 처리 중 확인한 exact row가 맞을 때만 삭제하며, relation이 실제 삭제된 경우에만 count를 같은 transaction에서 감소시킨다. unknown actor 또는 IRI-only Undo는 network lookup 없이 무시한다.

#### PROD-244 outbound response

outbound Follow URI는 canonical origin과 `ProfileFollow.id`, actor/object는 저장된 profile actor identity, generation은 immutable `ProfileFollow.createdAt`에서 파생한다. Accept는 relation을 유지하고 Reject는 PROD-243의 조건부 삭제 primitive를 재사용한다.

#### Inbox registration

PROD-241이 설정한 actor-scoped/shared inbox listener에 실제 activity type handler를 중앙 federation 초기화에서 등록한다. 공통 route는 supported activity를 등록된 handler에 위임하는 activity-neutral transport 경계이며 Follow-only allowlist가 아니다. Follow/Undo/Accept/Reject의 검증과 side effect만 이 capability가 소유하고, Create 같은 다른 activity의 행동은 해당 capability가 소유한다. 별도 listener registry, placeholder handler 또는 새로운 HTTP route를 만들지 않는다.

#### Instance state

`SUSPENDED` actor의 inbound activity는 side effect 없이 무시하고 기존 relation/count를 보존한다. verified inbound actor의 `UNRESPONSIVE → ACTIVE`만 compare-and-set으로 복구하며 concurrent SUSPENDED 전환을 덮어쓰지 않는다.

### Allowed Alternatives

- correlation column을 relation/request에 직접 두거나 동일 transaction에 참여하는 전용 저장 구조를 사용할 수 있다. first-wins identity, pair uniqueness와 exact-row 조건부 삭제가 보장되어야 한다.

### Known Traps

- remote Follow ID를 strict primary key로 취급하면 ID 누락·재사용 서버와 호환되지 않는다.
- remote `published`와 local 수신 시각을 관계 세대로 혼합하면 clock skew와 network 순서를 도메인 상태로 잘못 해석할 수 있다.
- request row를 terminal history로 남기면 pending-only canonical 계약과 충돌한다.
- SUSPENDED relation을 삭제하면 moderation 해제 뒤 관계 복구와 저장 count 계약을 깨뜨린다.
- PR #232/#234의 브랜치를 통째로 복구하면 현재 main과 책임 경계를 되돌린다.
- 공통 discovery requirement에 Follow-only 허용 목록을 두면 remote-post change와 archive 순서에 따라 지원 activity가 사라질 수 있다.

## Risks / Trade-offs

- actor/object가 같은 지연 Undo는 현재 같은-pair 관계를 제거할 수 있다. → 이를 remote actor의 현재 unfollow 의사로 해석하고, durable activity history가 필요해질 때 별도 capability에서 순서 모델을 도입한다.
- local projection commit과 outbound delivery는 원자적이지 않다. → projection을 rollback하지 않고 queue/retry는 별도 capability로 남긴다.
- 구현 중 shared 계약을 정정하면 구현과 계약 diff가 섞인다. → PROD-243 PR의 첫 커밋에서 Linear와 OpenSpec을 먼저 정렬하고 strict validation을 통과한 뒤 runtime 구현을 시작한다.

## Migration Plan

1. PROD-357 spec-only PR을 main에 병합한다.
2. PROD-242, PROD-243과 PROD-272를 서로의 병합을 기다리지 않고 독립적으로 구현한다.
3. PROD-243은 remote request 생성과 correlation을, PROD-272는 local request 생성과 공통 처리 lifecycle을 각자 검증한다.
4. PROD-244가 두 구현과 PROD-243 primitive를 조합한다.
5. PROD-245, PROD-263과 PROD-282를 각 이슈의 독립 범위로 완료한다.
6. PROD-361이 모든 구현 결과를 통합 검증하고 delta spec 동기화와 change archive PR을 소유한다.
7. PROD-361의 검증·archive 근거가 확인되면 부모 PROD-235를 완료한다.

Rollback은 PROD-357 spec-only commit을 되돌려 이전 contract 문서로 복귀할 수 있다. 구현·migration은 이 PR에 포함되지 않는다.

## Validation

- 각 구현 issue가 자기 package/transaction 경계에서 독립 테스트를 제공한다.
- PROD-361 통합 gate가 duplicate Follow/Undo, Reject refollow race, SUSPENDED/UNRESPONSIVE, graph와 Web action을 검증한다.
- spec-only PR은 `openspec validate add-activitypub-remote-follow --strict`와 전체 strict validation을 통과한다.

## Open Questions

- 없음.
