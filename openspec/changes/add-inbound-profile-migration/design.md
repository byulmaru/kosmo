## Context

Profile은 Local·Remote origin과 기존 Follow lifecycle을 제공하지만, Local Profile이 이전 Remote source를 준비 관계로 가리키거나 inbound ActivityPub `Move`로 follower를 새 target에 옮기는 경계는 아직 없다. 현재 구현은 Core의 Profile identity·Follow 서비스, Fedify의 Remote actor materialization과 inbound handler, Temporal directed Follow pair Workflow, App Settings Profile detail이 각각 이 경계를 소유한다.

현재 `SettingsProfileDetail`은 selected Local Profile과 Owner membership을 조회하고 기존 Profile 설정 control을 배치한다. Fedify의 Local Actor projection은 Profile 표현과 key를 구성하지만 migration alias를 포함하지 않으며, inbound handler에는 Move 처리가 없다. 기존 Follow command는 Follow/Request lifecycle과 재시도를 소유하고, PENDING 또는 terminal 상태에서 같은 command를 무조건 새로 적용하지 않는다.

이 설계는 `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `docs/design/settings.md`와 `PROD-743`의 승인된 결과를 구현자가 사용할 수 있는 비규범적 handoff로 정리한다.

## Goals / Non-Goals

**Goals:**

- Profile Migration source 준비 관계와 1:1 cardinality·same-pair no-op·conflict 동작을 제공한다.
- 검증된 source canonical Actor URI에서 Local Actor `alsoKnownAs`를 파생한다.
- inbound Move의 source/target identity를 검증하고 remote-to-local·remote-to-remote target을 지원한다.
- source Followee의 Local established follower만 target Follow 또는 Request로 target-first 이전하고, 실패·중단 뒤 source를 보존하거나 재개한다.
- Settings Profile detail의 feature flag 조건부 source 준비 UI와 기존 Profile Owner 경계를 연결한다.

**Non-Goals:**

- 운영자 CLI 또는 feature flag 관리 UI/CLI
- outgoing Kosmo `Move`, Account 이전, 게시물·미디어·팔로잉 전체 이전, Follow 가져오기/내보내기
- 실제 운영 계정의 이전 실행
- 서버 간 Move receipt 순서 보장, Follow/Unfollow race 제거, migration 전용 generation·global coordination·ledger/effect 구조
- `alsoKnownAs`를 위한 별도 freshness TTL 정책이나 source actor 표현의 새 canonical schema

## Implementation Guidance

### Current Constraints

- Profile 저장 모델과 Core service에는 현재 Profile Migration 관계가 없다. 관계를 추가하더라도 Profile의 기존 lifecycle·origin·policy와 Account Active/Owner authorization을 재사용해야 한다.
- `packages/fedify/src/remote-actor-materialization.ts`는 qualified handle lookup, actor projection과 Remote Profile materialization을 이미 제공한다. source identity는 이 경계에서 검증된 canonical Actor URI를 얻어야 하며, 사용자가 입력한 handle 문자열이나 client cache를 alias로 바로 복사하면 안 된다.
- `packages/fedify/src/local-profile-actor.ts`, `local-actor-store.ts`, `local-profile-person.ts`는 Local Actor를 조회·생성·직렬화한다. 현재 Person 직렬화가 있는 경로에 aliases를 연결하되, canonical 결정이 지원하는 기존 Actor 종류를 inbound 검증에서 Person으로 좁히지 않는다.
- Fedify inbound handler와 listener 등록은 ActivityPub actor/object 검증과 원격 lookup을 소유한다. Move가 거부되는 경우 기존 준비 관계와 Follow/Request 상태를 바꾸지 않으며, 정상적인 source materialization 또는 actor refresh 경계를 invalid Move의 원자적 rollback 증거로 과장하지 않는다.
- `packages/core/services/profile-follow*`와 `packages/core/temporal/follow-command.ts` 및 Worker pair Workflow는 directed Follow lifecycle을 소유한다. 현재 PENDING·terminal command가 새 동일 command를 거부할 수 있으므로, target Follow/Request가 이미 확정된 재시도에서는 그 exact pair 상태를 성공으로 인식해 source cleanup을 재개해야 한다. Remote target의 Open policy도 기존 Local-to-Remote Follow effect semantics를 사용하고, source removal은 기존 Unfollow·Undo lifecycle을 따른다. HTTP receipt은 source cleanup의 별도 완료 조건이 아니다. 이를 위해 새 durable row·ledger를 기본값으로 만들 필요는 없다.
- Follow admission의 기존 Active/Normal Profile, usable Instance와 canonical Remote actor eligibility를 우회하지 않는다. 이 eligibility를 통과하지 못한 source 관계는 이전하거나 먼저 제거하지 않고, 기존 Follow effect의 성공을 운영 서버 수신 성공으로 일반화하지 않는다.
- App Settings는 `SettingsProfileDetail`에서 selected Local Profile과 membership role을 조회한다. Settings navigation과 Account `featureFlags` 조회 경계는 현재 별도이므로, 구체적인 flag key나 새 범용 registry를 이 change가 미리 고정하지 않는다.

### Recommended Approach

1. Profile application 경계에서 source handle을 기존 remote actor materialization으로 검증·구체화한 뒤, target eligibility와 target/source pair uniqueness를 확인하고 준비 관계를 저장한다. 같은 pair는 기존 결과를 반환하는 no-op으로, 다른 pair는 conflict로 분류한다. 저장 관계는 기존 Profile identity를 참조하는 additive row와 source·target 양쪽 uniqueness 제약을 최소 단위로 삼고, 기존 Profile/Follow row를 재작성하지 않는다.
2. Local Actor 표현을 만들 때 현재 Profile Migration 관계를 조회해 검증된 source canonical URI만 `alsoKnownAs`에 추가한다. 관계가 없으면 migration alias를 내보내지 않는다.
3. Fedify inbound listener에 Move 처리 경계를 연결한다. 인증된 actor/object의 canonical equality와 target canonical actor의 exact alias를 먼저 확인하고, source Remote Profile을 materialize한 뒤 target origin별 policy를 평가한다. remote-to-local은 준비된 Local target/Open policy를, remote-to-remote는 기존 Remote target policy를 사용한다.
4. Move coordinator는 source Followee의 기존 established Follow 중 Local follower를 한 번에 제한된 batch/cursor로 admission한다. 각 pair에 대해 기존 Follow lifecycle로 target Follow/Request 상태를 먼저 확정하고, 확정된 exact target row/request를 확인한 뒤 기존 removal/Unfollow·Undo lifecycle로 source Follow를 제거한다. target 저장이 실패하거나 execution이 중단되면 source를 유지하고, Temporal retry 또는 기존 workflow 상태에서 다음 batch와 미완료 pair를 재개한다. 새 migration ledger나 operation receipt를 전제로 하지 않는다.
5. 모든 저장·API·worker·inbound 경계와 재시도 검증이 준비된 뒤에만 Settings Profile detail의 flag를 `ON`으로 노출한다. UI는 `ON`으로 확인된 때만 source 준비 control을 렌더링하고 `OFF`·미확인·로딩에서는 숨긴다. action은 기존 Owner authorization을 호출하고, 저장 실패 시 입력·안전한 오류·재시도를 유지한다. flag 상태가 이미 준비된 relation·alias·inbound 처리의 runtime gate가 되지 않게 한다.

### Current implementation handoff (non-normative; 2026-09-07 snapshot)

다음은 현재 브랜치의 구현 경계를 읽어 정리한 비규범적 handoff다. 위 요구사항·결정과 canonical 문서를 변경하거나, 아직 끝나지 않은 통합 검증을 완료로 선언하지 않는다.

- Fedify의 기존 inbox pipeline이 서명한 actor가 Activity의 actor인지 확인한 뒤 typed listener를 호출한다. `Move` listener는 이 인증된 context를 전제로 identity·target·source admission만 수행하며, handler에 별도의 서명 소유권 검사를 복제하지 않는다. listener는 기존 `withInboundObservability` 경계 안에서 동작한다.
- handler는 prepared Local target이면 exact source/target 관계와 Local·Open eligibility를 확인하고, Remote target이면 수신 context에서 canonical target Actor를 조회해 exact source alias를 확인한다. source는 기존 `findOrMaterializeRemoteProfileActorByUri` 경계와 실제 context로 materialize한 뒤 기존 Temporal start 경계로 넘긴다. embedded target 표현만으로 Remote target의 alias를 신뢰하지 않는다.
- Move Workflow state는 source/target Profile ID와 선택적인 `afterSourceFollowId` cursor로 제한된다. 한 번에 최대 50개의 active Local established follower를 `ProfileFollows.id` 오름차순 keyset으로 읽고, 각 항목은 기존 Follow transition과 exact-row removal 경계를 사용한다. target row/request가 이미 있으면 다시 만들지 않고 source cleanup을 재개하며, self-follow는 건너뛰되 cursor는 진행한다.
- batch가 끝나면 마지막 source Follow ID를 다음 `continueAsNew` 입력으로 전달한다. 이 handoff는 새 migration ledger·receipt·generation을 도입하지 않으며, Activity aliases는 기존 Core service를 재사용한다. Workflow 시작은 기존 Temporal client deadline과 source/target pair 기반 `USE_EXISTING` workflow ID를 사용한다.
- 위 handoff에서 설명한 Core Move 이전·Local Actor alias projection·새 Workflow의 최종 cross-slice 결과는 별도 검증 중이다. 따라서 이 절 자체는 tasks 완료나 OpenSpec archive의 근거가 아니다.

### Allowed Alternatives

- 저장 관계, Move listener와 Follow 이전을 현재 Core/Fedify/Temporal 경계 안에서 분리된 서비스 또는 하나의 조정 경계로 구현할 수 있다. 단, 동일한 observable validation, target-first 순서, retry/resume와 기존 권한을 보존해야 한다.
- Settings control은 현재 승인된 Button·SettingsItem·form 조합을 재사용하는 다른 composition을 사용할 수 있다. feature flag의 ON/확인 완료 조건, 실패 시 입력 보존과 접근 가능한 오류·재시도 결과는 유지해야 한다.
- 새 Follow command sequence가 불가피하면 기존 Workflow history를 해석하는 호환 경로와 replay·배포 검증을 함께 마련할 수 있다. 이 변경이 임의의 command ID·receipt 모델을 새로 공개할 필요는 없다.

### Known Traps

- flag OFF를 관계·alias 삭제나 inbound Move 처리 중단 조건으로 사용하지 않는다. flag는 UI 노출 조건이지 authorization·runtime safety gate가 아니다.
- `alsoKnownAs`에 raw qualified handle, 입력 문자열, stale cache를 넣지 않는다. target canonical actor가 제공·검증한 exact alias만 사용한다.
- actor와 object 중 하나만 검사하거나 target을 문자열 handle로만 찾지 않는다. source canonical equality와 target exact alias를 모두 확인한다.
- source Follow를 target 저장보다 먼저 삭제하지 않는다. 기존 target relation/request가 이미 있는 재시도와 PENDING·terminal 결과를 구분해 source cleanup을 안전하게 재개한다.
- remote-to-remote Move에 Local 준비 관계를 강제하거나 Actor를 Person으로 제한하지 않는다.
- receipt 순서, Follow/Unfollow race, production account migration을 로컬 unit·CI 결과만으로 보장했다고 보고하지 않는다.
- migration 전용 lock, generation, ledger 또는 effect architecture를 구현 전에 필요 이상으로 도입하지 않는다. 현재 Follow/Temporal lifecycle로 달성할 수 있는 최소 경계를 먼저 검증한다.

## Risks / Trade-offs

- [source materialization, alias projection과 Follow transfer가 서로 다른 경계에서 실패할 수 있다] → identity validation과 target-first 결과를 단계별로 검증하고, 중단 뒤 기존 Temporal retry가 exact target 상태를 확인해 source cleanup을 재개하도록 한다.
- [현재 Follow pair command가 PENDING·terminal 재시도를 거부할 수 있다] → 이미 저장된 target Follow/Request를 성공 상태로 판별하는 재개 경계를 구현하고, command sequence를 바꾸면 history replay·배포 호환성을 검증한다.
- [대량 Local follower 이전이 오래 걸릴 수 있다] → source 관계를 먼저 제거하지 않고 follower별 target admission과 재시기를 기존 lifecycle 단위로 처리하며, 운영 이전 실행은 별도 승인 전까지 수행하지 않는다.
- [수신 actor representation이 stale할 수 있다] → target canonical Actor와 exact alias 검증에 필요한 기존 Fedify 조회·materialization 경계를 사용하고, 별도 TTL·전역 freshness policy는 추가하지 않는다.
- [flag 미확인 상태에서 UI와 runtime 경계가 섞일 수 있다] → UI는 control만 숨기고 기존 Profile authorization·관계·alias·inbound 처리의 소유 경계를 독립적으로 테스트한다.

## Migration Plan

1. Profile Migration 관계 저장과 cardinality 검증을 배포하고 기존 Profile·Follow 데이터를 임의로 변경하지 않는다.
2. Local Actor alias projection, Move inbound validation, source materialization, remote-to-local·remote-to-remote target resolution과 target-first Follow transfer를 flag OFF 상태에서 연결하고 실행 검증한다.
3. 반복 수신, target 저장 실패, target 저장 뒤 중단·재시작, 기존 target relation/request에서 source cleanup 재개와 Remote target effect/removal lifecycle을 검증한다. HTTP receipt과 Follow/Unfollow race를 별도 완료 조건으로 만들지 않는다.
4. 저장·API·worker·inbound 통합 결과와 rollback 시 in-flight Move workflow가 기존 wire contract와 retry 경계로 재개될 수 있음을 확인한 뒤에만 feature flag를 ON으로 전환한다. 검증되지 않은 환경은 ON으로 노출하지 않는다.
5. 문제가 생기면 source 준비 UI의 flag를 OFF로 되돌리고 새 inbound admission을 중지할 수 있지만, 이미 수락된 workflow와 저장된 관계를 제거하거나 worker가 재개할 수 없게 하는 배포를 하지 않는다. 이미 저장된 관계나 운영 이전 데이터의 삭제·복구·실제 migration 실행은 이 변경의 rollback 자동화에 포함하지 않는다.

## Open Questions

없음.
