## Context

현재 main에는 local/remote 공통 `ProfileFollow`/`ProfileFollowRequest`, 저장 follow count, core follow action, remote actor materialization, Fedify Follow/Undo send helper와 actor-scoped/shared inbox route, inbound Follow/Undo handler가 있다. Remote OPEN follow/unfollow는 구현됐지만 outbound APPROVAL_REQUIRED request delivery와 inbound Accept/Reject는 아직 없다.

PROD-235와 구현 자식이 이 change의 source of truth다. PROD-323이 Follow Request를 pending-only로 확정했고, PROD-281이 relation/count transaction을 core service 책임으로 옮겼다. 닫힌 미병합 PR #232와 #234 및 기존 active change의 오래된 가정은 현재 계약이 아니며, PR #247 이후 inbox listener 경로는 새 registry 없이 싱글톤 federation에 activity handler를 등록할 수 있다.

## Goals / Non-Goals

**Goals:**

- shared change의 요구사항과 task를 Linear 구현 이슈에 일대일로 대응한다.
- inbound Follow를 기존 actor pair projection에 idempotent하게 연결하고 duplicate side effect를 막는다.
- request domain lifecycle과 ActivityPub protocol adapter를 분리한다.
- PROD-244의 outbound pending/cancel 및 Accept/Reject 왕복과 PROD-380의 inbound Follow/Undo Notification integration을 서로 다른 구현 경계로 유지한다.
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
- `ProfileFollow`와 `ProfileFollowRequest`의 id와 immutable `createdAt`이 outbound Follow identity와 generation을 파생할 수 있다.
- inbound remote Follow ID는 누락·재사용될 수 있으므로 actor/object 검증을 대체하지 않는다.
- Fedify `MemoryKvStore` idempotency는 process-local 최적화일 뿐 relation/request side effect의 durable source of truth가 아니다.

### Recommended Approach

#### PROD-243/272 pending-only boundary

PROD-243은 ActivityPub recipient·actor·object 검증 뒤 remote pending request 생성을 소유한다. PROD-272는 local request 생성과 local/remote 공통 read/approve/reject/cancel lifecycle을 소유한다. 두 구현은 기존 pending-only row와 actor pair uniqueness를 공유하지만 서로의 구현 또는 병합을 기다리지 않는다. 승인·거절 ActivityPub delivery는 request transition 이후 follow protocol port로 위임한다.

#### PROD-243 inbound Follow/Undo

Follow 대상 local actor를 먼저 검증한 뒤에만 unknown remote actor materialization을 허용한다. PROD-243에서 병합된 inbound Follow service는 inbound id/actor/object를 별도 저장하지 않고 검증된 follower/followee pair를 established relation 또는 pending request로 전환한다. OPEN Follow의 Accept는 이 service 결과와 현재 수신 Follow object를 사용한다. 이 기존 runtime을 공통 core Follow lifecycle과 Notification source lifecycle에 연결하는 변경은 PROD-380이 PROD-244 병합 후 소유한다.

Undo는 저장된 actor pair에서 relation/request를 찾고 embedded Follow의 actor/object/recipient를 검증한다. 처리 중 확인한 exact row가 맞을 때만 삭제하며, relation이 실제 삭제된 경우에만 count를 같은 transaction에서 감소시킨다. unknown actor 또는 IRI-only Undo는 network lookup 없이 follow graph/request side effect를 무시한다. 다만 저장된 actor가 보낸 verified activity는 object 지원 여부와 무관하게 server reachability 신호이므로 `UNRESPONSIVE → ACTIVE` 복구는 허용한다.

#### PROD-244 APPROVAL_REQUIRED round trip

Remote APPROVAL_REQUIRED follow는 pending request를 생성한 transaction이 끝난 뒤 새 ACTIVE request에 대해서만 Follow를 발송한다. URI와 generation은 request id/createdAt에서 파생하며, cancel은 실제 request 삭제 뒤 같은 identity의 Undo를 발송한다.

