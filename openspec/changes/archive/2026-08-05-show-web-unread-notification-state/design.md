## Context

`NotificationListItem`의 공용 row는 현재 모든 concrete Notification kind에서 `readAt === null`을 Unread predicate로 사용한다. Web 기본 배경은 Read 상태와 관계없이 `card`, pointer hover 배경은 `surface`이며, 접근성명만 Unread 상태를 전달한다. Link activation은 navigation을 즉시 시작하면서 `markNotificationRead`를 호출하고, 성공 payload의 `notification.readAt`과 `recipientProfile.unreadNotificationCount`를 Relay가 정규화한다.

PROD-680은 이 데이터·navigation 계약을 바꾸지 않고 Web row의 Unread 시각 상태만 추가한다. 같은 row가 Native에서도 렌더되므로 Web 한정 style이 Native geometry나 배경을 바꾸지 않아야 한다. 현재 theme에는 `primary`와 `primaryHover`가 있지만 primary 30% alpha token은 없고, `docs/design/colors.md`는 raw hex 대신 token 이름과 light/dark 양쪽 mode 정의를 요구한다.

## Goals / Non-Goals

**Goals:**

- 모든 Web Notification kind가 같은 `readAt` 기반 Unread 상태선·배경 계약을 사용한다.
- Read 성공, pending과 실패가 기존 Relay cache 상태와 같은 시각 결과를 만든다.
- Read 전환 전후 콘텐츠 정렬, Web hover 피드백과 접근성 Unread 설명을 보존한다.
- 새 stacking layer 없이 row 자체의 Web style만으로 상태를 표현한다.

**Non-Goals:**

- 목록 진입·가시성 기반 자동 Read와 전체 읽음
- 모바일 Unread 시각 상태, refresh 또는 navigation 변경
- GraphQL API, schema, mutation payload나 Relay updater 변경
- 앱 전체 컬러 토큰 구조의 전면 리팩터링
- 기존 Notification kind별 renderer 또는 row 구조 리팩터링

## Implementation Guidance

### Current Constraints

- row의 `card`→`surface` hover 전환은 기존 Storybook과 archived notification decision이 검증하는 Web 계약이다.
- `opacity`를 row에 직접 적용하면 텍스트, icon과 link까지 흐려진다.
- Reaction selected 표현은 absolute background child에 opacity를 적용하지만, 이 변경은 별도 stacking child를 추가하지 않기로 결정했다.
- Post Composer에는 primary 45% literal rgba 선례가 있으나 컬러 정책은 새 변경에서 token 이름을 사용하도록 요구한다.
- Read 성공 여부를 위한 별도 로컬 상태, optimistic update 또는 client-side count 계산은 기존 Relay 수렴 계약과 충돌한다.

### Recommended Approach

- light와 dark theme에 동일한 primary 30% alpha 값을 가진 작은 파생 token을 추가한다.
- 공용 Notification row의 Web style에서 항상 같은 좌측 border 폭을 예약하고, Unread이면 불투명한 `primary`, Read이면 transparent를 사용한다. 기존 콘텐츠 시작 위치가 유지되도록 좌측 padding을 border 폭만큼 보정한다.
- Web에서 hover가 아니면 Unread row는 primary 30% alpha 배경, Read row는 `card` 배경을 사용한다. hover 중에는 둘 다 `surface` 배경을 사용하되 Unread 좌측 상태선은 유지한다.
- 시각 상태는 기존 `readAt === null` predicate에서만 파생한다. 성공 payload가 `readAt`을 갱신하면 같은 render에서 강조가 제거되고, pending·실패로 cache가 바뀌지 않으면 강조가 남는다.
- 기존 Notifications Storybook의 현재 light runtime에서 computed row style과 접근성명을 함께 검증하고, dark mode는 양 mode token 정의를 정적으로 확인한다. 기존 Relay unit과 Web E2E를 회귀 검증으로 실행한다.

### Allowed Alternatives

- specs와 Active decision을 만족하면서 동일한 primary 30% alpha를 theme 경계에서 제공하는 동등한 token 표현은 허용한다. row 전체 opacity, absolute background child, z-index layer 또는 Native style 변경은 동등한 대안이 아니다.

### Known Traps

- `theme.primary`와 row `opacity: 0.3`을 함께 사용해 콘텐츠까지 흐리게 만들지 않는다.
- Unread 기본 배경에 `surface`를 재사용해 hover 피드백과 상태 배경을 같은 색으로 만들지 않는다.
- Read 성공 전에 로컬 시각 상태를 제거하거나 count를 직접 감소시키지 않는다.
- Unread일 때만 border 폭을 추가해 Read 전환 순간 콘텐츠가 이동하게 만들지 않는다.
- Web 요구사항을 공용 style에 무조건 적용해 Native 배경이나 geometry를 바꾸지 않는다.

## Risks / Trade-offs

- [`primary` 상태선과 30% alpha 배경 사이의 내부 대비가 낮음] → 상태선은 tint와 분리된 고대비 경계가 아니라 미확인 행 전체 표현의 일부로 사용한다. 비교 대상은 `card`인 Read 행과 `primary` 상태선·30% tint·접근성명을 함께 제공하는 Unread 행이며, light Storybook에서 이 결합 표현의 식별성과 텍스트 가독성을 관찰한다.
- [현재 `ThemeProvider`가 light theme만 제공해 dark Storybook runtime을 재현할 수 없음] → 이번 change는 dark mode 전환 인프라를 추가하지 않고 light Storybook과 light/dark token 정의의 정적 확인으로 검증 범위를 제한한다.
- [투명 border 공간이 기존 row geometry를 바꿀 수 있음] → 모든 Web row에 동일한 폭을 예약하고 padding을 보정한 뒤 기존 compact geometry assertion을 재실행한다.
- [hover 중 Unread 배경 tint가 `surface`로 바뀜] → Unread 좌측 상태선을 유지해 상태 식별을 보존하고 기존 pointer 피드백을 우선한다.
- [곧 진행될 컬러 토큰 리팩터링에서 파생 token 이름이 바뀔 수 있음] → 이번 change는 primary 30% alpha의 관찰 결과만 소유하며 전면 리팩터링을 선행 조건이나 task로 포함하지 않는다.

## Migration Plan

데이터나 API migration은 없다. theme token과 Web row style을 함께 배포하며, 문제가 생기면 해당 style과 token 추가를 되돌려 기존 `card`/`surface` 표시로 복구할 수 있다. Read와 Unread count 데이터 계약은 rollback과 무관하다.

## Open Questions

없음.
