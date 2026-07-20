## Context

active profile 선택 계약은 계정에 연결된 remote profile 선택을 보장하지만, 운영 코드에서 `AccountProfile`을 만드는 유일한 경로는 configured local instance에 local profile을 생성한 뒤 계정에 연결한다. remote profile membership은 정상 제품 경로로 만들 수 없으므로 현재 불일치는 런타임 버그가 아니라 계약 문구 오류다.

## Goals / Non-Goals

**Goals:**

- canonical spec과 actor-discovery의 proposal, design, tasks, delta spec에서 도달 불가능한 remote profile 선택 보장을 제거한다.
- active profile 선택 계약을 정상 제품 경로의 local-only 계정 profile 모델에 맞추되, synthetic membership의 런타임 동작까지 규정하지 않는다.
- 런타임 동작을 변경하지 않는다.

**Non-Goals:**

- remote profile 조회·표시 또는 inbound federation 관계를 제한하지 않는다.
- local profile이 remote target에 수행하는 follow 기능을 변경하지 않는다.
- 인위적 데이터 상태를 방어하기 위한 resolver, session 또는 DB guard를 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- 운영 코드의 profile 생성 mutation은 configured local instance에 profile을 만든 뒤에만 `AccountProfile`을 생성한다.
- DB schema 자체는 remote profile membership을 금지하지 않지만, 이를 생성하는 제품 API나 service는 없다.
- 선택 resolver 하나에만 방어적 guard를 추가해도 session 생성·복원 경로 전체의 데이터 불변 조건을 보장하지 못한다.

### Recommended Approach

canonical profile spec과 actor-discovery delta의 전체 active profile selection requirement를 동일한 문구로 동기화한다. requirement는 정상 제품 경로의 `AccountProfile` membership이 local profile만 연결한다는 모델과 기존 membership·visibility 기반 선택 동작을 기술하고, synthetic remote membership의 선택 또는 거부 동작은 정의하지 않는다. actor-discovery proposal, design, tasks에서도 remote profile 선택·session restore를 capability, accepted approach 또는 verification 대상으로 요구하지 않게 정렬한다. resolver와 integration test는 그대로 둔다.

### Allowed Alternatives

없음.

### Known Traps

- 도달 불가능한 synthetic fixture를 근거로 resolver만 수정하면 실제 제품 문제 없이 방어 로직을 추가하고 session 경계 전체에는 일관되게 적용하지 못한다.
- remote membership 방어가 실제 요구사항으로 생기면 이 change에 조용히 추가하지 않고 별도 이슈에서 생성·session 경계를 함께 정의해야 한다.

## Risks / Trade-offs

- [actor-discovery의 산출물끼리 다시 어긋날 수 있음] → proposal, design, tasks, delta spec과 canonical requirement를 같은 변경에서 정렬하고 strict validation과 텍스트 검색으로 확인한다.
- [DB가 synthetic remote membership을 표현할 수 있음] → 현재 제품 경로에는 생성 수단이 없으므로 이번 범위에서는 방어하지 않으며, 실제 요구가 생기면 전체 소유 경계를 별도 이슈로 다룬다.

## Migration Plan

런타임과 데이터 변경은 없다. 계약 문서만 배포하며 rollback은 해당 문서 변경을 되돌리는 것으로 충분하다.

## Open Questions

없음.