Outbound Follow/Undo는 core lifecycle이 검증·commit한 projection을 받는 `sendProfileFollow`/`sendProfileUnfollow`만 전송 진입점으로 둔다. 이 진입점이 Fedify activity 구성과 `sendActivity` 호출까지 소유하며, lifecycle 정책을 우회해 직접 호출할 수 있는 하위 Follow/Undo 전송 함수는 두지 않는다. Follow URI와 actor-pair ordering key처럼 side effect가 없는 wire identity 계산만 공통 유틸리티로 유지한다.

Generic Accept/Reject handler는 Fedify `getObject()`와 typed Follow 분기를 직접 소유하되 `crossOrigin: "trust"`를 사용하지 않고 Fedify의 기본 origin 검증을 유지한다. cross-origin embedded object는 authoritative origin에서 조회돼 typed Follow로 제공된 경우에만 concrete Accept(Follow)/Reject(Follow) action으로 전달한다. concrete action은 actor/object/recipient를 검증한 뒤 현재 relation/request를 자기 행동 안에서 직접 조회하며, 별도 Follow response projection resolver나 DB lookup utility를 두지 않는다. local recipient와 remote actor identity처럼 Follow 외 inbound activity에도 적용되는 Fedify trust boundary만 공통 모듈을 재사용한다.

typed Follow의 id가 canonical kosmo Follow URI이면 현재 row에서 파생한 URI와 정확히 일치해야 하고, non-kosmo 또는 missing id는 verified actor pair fallback만 허용한다. Fedify가 typed Follow로 제공하지 못한 IRI-only object를 kosmo가 별도 parser와 DB lookup으로 복원하지 않는다. Accept는 exact pending request 삭제와 relation/count 생성을 한 transaction에서 수행하고 established relation은 유지한다. Reject는 exact request/relation row만 삭제하며 stale generation은 무시한다.

#### Inbox registration

PROD-241이 설정한 actor-scoped/shared inbox listener에 실제 activity type handler를 중앙 federation 초기화에서 등록한다. 공통 route는 supported activity를 등록된 handler에 위임하는 activity-neutral transport 경계이며 Follow-only allowlist가 아니다. Follow/Undo/Accept/Reject의 검증과 side effect만 이 capability가 소유하고, Create 같은 다른 activity의 행동은 해당 capability가 소유한다. 별도 listener registry, placeholder handler 또는 새로운 HTTP route를 만들지 않는다.

#### Instance state

`SUSPENDED` actor의 inbound activity는 side effect 없이 무시하고 기존 relation/count를 보존한다. 저장된 actor가 보낸 verified inbound activity는 activity object의 지원 여부가 아니라 server reachability 신호로 사용하며, `UNRESPONSIVE → ACTIVE`만 compare-and-set으로 복구하고 concurrent SUSPENDED 전환을 덮어쓰지 않는다.

### Allowed Alternatives

- durable ActivityPub activity history가 별도 capability로 도입되면 inbound Follow 원문이나 identity를 전용 저장 구조에 보관할 수 있다. 현재 relation/request projection에는 correlation column을 추가하지 않는다.

### Known Traps

