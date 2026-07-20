## Context

이 결정 기록은 PROD-375와 `proposal.md`, profile delta spec, `design.md`에 정의된 active profile 선택 계약 교정을 반영한다.

## Decision Records

### 사용자 선택 active profile은 local profile로 제한한다

- Decision Date: 2026-07-17
- Status: Superseded
- Context / Problem: remote profile은 조회·표시와 inbound federation 관계의 participant가 될 수 있지만, 사용자가 선택해 outbound action을 수행하는 actor는 아니다. 기존 계약과 구현은 계정에 연결된 remote profile 선택을 허용했다.
- Decision Outcome: 사용자가 현재 session의 active profile로 선택할 수 있는 대상은 local instance 소속 profile로 제한한다. remote profile 선택은 profile not found로 거부하고 기존 session active profile을 유지한다.
- Alternatives Considered: 계정에 연결된 remote profile도 선택 가능하게 유지하는 방안은 outbound actor의 local-only 불변 조건과 충돌한다. remote 전용 오류를 추가하는 방안은 기존 접근 불가 profile과 다른 외부 계약을 만들 필요가 없어 채택하지 않는다.
- Consequences: remote profile의 조회·표시와 inbound 관계에는 영향이 없으며, 선택 경계는 instance kind를 직접 확인해야 한다.
- Confirmation / Follow-up: 계정에 remote profile을 인위적으로 연결한 integration fixture로 거부 오류와 session 상태 불변을 검증한다.

### 정상 제품 경로와 계약만 정렬한다

- Decision Date: 2026-07-20
- Status: Accepted
- Context / Problem: 운영 코드의 `AccountProfile` 생성 경로는 local profile만 연결하므로 owned remote profile 선택 상태는 정상 제품 경로로 도달할 수 없다. 선택 resolver 하나의 guard는 session 생성·복원 경로까지 데이터 불변 조건을 보장하지도 않는다.
- Decision Outcome: active profile requirement에서 remote profile 선택 보장을 제거하고 정상 제품 경로의 `AccountProfile`이 local profile만 연결한다는 모델을 명확히 한다. synthetic remote membership의 선택 또는 거부 동작은 계약하지 않으며, resolver와 test를 포함한 런타임 동작은 변경하지 않는다.
- Alternatives Considered: 선택 resolver에만 local instance guard를 추가하는 방안은 실제 도달 경로가 없는 상태를 부분적으로 방어하므로 채택하지 않는다. DB·service·session 경계 전체에서 불변 조건을 강제하는 방안은 별도 요구사항 없이 이번 계약 정정 범위를 확장하므로 채택하지 않는다.
- Consequences: 이번 change는 spec-only다. synthetic remote membership을 방어해야 하는 실제 요구가 생기면 전체 생성·session 경계를 소유하는 별도 이슈가 필요하다.
- Confirmation / Follow-up: canonical spec과 actor-discovery delta가 동일한 최종 requirement인지 확인하고, local-only membership 모델이 synthetic remote membership 거부 보장으로 읽히지 않는지 검토하며, actor-discovery proposal·design·tasks에 superseded remote selection 전제가 남지 않았는지 검색한 뒤 OpenSpec strict validation을 통과시킨다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-20: 2026-07-17의 resolver guard와 synthetic rejection test 결정은 “정상 제품 경로와 계약만 정렬한다” 결정으로 대체한다. 해당 상태가 제품 경로로 도달할 수 없고 선택 resolver만 수정해서는 데이터 불변 조건을 완전하게 강제할 수 없기 때문이다.
- 2026-07-20: `add-activitypub-actor-discovery`의 “instance kind와 무관한 active profile 선택” 계약은 정상 제품 경로의 local-only membership 모델로 대체한다. remote profile membership은 정상 제품 경로에 존재하지 않으며, synthetic membership의 선택 또는 거부는 이 계약에서 정의하지 않는다.
