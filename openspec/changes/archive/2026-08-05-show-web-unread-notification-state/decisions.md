## Context

이 기록은 `PROD-680`의 Web 알림 미확인 행 계약, `docs/design/colors.md`와 `docs/design/accessibility.md`의 토큰·비색상 접근성 원칙, 그리고 현재 `NotificationListItem`과 Relay Read 수렴 구조를 반영한다. 제품 범위와 구현 선택을 분리해 이후 컬러 토큰 리팩터링이나 인접 알림 작업이 이 change의 소유 범위를 잘못 확장하지 않도록 한다.

## Decision Records

### Web 알림 미확인 상태는 기존 Read 계약 위에 시각 표현만 추가한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-680`
- Status: Active
- Context / Problem: Web 알림 목록에서 사용자가 미확인 항목을 식별할 수 있어야 하지만, 목록 진입·가시성만으로 Read 처리하거나 전체 읽음·모바일 범위까지 포함하면 현재 이슈 계약을 넘어선다.
- Decision Outcome: 모든 visible Web Notification kind는 기존 `readAt`을 Read/Unread source of truth로 사용하고, Unread일 때 좌측 상태선·은은한 배경과 기존 접근성 설명을 제공한다. Read는 item activation으로만 시작한다. Native 시각 표현, 자동 Read와 전체 읽음은 이 change에서 정의하지 않는다.
- Alternatives Considered: 목록 진입 또는 viewport 노출 시 자동 Read는 activation-only 계약과 충돌해 제외했다. 모바일 Unread 표현과 전체 읽음은 각각 별도 제품 범위이며, 이 change에서는 구현하거나 허용 동작을 결정하지 않았다.
- Consequences: 공용 Notification row의 Web 표현만 바뀌며 GraphQL API, notification kind별 renderer와 navigation은 그대로 유지된다. 이번 구현은 현재 Native 렌더링을 변경하지 않지만 향후 Native Unread 제품 계약을 제한하지 않는다.
- Confirmation / Follow-up: Storybook에서 Read/Unread와 접근성명 차이를 확인하고, Web 한정 style branch가 현재 Native 렌더링을 회귀시키지 않는지 정적으로 검증한다. 이 검증은 이번 change의 delivery evidence이며 지속적인 Native 시각 계약을 뜻하지 않는다.

### Web row 자체에 primary 상태선과 30% alpha 배경을 적용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/colors.md`, `docs/design/accessibility.md`, `PROD-680`
- Status: Active
- Context / Problem: 좌측 상태선과 은은한 배경을 구현하면서 콘텐츠 opacity, stacking layer, Read 전환 시 layout 이동, 기존 hover 피드백을 피해야 한다. 상태선은 30% tint와 분리된 고대비 경계가 아니라 Read 행의 일반 `card` 배경과 구분되는 Unread 행 전체 표현의 일부다.
- Decision Outcome: Web row는 좌측 4px 공간을 항상 예약한다. Unread에서는 좌측 border를 불투명한 `primary`, 기본 배경을 `primary` 30% alpha의 theme 파생값으로 표시하고, Read에서는 같은 border를 transparent로 유지해 정렬을 보존한다. 기존 좌측 padding은 border 폭만큼 보정한다. pointer hover에서는 기존 `surface` 배경으로 전환하되 Unread의 `primary` 상태선은 유지한다. Unread는 상태선·tint와 기존 접근성명을 결합해 Read의 일반 배경과 구분하며 상태선과 tint 사이의 별도 대비 경계를 추가하지 않는다.
- Alternatives Considered: row 전체 `opacity: 0.3`은 콘텐츠와 상호작용까지 흐리므로 제외했다. absolute background child와 z-index 조합은 불필요한 stacking 구조를 만들므로 제외했다. Unread에서만 border를 추가하는 안은 Read 전환 시 콘텐츠 이동을 만들어 제외했다. `surface`를 Unread 기본 배경으로 재사용하면 hover와 상태 표현이 구분되지 않아 제외했다. 상태선과 tint 사이에 고대비 edge를 추가하는 안은 승인된 `primary` 결합 표현과 다른 시각 계층을 만들어 제외했다.
- Consequences: light와 dark theme 경계에 동일한 `primary` 30% alpha 의미를 제공하는 작은 파생 token이 필요하다. token의 구체적인 내부 이름은 동등한 표현으로 조정할 수 있지만, raw color를 row에 직접 쓰거나 앱 전체 컬러 토큰을 리팩터링하지 않는다.
- Confirmation / Follow-up: 현재 지원되는 light Storybook runtime에서 Read 일반 배경과 Unread 결합 표현의 식별성·텍스트 가독성, hover 상태선 유지와 Read 전환 전후 콘텐츠 시작 위치를 확인한다. dark는 양 mode token 정의를 정적으로 확인하며, dark Storybook runtime은 이번 change의 검증 범위에 포함하지 않는다.

### Read 성공 payload의 Relay 정규화만으로 시각 상태를 수렴시킨다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-680`
- Status: Active
- Context / Problem: activation 직후 강조를 로컬에서 제거하면 mutation pending·실패 상태가 서버와 달라질 수 있고, Unread count를 client에서 계산하면 selected Profile별 cache 격리를 훼손할 수 있다.
- Decision Outcome: 시각 상태는 render 시점의 `readAt === null`에서만 파생한다. 성공 payload의 `notification.readAt`과 `recipientProfile.unreadNotificationCount`를 기존 Relay ID 정규화가 갱신하도록 두고 별도 local state, optimistic update, client-side count 산술, updater나 성공 후 refetch를 추가하지 않는다.
- Alternatives Considered: activation 즉시 로컬 강조를 제거하는 안과 optimistic response는 실패 시 cache와 표시가 어긋나 제외했다. count를 직접 감소시키거나 성공 후 refetch하는 안은 기존 서버 source of truth와 payload 수렴 계약을 중복해 제외했다.
- Consequences: 성공하면 item 강조와 전역 인디케이터가 같은 payload로 수렴하고, pending·실패 중 cached `readAt`이 `null`이면 강조가 유지된다. navigation은 mutation 결과와 독립적으로 즉시 진행되는 기존 동작을 보존한다.
- Confirmation / Follow-up: 기존 Relay unit 검증에서 성공·실패와 Recipient Profile count 수렴을 확인하고, Notification Web E2E 회귀 범위를 실행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
