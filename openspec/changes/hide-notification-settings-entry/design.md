## Context

현재 `NotificationList`의 header는 `알림` 제목 옆에 44×44 `Pressable`과 `Settings` glyph를 렌더링하고, 이를 `알림 설정 (준비 중)` disabled button으로 접근성 트리에 노출한다. 같은 목록 컴포넌트가 mobile과 Web에서 사용되며 Notifications Storybook은 이 disabled button의 존재를 검증한다.

`SidebarNavigation`은 full Web sidebar, compact Web rail과 mobile drawer가 공유하는 navigation 배열을 사용한다. 기존 `프로필 설정`과 `팔로워 요청`은 모두 generic `/menu` placeholder를 가리켰고, 현재 구현에서는 `프로필` 항목도 실제 선택 Profile route를 계산하기 전 타입용 href로 `/menu`를 보유한다. `프로필 설정`은 이미 제거됐지만 `팔로워 요청`은 여전히 실제 받은 요청 화면 없이 placeholder로 이동한다.

팔로우 요청은 pending-only 저장 모델과 GraphQL incoming/outgoing connection, 승인·거절·취소 mutation을 제공한다. App은 보낸 요청의 `요청됨`·취소만 사용하며 받은 요청 UI는 없다. PROD-541은 이 domain/API를 바꾸지 않고 준비되지 않은 진입점과 generic route만 제거한다. 받은 요청 UI와 기존 Lucide `UserRoundPlus` 아이콘을 사용한 진입점 복원은 PROD-566이 소유한다.

사이드바의 `설정 & 지원` footer는 PROD-487과 PR #390에서 `/feedback` 진입점으로 교체되며 이 change의 소유 범위가 아니다. Parent `add-web-feedback-slack-delivery`는 parent head에서 다른 소비자를 보호하기 위해 `/menu` 보존을 요구하지만, 이 child change가 남은 소비자를 제거한 뒤 해당 requirement를 순차적으로 수정한다.

## Goals / Non-Goals

**Goals:**

