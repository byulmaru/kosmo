## Context

`/local`은 `store-and-network`를 사용하는 공용 `RouteBoundary`의 기본 `StateView` 오류 fallback과
`fetchKey` 재시도를 사용한다. 공용 `ToastProvider`는 persistent action Toast와 호출자별 cleanup을 이미
제공하지만 Local 최초 오류는 이를 소비하지 않는다. 저장된 성공 결과가 없는 초기 네트워크 오류만
`RouteBoundary`에 도달하며, 성공 뒤 `store-and-network` 재조회가 실패하면 Relay cache 목록을 유지하지만 실패를
소비자에게 알릴 surface가 없다. Figma refresh error Target은 이 목록 보존 위에 동일한 persistent retry Toast를
요구한다.

## Goals / Non-Goals

**Goals:**

- 성공 이력이 없는 Local 오류는 Web 빈 영역·Native 2행 skeleton과 persistent Toast로 표시한다.
- 성공 목록 뒤 hard refresh 오류는 목록을 유지하고 동일한 persistent retry Toast로 표시한다.
- 기존 RouteBoundary 재시도와 공용 Toast lifecycle을 재사용한다.
- 재시도 중복 입력과 route·actor 전환 뒤 남는 Toast를 막는다.

**Non-Goals:**

- 부분 GraphQL 응답·pagination·cursor·filtering 변경
- Home 또는 다른 route의 오류 presentation 이관
- 새 Toast abstraction이나 dependency 추가
- Figma source 수정

## Implementation Guidance

### Current Constraints

- Local route는 최초 성공 여부를 별도로 기억하지 않아 기본 오류와 후속 오류를 구분할 수 없다.
- 성공 뒤 `useLazyLoadQuery`의 `store-and-network` 요청이 hard error로 끝나도 cache snapshot은 렌더되므로 ErrorBoundary만으로 실패를 표시할 수 없다.
- `ToastProvider`는 Relay actor와 route subtree 바깥에 있으므로 소비자가 반환된 cleanup을 실행해야 한다.
- 공용 `PostList` skeleton은 3행이며 Profile loading도 소비하므로 Native 2행 Target으로 바꾸면 안 된다.
- Toast action은 닫힘 motion 동안 같은 handler가 다시 실행될 수 있으므로 active Toast가 아닐 때 callback도
  실행하지 않아야 한다.

### Recommended Approach

Local route lifetime에 성공한 query render 여부만 ref로 기억한다. 현재 actor의 빈 connection이나 Relay
cache 결과도 route에서 렌더되면 성공으로 기록한다. 성공 전 네트워크 오류에는 route 전용 fallback을 렌더한다.
최초 오류 fallback은 Web에서 빈 영역을, Android/iOS Native에서 기존 `Skeleton` primitive로 Figma Android
baseline의 두 행을 렌더하고 mount effect에서 공용 persistent Danger Toast를 연다.

성공 뒤 탭 재선택은 Relay의 기존 query와 environment로 명시적 refresh Observable을 실행한다. success payload는
동일 store에 반영하고, hard error는 cache 목록을 그대로 둔 채 공용 persistent Danger Toast를 연다. 진행 중인
동일 refresh는 다시 시작하지 않으며, 성공·route 이탈·actor remount에서는 해당 요청과 Toast만 정리한다. partial
GraphQL 응답은 기존 Relay payload 처리에 맡기고 hard transport error로 취급하지 않는다.

최초 오류 재시도는 기존 `resetErrorBoundary`/`fetchKey`를 그대로 사용하고, refresh 오류 재시도는 같은 refresh
함수를 재사용한다. 공용 Toast action은 현재 active Toast일 때만 닫힘과 callback을 한 번 실행하도록 좁게
보강해 exit motion 중 연속 입력도 중복 요청을 만들지 않게 한다.

### Allowed Alternatives

동일한 spec과 actor별 Relay Store 격리를 보존한다면 Local 전용 error boundary도 허용되지만, 현재 공용
RouteBoundary의 error renderer와 cleanup 계약으로 충분하므로 기본 경로로 사용하지 않는다.

### Known Traps

- refresh hard error에서 cache 목록을 오류 fallback으로 바꾸면 Figma의 마지막 성공 목록 보존 계약을 깨뜨린다.
- route cleanup에서 현재 Toast를 무조건 닫으면 그 뒤 표시된 다른 화면의 최신 Toast를 지울 수 있다.
- 3행 `PostList` skeleton을 공용 수정하거나 Web에도 skeleton을 표시하면 Figma의 플랫폼별 Target과 다르다.

## Risks / Trade-offs

- [성공 여부 ref가 actor 간에 남을 위험] → Local route가 `RelayActorBoundary` 아래에서 remount되는 기존 구조를
  유지하고 actor 전환 검증을 추가한다.
- [공용 Toast action guard의 회귀] → 같은 action을 연속 실행해 callback이 한 번만 호출되는 최소 단위 테스트를
  추가한다.
- [Native 시각·보조 기술 증거 부족] → 공용 code path와 자동 테스트 결과를 실제 Android/iOS runtime 완료로
  일반화하지 않고 미실행 항목을 기록한다.

## Migration Plan

1. Local 최초 오류 fallback과 Toast cleanup을 적용한다.
2. 공용 Toast action의 active-ID guard를 추가한다.
3. Local hard refresh의 목록 보존·persistent Toast·retry cleanup을 적용한다.
4. Storybook·단위·Web E2E와 Web 시각 검증을 실행하고 디자인 문서를 Current로 정렬한다.
5. 회귀 시 Local refresh 구독과 Toast 소비를 되돌리면 기존 cache 목록 보존 경로로 복원된다.

## Open Questions

없음.
