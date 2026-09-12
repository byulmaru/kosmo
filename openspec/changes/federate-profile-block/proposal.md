## Why

PROD-813은 로컬 GraphQL Profile Block 흐름을 완료하지만 ActivityPub ingress와 delivery는 제공하지 않는다.
PROD-818은 Mastodon 호환 Block/Undo를 교환하고 검증된 Remote Owner의 차단을 기존 Profile Block에 반영한다.
연합 메시지가 중복되거나 재시도돼도 로컬 관계와 cleanup 결과를 보존한다.

## What Changes

- verified inbound `Block`/`Undo(Block)`를 Remote Owner → Local Target의 기존 Profile Block 생성·해제로 연결한다.
- canonical cleanup, 방향별 콘텐츠 조회·양방향 상호작용 제한, Owner 권한과 해제 후 Follow 비복구 정책을 그대로 적용한다.
- Activity identity와 방향 관계를 검증하고 중복·순서 역전·Worker restart로 다른 차단을 생성하거나 해제하지 않게 한다.
- ActivityPub-origin 처리에서 outbound echo를 막는다.
- Local Owner → Remote Target의 `Block`/`Undo(Block)`를 Mastodon 호환 확장으로 발신한다. 차단 사실이 상대 서버에 전달되며, W3C ActivityPub §6.9의 대상 비전달 권고와 다르다는 점을 명시한다.
- 도입 전 차단은 로컬에 유지하고 일괄 발신하지 않는다. 도입 후 새 차단부터 발신하며, 발신 원본이 없는 기존 차단의 해제에는 Undo를 만들지 않는다.
- PROD-813 완료 전에는 명세만 작성한다. PROD-818은 별도 연합 change의 구현·검증·동기화·archive를 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile-block.md`의 관계·행동·권한·조회 정책, `docs/domain/decisions/0029-profile-block-federation.md`의 연합·rollout 결정, `docs/domain/objects/profile.md`의 Origin, `docs/domain/objects/instance.md`의 새 원격 요청 정책, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`의 Follow 직접 원인 Notification 정리.
- Linear Contract: [PROD-818](https://linear.app/byulmaru/issue/PROD-818)의 전달 결과·포함/제외 범위·완료 조건·명세·검증 소유권과 2026-09-08 발신 방향·기존 차단 rollout 확정 본문.
- Linear Implementations: PROD-818이 연합 범위 전체를 소유한다. [PROD-813](https://linear.app/byulmaru/issue/PROD-813)은 구현 선행 조건이며 로컬 `add-profile-block`의 통합·archive를 소유한다.
- Gate 근거: PROD-818 본문에 기록된 2026-09-06 관계 재사용·명세 선행 승인에 이어, 2026-09-08 Spec 대화에서 Mastodon 호환 발신·수신과 기존 차단 비소급 발신을 명시적으로 선택했다. canonical과 Linear를 먼저 정렬했다. 이 입력 승인은 작성 후 Spec Gate 승인을 대체하지 않는다.
- Protocol 참고: [ActivityPub §6.9, §6.10, §7.12](https://www.w3.org/TR/activitypub/), [Mastodon Remote blocking](https://docs.joinmastodon.org/spec/activitypub/#remote-blocking-block). protocol 문서는 제품 범위를 승인하는 권위가 아니다.

## Capabilities

### New Capabilities

- `activitypub-profile-block`: Mastodon 호환 발신·수신, 기존 Profile Block 재사용, origin 격리, 멱등성·실패 경계와 기존 차단 rollout.

### Modified Capabilities

없음. 기존 로컬 차단 계약과 공통 recipient dispatcher 계약을 재정의하지 않는다.

## Impact

- `packages/fedify`: Block/Undo ingress, actor/object 검증과 승인된 발신 primitive.
- `packages/core`: 선행 구현의 Profile Block policy 재사용, 필요한 최소 protocol identity 보존.
- `apps/worker`: 기존 Temporal orchestration과 Fedify queue handoff 연결, retry·restart 검증.
- 저장 변경이 필요하면 구버전과 호환되는 additive metadata로 제한한다. Profile Block에 별도 제품 상태를 추가하지 않는다.
- GraphQL·UI의 새 기능, Mute 연합, Domain Block·moderation, 범용 ledger, exactly-once framework와 로컬 capability 재구현은 제외한다.
- 2026-09-10에 확인한 main은 `3906f2251e70a8b9bd39721c897493efbe83ff4a`다. 선행 Profile Block 서비스는 아직 통합되지 않았다. Linear 상태는 PROD-821·PROD-813 Done, PROD-822·PROD-823 In Review다. PROD-813 상태만으로 통합 구현·검증 완료를 추론하지 않으며, 구현 세션은 실제 완료 revision과 검증 증거를 확인해야 한다.
- 최신 canonical의 Profile 기본정보 조회 허용, 방향별 Post·Media 직접 조회, 양방향 타임라인·콘텐츠검색 필터링을 연합 수신에도 적용한다. 신규 UI 교체 PROD-917은 로컬 통합 완료의 선행 조건이 아니다.
- 이 change는 PROD-818이 단독 소유한다. 새로운 자식 이슈나 다른 change의 task를 만들지 않는다. Spec Gate는 승인 가능한 상태다. 최종 문서에 대한 명시적 인간 승인 전까지 승인 기록은 pending으로 유지한다.

## HITL P2 및 D7 정리

확정한 발신 계획과 현재 recipient admission을 분리하고, 실제 queue 미인계를 pending으로 기록한다.
2026-09-10 사용자가 전달한 @jiyu와의 구두 논의 결과는 Linear 댓글 `273992ef-16f2-4ade-a655-fa7b1457c3b0`에 기록했다.
조사 중 추가한 원격 Block → Undo 결과 보장은 철회한다. 실제 queue 수락을 확인·정산하면 후속 Undo를 진행하고,
producer late completion·consumer delayed retry 가능성만으로 추가 보류하지 않는다. D7은 이 범위 결정으로 Active다.
공통 dispatcher의 기존 no-op 계약, 제품 관계, 원본 generation, inbound 순서 역전 처리와 비소급 rollout은 유지한다.
이전 attempt 종료 증명, stale-delivery drop, generation sequencing/supersession과 두 race의 원격 결과 보장 테스트는 필수가 아니다.
최신 원격 main `32c281349444208aaddbe5aafe0d038a6e1fdaf4` 대조 시 관련 경계 변경은 없었으며 PR #726·#770·#772는 미병합이었다. 구현 착수 시 최신 완료 증거를 다시 확인한다.