- 알림 header의 설정 control을 시각·접근성 트리에서 제거한다.
- 기존 header 높이, padding, border와 `알림` 제목의 mobile/Web 배치를 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정`과 `팔로워 요청` row를 제거한다.
- `프로필` navigation이 선택한 Profile route만 사용하고 `/menu` 임시 href에 의존하지 않게 한다.
- generic `/menu` placeholder route와 positive route smoke를 제거한다.
- Storybook에서 비노출과 실제 동작하는 주변 진입점을 검증한다.

**Non-Goals:**

- 설정 route, 설정 기능, 대체 아이콘이나 안내 UI를 추가하지 않는다.
- `/feedback`, PROD-487 또는 PR #390의 feedback footer를 변경하지 않는다.
- `프로필`, `북마크`, 로그아웃 진입점을 삭제하거나 변경하지 않는다.
- 팔로우 요청의 pending 저장 모델, GraphQL API, 보낸 요청의 `요청됨`·취소 동작을 변경하지 않는다.
- 받은 요청 목록과 승인·거절 UI를 구현하지 않는다.
- 승인제 팔로우 정책을 폐기하거나 모든 Profile을 자동 승인으로 바꾸지 않는다.
- `/menu` 직접 접근을 위한 새 redirect나 전용 404 화면을 추가하지 않는다.
- Notification Relay fragment, pagination, Read mutation, cache와 list item 동작을 변경하지 않는다.
- 향후 `설정 & 지원` 드롭다운 구성을 결정하지 않는다.

## Implementation Guidance

### Current Constraints

- header의 disabled `Pressable` 자체가 접근성 button이므로 `Settings` glyph만 제거하면 PROD-541의 접근성 비노출 조건을 만족하지 못한다.
- `styles.settingsButton`은 control의 44×44 geometry와 opacity를 소유한다. control 제거 뒤 사용처가 없다면 함께 정리할 수 있다.
- Notifications Storybook의 기존 assertion은 disabled setting button이 존재한다고 고정하므로 새 계약과 반대로 바뀌어야 한다.
- `NotificationList`는 mobile/Web 공용 컴포넌트이므로 platform별 분기나 별도 UI를 만들 필요가 없다.
- `SidebarNavigation`의 navigation 배열은 full, compact와 mobile drawer가 공유하므로 두 item을 제거하면 세 surface에서 시각·접근성 link가 함께 사라진다.
- `프로필` item의 literal `/menu`는 실제 runtime destination이 아니다. 선택 Profile이 있으면 `/${relativeHandle}`로 치환되고 없으면 link가 아닌 button으로 렌더링된다.
- `/menu` positive smoke는 `apps/web/e2e/auth-routes.e2e.ts`에 있고, Shell Storybook은 세 surface에서 `팔로워 요청 → /menu`를 직접 고정한다.
- PR #390도 `SidebarNavigation`을 수정하지만 feedback footer만 변경하며 parent head에서는 `/menu`를 보존한다.

### Recommended Approach

`NotificationHeader`에서 설정 `Pressable`과 glyph를 함께 제거하고 header geometry를 유지한다. `SidebarNavigation`에서는 `프로필 설정`과 `팔로워 요청`을 navigation 배열에서 제거하고, 일반 route item과 선택 Profile item을 작은 discriminated union으로 구분해 profile item의 `/menu` sentinel을 없앤다. 사용하지 않는 `UserRoundPlus` import는 제거하되 아이콘 이름은 PROD-566에 보존한다.

`apps/app/src/app/(tabs)/(protected)/menu.tsx`를 삭제하고 Web auth route의 positive `/menu` smoke를 제거한다. 별도 redirect나 특정 404 UI를 새로 고정하지 않는다. Notifications·Shell Storybook은 변경된 비노출과 유지 대상만 검증하며, `feedback.e2e.ts`가 `/feedback`에서 legacy menu 소개 문구의 부재를 확인하는 assertion은 여전히 유효하므로 유지한다.

### Allowed Alternatives

- 제목 정렬을 유지하기 위해 non-interactive layout spacer가 필요하다고 실제 viewport 검증에서 확인되면 사용할 수 있다. 단, 설정 glyph·label·role·focus target을 렌더링하지 않아야 한다.
- profile item을 discriminated union 대신 별도 렌더링 경로로 분리해도 실제 destination, active semantics와 no-profile button 동작이 같다면 허용한다.

### Known Traps

- glyph만 숨기고 invisible disabled button을 남기지 않는다.
- 임시 비노출을 literal source comment나 dead code로 남기지 않는다. 복원 정보는 PROD-566과 git history가 소유한다.
- `UserRoundPlus`를 사용하지 않는 import로 남겨 lint를 깨뜨리지 않는다.
- `프로필 설정`·`팔로워 요청` 제거와 함께 실제 `프로필`, `북마크`, feedback footer, 로그아웃을 숨기지 않는다.
- `/menu` route 삭제를 팔로우 요청 domain/API 삭제나 승인제 정책 변경으로 확대하지 않는다.
- `/menu` 삭제 뒤 임의 redirect나 전용 not-found UI를 추가하지 않는다.
- 이 presentation 변경과 무관한 Notification query·Relay·Read 동작을 수정하지 않는다.
- Parent feedback change의 active files를 child에서 수정하지 않는다. parent archive 뒤 canonical requirement 전체를 재대조한 후 child MODIFIED delta를 적용한다.
- Active `add-web-app-shell-sticky-rails`의 PROD-219 task 4.1/6.4에는 과거 `/menu` smoke가 남아 있다. 해당 owner가 archive 전에 정렬해야 하며 이 child change에서 다른 issue의 artifact를 조용히 수정하지 않는다.

## Risks / Trade-offs

- [Risk] 오른쪽 44×44 control 제거로 title의 시각적 균형이 달라질 수 있다. → 기존 header geometry를 유지하고 mobile/Web viewport에서 제목 위치와 간격을 관찰한다.
- [Risk] 두 sidebar row 제거로 navigation 간격이나 drawer geometry가 달라질 수 있다. → full·compact·mobile Storybook에서 유지 대상, overflow와 drawer 동작을 함께 관찰한다.
- [Risk] 정적 Storybook assertion만으로 Native 실제 화면을 증명했다고 오해할 수 있다. → 자동화, Web 관찰과 실행하지 못한 Android/iOS runtime 검증을 구분해 보고한다.
- [Risk] parent와 child의 active delta가 동시에 `/menu`에 반대 계약을 가진다. → 이는 stack의 의도된 전이로 문서화하고 parent change archive 후 child canonical 재대조를 stop gate로 둔다.
- [Risk] PROD-219의 오래된 `/menu` smoke task가 이후 완료 불가능해질 수 있다. → PROD-219 owner가 해당 active change를 archive하기 전에 현재 route set에 맞게 별도 정렬한다.

## Migration Plan

데이터·API migration은 없다. 공용 UI, route와 검증을 함께 배포한다. 회귀가 확인되면 해당 UI·route commit을 되돌려 기존 placeholder를 복원할 수 있지만, 받은 요청 화면을 제공하는 정상 복원은 PROD-566의 별도 Linear·OpenSpec이 소유한다. 해당 이슈는 Lucide `UserRoundPlus` 아이콘과 새 canonical route를 사용하며 generic `/menu` placeholder를 복원하지 않는다.

Archive는 `add-web-feedback-slack-delivery`가 먼저 canonical에 반영된 뒤 수행한다. Child archive 직전에 parent가 추가한 `Universal shell feedback navigation` requirement 전체를 다시 복사·대조하고 `/menu` 보존 scenario만 제거된 최종본인지 확인한다.

## Open Questions

없음.
