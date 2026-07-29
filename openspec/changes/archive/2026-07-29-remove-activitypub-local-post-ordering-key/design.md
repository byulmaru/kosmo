## Context

Fedify 2.3의 `sendActivity`는 outbox queue가 없으면 recipient inbox 요청을 즉시 병렬 실행하고
`orderingKey`를 사용하지 않는다. 현재 Local Post outbound federation에는 MessageQueue가 없지만 dispatcher
인터페이스와 canonical spec은 Note URI를 ordering key로 전달하고 Create/Delete 순서를 보장하는 것처럼
표현한다.

## Goals / Non-Goals

**Goals:**

- 효과가 없는 ordering key를 Local Post dispatcher 인터페이스에서 제거한다.
- stable activity ID와 delivery ordering을 분리한다.
- 현재 direct delivery의 순서 비보장을 계약과 테스트에 반영한다.

**Non-Goals:**

- PROD-448의 queue, outbox, retry 또는 ordering 설계
- Repost·Follow delivery의 기존 ordering key 변경
- activity ID 변경

## Implementation Guidance

### Current Constraints

Local Post Create/Delete는 같은 dispatcher를 호출하고 테스트용 Fedify context가 `sendActivity` options를
기록한다. production federation에는 outbox queue가 없으므로 ordering option 제거가 wire delivery를 바꾸지는
않지만 공개되지 않은 dispatcher 입력과 테스트 기대값을 함께 정리해야 한다.

### Recommended Approach

dispatcher의 ordering 입력과 Fedify options 필드를 제거하고 Local Post Create/Delete caller에서 Note URI 전달을
삭제한다. 테스트는 stable activity ID를 계속 검증하되 ordering option이 없는 direct delivery를 검증한다.

### Allowed Alternatives

없음.

### Known Traps

- stable activity ID까지 제거하지 않는다.
- 기존 Repost·Follow ordering 동작을 이번 수정에 포함하지 않는다.
- archive된 이전 change 이력을 rewrite하지 않는다.

## Risks / Trade-offs

- [향후 queue migration에서 ordering 입력이 다시 필요함] → PROD-448에서 실제 queue semantics와 함께 새 계약을 설계한다.
- [Create/Delete가 remote server에 역순 도착할 수 있음] → 현재 direct delivery의 명시적 제한으로 유지한다.

## Migration Plan

DB·API migration은 없다. 코드와 canonical spec을 함께 배포하며 rollback은 해당 커밋 revert로 가능하다.

## Open Questions

없음.
