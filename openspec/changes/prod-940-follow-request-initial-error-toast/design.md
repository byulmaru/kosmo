## Context

`/follow-requests` route는 `RouteBoundary`의 `fetchKey`로 최초 query를 재시도하고, `FollowRequestListState`가 loading·error·profile-required 화면을 렌더링한다. PROD-939의 app-level `ToastProvider`는 persistent Toast, action 중복 방지와 호출별 cleanup을 이미 제공하지만 actor boundary 바깥에 있으므로 route 오류 surface가 자신이 만든 Toast를 직접 정리해야 한다.

## Goals / Non-Goals

**Goals:**

- 기존 query와 skeleton을 유지하면서 최초 오류와 같은 query 재시도를 공용 Toast에 연결한다.
- 성공, 재실패, route unmount와 actor remount에서 해당 Toast만 정리한다.
- production route를 사용하는 단위·Storybook·Web 검증으로 관찰 가능한 수명주기를 증명한다.

**Non-Goals:**

- 승인·거절 행 mutation과 pagination의 표시·cache·retry 변경
- GraphQL document, API, 권한, dependency 또는 전역 Toast 계약 변경
- PROD-699가 소유한 실제 Android/iOS 보조기술 runtime QA

## Implementation Guidance

### Current Constraints

- `RouteBoundary`의 error callback만 query retry 함수를 소유한다.
- 기존 error branch는 중앙 `StateView`를 렌더링한다.
- skeleton의 polite loading announcement를 initial error에서도 그대로 노출하면 assertive Toast와 모순될 수 있다.
- app-level Toast는 actor가 바뀌어도 자동으로 unmount되지 않는다.

### Recommended Approach

route-local initial-error component가 기존 skeleton presentation을 재사용하되 loading announcement는 숨기고, `useToast().showToast`의 반환 cleanup을 effect cleanup으로 사용한다. Toast action에는 `RouteBoundary`의 retry를 그대로 전달한다. 재시도 성공 또는 actor/route remount는 오류 component를 unmount하므로 같은 scoped cleanup 경로로 정리된다. 더 이상 production-valid하지 않은 중앙 error state와 Storybook 항목은 제거하고 실제 route error story와 Controls가 꺼진 Tests story로 교체한다.

### Allowed Alternatives

동일한 skeleton·announcement·scoped Toast cleanup 계약을 유지한다면 initial-error component를 follow-request presentation 모듈 안에 둘 수 있다.

### Known Traps

- Toast를 표시만 하고 cleanup을 반환하지 않으면 route 이탈이나 selected Profile 전환 뒤에도 이전 actor 오류가 남는다.
- 전역 dismiss나 ToastProvider 변경은 다른 화면 Toast의 소유권을 침범한다.
- row mutation 또는 pagination 오류를 같은 변경에 이관하면 PROD-785와 겹친다.

## Risks / Trade-offs

- [같은 skeleton을 오류 상태에 재사용하면 loading announcement가 남을 수 있음] → initial error에서는 시각 skeleton만 재사용하고 오류·retry는 assertive Toast가 전달하게 한다.
- [다른 Stack의 Follow Requests story 변경과 충돌 가능] → PROD-940은 최초 query 오류 section과 route lifecycle에만 한정한다.

## Migration Plan

PROD-939 위의 두 번째 Stack layer로 배포한다. 회귀 시 이 layer를 되돌리면 기존 중앙 error `StateView`로 복구되며 데이터 migration은 없다.

## Open Questions

없음.