- remote Follow ID를 strict primary key로 취급하면 ID 누락·재사용 서버와 호환되지 않는다.
- inbound actor/object URI를 relation/request에 중복 저장하면 profile FK와 canonical actor identity로 이미 표현되는 pair를 별도 스냅샷 계약으로 만든다.
- remote `published`와 local 수신 시각을 관계 세대로 혼합하면 clock skew와 network 순서를 도메인 상태로 잘못 해석할 수 있다.
- request row를 terminal history로 남기면 pending-only canonical 계약과 충돌한다.
- core lifecycle을 모르는 하위 Follow/Undo 전송 함수를 노출하면 idempotency, instance state와 commit-after-delivery 순서를 우회할 수 있다.
- PROD-244에서 inbound Follow/Undo core integration 또는 Notification side effect까지 함께 변경하면 PROD-380과 구현·테스트 소유권이 중복된다.
- Accept/Reject object에서 Fedify `crossOrigin: "trust"`를 사용하면 remote activity가 다른 origin의 identity에 대해 주장한 embedded content를 authoritative fetch 없이 신뢰하게 된다.
- SUSPENDED relation을 삭제하면 moderation 해제 뒤 관계 복구와 저장 count 계약을 깨뜨린다.
- PR #232/#234의 브랜치를 통째로 복구하면 현재 main과 책임 경계를 되돌린다.
- 공통 discovery requirement에 Follow-only 허용 목록을 두면 remote-post change와 archive 순서에 따라 지원 activity가 사라질 수 있다.

## Risks / Trade-offs

- actor/object가 같은 지연 Undo는 현재 같은-pair 관계를 제거할 수 있다. → 이를 remote actor의 현재 unfollow 의사로 해석하고, durable activity history가 필요해질 때 별도 capability에서 순서 모델을 도입한다.
- 승인 대기 중인 inbound Follow의 원본 ID는 보존하지 않는다. → 후속 protocol response는 저장 actor pair에서 Follow object를 구성하며, remote Follow ID exact match를 상호운용성 전제로 두지 않는다.
- remote Accept/Reject가 kosmo origin Follow ID를 embedded object로 보내도 Fedify가 그 authoritative document를 조회하지 못하면 응답을 적용하지 않는다. → content spoofing 방어를 우선하고 실제 상호운용성 요구가 확인되면 별도 authenticated object dispatcher 범위에서 다룬다.
- local projection commit과 outbound delivery는 원자적이지 않다. → projection을 rollback하지 않고 queue/retry는 별도 capability로 남긴다.
- 구현 중 shared 계약을 정정하면 구현과 계약 diff가 섞인다. → PROD-243 PR의 첫 커밋에서 Linear와 OpenSpec을 먼저 정렬하고 strict validation을 통과한 뒤 runtime 구현을 시작한다.

## Migration Plan

1. PROD-357 spec-only PR을 main에 병합한다.
2. PROD-242, PROD-243과 PROD-272를 서로의 병합을 기다리지 않고 독립적으로 구현한다.
3. PROD-243은 별도 DB migration 없이 remote request 생성을, PROD-272는 local request 생성과 공통 처리 lifecycle을 각자 검증한다.
4. PROD-244가 두 구현과 PROD-243 exact-row primitive를 조합해 outbound pending request, cancel Undo와 inbound Accept/Reject 왕복을 완성한다.
5. PROD-245, PROD-263과 PROD-282를 각 이슈의 독립 범위로 완료한다.
6. PROD-380이 PROD-244 병합 후 inbound Follow/Undo와 Follow Notification lifecycle을 공통 core action에서 통합한다.
7. PROD-361이 모든 구현 결과를 통합 검증하고 delta spec 동기화와 change archive PR을 소유한다.
8. PROD-361의 검증·archive 근거가 확인되면 부모 PROD-235를 완료한다.

Rollback은 PROD-357 spec-only commit을 되돌려 이전 contract 문서로 복귀할 수 있다. 구현·migration은 이 PR에 포함되지 않는다.

## Validation

- 각 구현 issue가 자기 package/transaction 경계에서 독립 테스트를 제공한다.
- PROD-380이 production listener부터 core relation/request와 Notification create/delete까지의 integration을 검증한다.
- PROD-361 통합 gate가 duplicate Follow/Undo, Reject refollow race, SUSPENDED/UNRESPONSIVE, graph와 Web action을 검증한다.
- spec-only PR은 `openspec validate add-activitypub-remote-follow --strict`와 전체 strict validation을 통과한다.

## Open Questions

- 없음.
