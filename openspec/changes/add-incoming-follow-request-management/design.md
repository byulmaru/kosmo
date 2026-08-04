## Context

Follow Request의 pending-only lifecycle, selected Profile 전용 incoming connection과 승인·거절 mutation은 이미 제공된다. 현재 App은 outgoing 요청 상태만 소비하며 받은 요청을 관리하는 route·목록·mutation UI는 없다. PROD-541 전달에서는 준비되지 않은 `팔로워 요청` shell 진입점과 generic `/menu` placeholder를 제거했고, active `web-app-shell`은 관리 화면이 없을 때 진입점을 숨기는 상태를 규정한다.

현재 `apps/app`의 protected route는 top-level query에서 `currentSession.selectedProfile`을 조회하고 Relay actor revision을 route boundary의 key와 fetch key로 사용한다. Profile 전환은 actor environment를 교체하므로 selected Profile 전용 데이터와 local component state를 함께 격리할 수 있다. 기존 Profile connection과 Notification 목록은 refetchable pagination fragment, loading·empty·error와 다음 페이지 복구의 가까운 구현 선례다.

PROD-566은 화면·Relay 처리·통합 검증·archive를, PROD-654는 준비된 route로 향하는 full/compact/mobile navigation 복원을 소유한다.

## Goals / Non-Goals

**Goals:**

- `/follow-requests`에서 selected Profile의 받은 요청을 조회하고 승인·거절한다.
- 공통 `PageHeader`, 기존 list/pagination와 Relay actor 경계를 재사용한다.
- unavailable requester, mutation 실패와 추가 페이지 실패를 사용자가 정리·복구할 수 있는 상태로 표시한다.
- route가 준비된 뒤 세 shell surface의 진입점을 함께 복원한다.
- 각 구현 이슈가 자신의 테스트를 소유하고 PROD-566이 두 slice의 통합을 검증한다.

**Non-Goals:**

- Follow Request 저장 모델, lifecycle, GraphQL schema·payload와 pagination 정렬 계약을 변경하지 않는다.
- outgoing FollowButton, Follow Request notification source·activation, push/realtime을 변경하지 않는다.
- mobile bottom tab 또는 generic `/menu`를 복원하지 않는다.
- 새 dependency, DB migration이나 공통 전역 toast infrastructure를 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- `Profile.incomingProfileFollowRequests`는 현재 session actor가 해당 Profile일 때만 노출된다. top-level/root query나 다른 Profile의 connection으로 우회하면 안 된다.
- request의 requester Profile은 unavailable participant 정책 때문에 nullable이다. null node를 client에서 제거하면 사용자가 거절로 pending row를 정리할 수 없다.
- approve/reject payload는 삭제된 request global ID를 반환하지만 삭제된 Node 자체나 현재 connection edge를 반환하지 않는다. 성공 payload만 정규화해 두면 connection에 stale edge가 남을 수 있다.
- Profile 전환 중 이전 environment의 비동기 응답과 행별 local pending/error가 새 actor 화면에 남지 않아야 한다.
- shell navigation은 full sidebar, compact rail과 mobile drawer가 공유하는 navigation ownership을 사용한다. route보다 진입점이 먼저 배포되면 PROD-541에서 제거한 dead entry가 다시 생긴다.
- Storybook a11y automation은 keyboard, screen reader와 모든 color contrast를 완전히 증명하지 않으므로 runtime 검증을 대체하지 않는다.

### Recommended Approach

- 기존 Notifications route와 같은 protected route boundary에서 selected Profile을 조회하고 actor revision을 route 렌더 경계에 적용한다. route는 공통 `PageHeader`와 초기 loading/error/profile-required 상태를 소유한다.
- 목록 컴포넌트는 selected Profile fragment에 colocate한 refetchable pagination connection을 소비하고, 초기 상태와 기존 목록을 보존하는 다음 페이지 retry를 소유한다.
- 요청 행 컴포넌트는 requester 표시와 승인·거절의 local pending/error를 소유한다. 요청 중에는 같은 행의 두 동작만 잠그고, 성공 전에는 행을 제거하지 않는다.
- 성공 payload의 삭제 ID로 현재 selected Profile connection의 정확한 edge를 제거하고 request record도 정리한다. Relay declarative directive 또는 좁은 store updater 중 현재 compiler·connection 계약에 맞는 최소 방식을 사용한다.
- approve 성공 payload의 `ProfileFollow`와 participant Profile은 Relay normalization에 맡기고, reject는 follow 관계를 만들지 않는다.
- requester가 null이면 fallback row를 렌더링하고 reject mutation만 연결한다.
- PROD-654는 shared shell navigation source에 `팔로워 요청`·`UserRoundPlus`·`/follow-requests` 항목을 복원한다. bottom tab collection은 수정하지 않는다.

### Allowed Alternatives

- 요청 목록 presentation을 별도 props-only 컴포넌트로 분리하거나 Relay fragment와 같은 모듈에 둘 수 있다. Profile-owned connection, actor 격리, 행별 복구와 specs의 관찰 가능한 결과를 유지해야 한다.
- cache 정리는 declarative connection directive 또는 명시적 updater를 사용할 수 있다. 삭제 ID와 현재 selected Profile의 connection만 대상으로 하며 성공 뒤 정확한 한 행 제거를 검증해야 한다.

### Known Traps

- 공개 established follower 목록 route나 컴포넌트에 private incoming request 모드를 섞지 않는다.
- requester가 null인 edge를 filter하지 않는다.
- mutation 시작 시 낙관적으로 행을 제거하거나 실패를 전역 toast에만 남기지 않는다.
- connection page size나 시간순 정렬 방향을 새 공개 제품 계약으로 고정하지 않는다.
- Profile ID만 query 변수로 바꾸고 이전 Relay environment·local state를 유지하지 않는다.
- archived PROD-541의 제거 assertion을 그대로 재사용하거나 `/menu`를 다시 만들지 않는다.

## Risks / Trade-offs

- [삭제 record만 정리하고 connection edge가 남음] → 성공 뒤 현재 actor connection에서 정확한 request ID가 사라지는 Relay/component test를 둔다.
- [Profile 전환 race가 새 actor state를 오염] → 기존 actor environment 교체 경계를 사용하고 늦은 응답 격리 회귀 test를 둔다.
- [unavailable requester를 숨겨 정리 불가] → fallback row와 reject-only 동작을 Storybook/component test로 고정한다.
- [두 PR의 배포 순서로 dead navigation 노출] → screen route slice를 먼저 전달하고 PROD-654 진입점 slice가 준비된 route를 기준으로 stack·검증한다.
- [자동화가 platform 접근성을 과대평가] → Web keyboard·screen reader와 Android/iOS target을 별도 runtime QA로 기록한다.

## Migration Plan

1. PROD-566 slice에서 `/follow-requests`, 목록·행 UI와 Relay 검증을 먼저 전달한다. 이 단계에서는 shell 진입점을 복원하지 않아 direct route만 존재할 수 있다.
2. PROD-654 slice에서 full Web sidebar, compact Web rail과 mobile drawer 진입점을 함께 복원하고 shell 검증을 수행한다.
3. PROD-566 담당자가 두 slice를 결합해 route navigation, Profile 전환, 승인·거절과 responsive/accessibility 흐름을 검증하고 active specs와 정합성을 확인한 뒤 archive한다.

Rollback은 PROD-654의 shell 진입점을 먼저 제거해 dead entry를 차단하고, 필요하면 `/follow-requests` route·UI를 뒤이어 되돌린다. 기존 GraphQL·DB 계약에는 migration이나 rollback 작업이 없다.

## Open Questions

없음.
