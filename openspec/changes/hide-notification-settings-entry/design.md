## Context

현재 `NotificationList`의 header는 `알림` 제목 옆에 44×44 `Pressable`과 `Settings` glyph를 렌더링하고, 이를 `알림 설정 (준비 중)` disabled button으로 접근성 트리에 노출한다. 같은 목록 컴포넌트가 mobile과 Web에서 사용되며 Notifications Storybook은 이 disabled button의 존재를 검증한다. `SidebarNavigation`은 공용 `navItems`에 `/menu`를 가리키는 `프로필 설정` link를 포함해 full Web sidebar, compact Web rail과 mobile drawer에 같은 설정 진입점을 노출한다. PROD-541은 설정 공개 전 두 control 전체를 숨기도록 계약을 변경한다.

사이드바의 기존 `설정 & 지원` footer는 PROD-487과 PR #390에서 `/feedback` 진입점으로 교체되며 이 change의 소유 범위가 아니다. `프로필 설정` nav row와 feedback footer는 같은 `SidebarNavigation` 파일에 있지만 별도 사용자 진입점이다.

## Goals / Non-Goals

**Goals:**

- 알림 header의 설정 control을 시각·접근성 트리에서 제거한다.
- 기존 header 높이, padding, border와 `알림` 제목의 mobile/Web 배치를 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정` row를 제거한다.
- Storybook에서 두 설정 control의 비노출과 주변 메뉴·header 정책을 검증한다.

**Non-Goals:**

- 설정 route, 설정 기능, 대체 아이콘이나 안내 UI를 추가하지 않는다.
- `/feedback`, PROD-487 또는 PR #390의 feedback footer를 변경하지 않는다.
- `/menu` route와 `프로필`, `팔로워 요청`, 로그아웃 진입점을 삭제하거나 변경하지 않는다.
- Notification Relay fragment, pagination, Read mutation, cache와 list item 동작을 변경하지 않는다.
- 향후 `설정 & 지원` 드롭다운 구성을 결정하지 않는다.

## Implementation Guidance

### Current Constraints

- header의 disabled `Pressable` 자체가 접근성 button이므로 `Settings` glyph만 제거하면 PROD-541의 접근성 비노출 조건을 만족하지 못한다.
- `styles.settingsButton`은 control의 44×44 geometry와 opacity를 소유한다. control 제거 뒤 사용처가 없다면 함께 정리할 수 있다.
- Notifications Storybook의 현재 assertion은 disabled setting button이 존재한다고 고정하므로 새 계약과 반대로 바뀌어야 한다.
- `NotificationList`는 mobile/Web 공용 컴포넌트이므로 platform별 분기나 별도 UI를 만들 필요가 없다.
- `SidebarNavigation`의 `navItems`는 full, compact와 mobile drawer가 공유하므로 `프로필 설정` item 자체를 제거하면 세 surface에서 시각·접근성 link가 함께 사라진다.
- PR #390도 `SidebarNavigation`을 수정하지만 feedback footer만 변경하며 `프로필 설정` nav row는 유지한다.

### Recommended Approach

`NotificationHeader`에서 설정 `Pressable`과 glyph를 함께 제거하고, header container의 기존 min-height, padding, border와 제목 style은 유지한다. `SidebarNavigation`의 공용 `navItems`에서는 `프로필 설정` item만 제거한다. Notifications Storybook에서는 `알림` heading과 기존 탭·새로고침 비노출 정책을, Shell Storybook에서는 full·compact·mobile drawer의 `프로필 설정` link 부재와 기존 `프로필`·`팔로워 요청`·feedback footer 유지를 검증한다.

### Allowed Alternatives

제목 정렬을 유지하기 위해 non-interactive layout spacer가 필요하다고 실제 viewport 검증에서 확인되면 사용할 수 있다. 단, 설정 glyph·label·role·focus target을 렌더링하지 않아야 한다.

### Known Traps

- glyph만 숨기고 invisible disabled button을 남기지 않는다.
- `프로필 설정`만 제거하고 같은 `/menu`를 사용하는 `프로필`·`팔로워 요청`을 함께 제거하지 않는다.
- 설정 공개 전이라는 이유로 sidebar의 실제 `피드백 보내기` link나 로그아웃을 숨기지 않는다.
- header 정렬을 맞추기 위해 새로운 대체 아이콘이나 임시 설정 안내 action을 추가하지 않는다.
- 이 presentation 변경과 무관한 Notification query·Relay·Read 동작을 수정하지 않는다.

## Risks / Trade-offs

- [Risk] 오른쪽 44×44 control 제거로 title의 시각적 균형이 달라질 수 있다. → 기존 header geometry를 유지하고 mobile/Web viewport에서 제목 위치와 간격을 관찰한다.
- [Risk] 정적 Storybook assertion만으로 Native 실제 화면을 증명했다고 오해할 수 있다. → 자동화, Web 관찰과 실행하지 못한 Android/iOS runtime 검증을 구분해 보고한다.
- [Risk] `navItems` 공유로 의도한 row 외 메뉴까지 제거하면 navigation 회귀가 생긴다. → 기존 `프로필`·`팔로워 요청`과 feedback footer를 Storybook에서 함께 검증한다.
- [Risk] PR #390과 같은 파일을 서로 다른 base에서 변경하면 merge 순서에 따라 footer 계약을 놓칠 수 있다. → PR #390이 미병합인 동안 PROD-541을 그 위에 stack하고 최종 diff에서 feedback 변경이 없는지 확인한다.

## Migration Plan

데이터·API migration은 없다. 공용 UI와 Storybook을 함께 배포하고, 회귀가 확인되면 해당 UI commit을 되돌려 기존 설정 진입점을 복원할 수 있다. 설정 기능 공개 시점의 복원은 별도 Linear 이슈와 OpenSpec이 소유한다.

## Open Questions

없음.
