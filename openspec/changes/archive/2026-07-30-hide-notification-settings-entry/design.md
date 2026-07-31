## Context

현재 `NotificationList`의 header는 `알림` 제목 옆에 44×44 `Pressable`과 `Settings` glyph를 렌더링하고, 이를 `알림 설정 (준비 중)` disabled button으로 접근성 트리에 노출한다. 같은 목록 컴포넌트가 mobile과 Web에서 사용되며 Notifications Storybook은 이 disabled button의 존재를 검증한다.

`SidebarNavigation`은 full Web sidebar, compact Web rail과 mobile drawer가 공유하는 navigation 배열을 사용한다. 기존 `프로필 설정`과 `팔로워 요청`은 모두 generic `/menu` placeholder를 가리켰고, 현재 구현에서는 `프로필` 항목도 실제 선택 Profile route를 계산하기 전 타입용 href로 `/menu`를 보유한다. `프로필 설정`은 이미 제거됐지만 `팔로워 요청`은 여전히 실제 받은 요청 화면 없이 placeholder로 이동한다.

팔로우 요청은 pending-only 저장 모델과 GraphQL incoming/outgoing connection, 승인·거절·취소 mutation을 제공한다. App은 보낸 요청의 `요청됨`·취소만 사용하며 받은 요청 UI는 없다. PROD-541은 이 domain/API를 바꾸지 않고 준비되지 않은 진입점과 generic route만 제거한다. 받은 요청 UI와 기존 Lucide `UserRoundPlus` 아이콘을 사용한 진입점 복원은 PROD-566이 소유한다.

사이드바의 `설정 & 지원` footer는 PROD-487과 PR #390에서 `/feedback` 진입점으로 교체된다. PROD-541은 해당 label·link·접근성 의미와 전달 동작을 유지하면서 설정을 연상시키는 `Settings` glyph만 `Mail`로 교체한다. 이 glyph 선택은 child가 소유하는 sidebar 비노출 requirement에 기록하고, parent `add-web-feedback-slack-delivery`의 feedback requirement는 수정하지 않는다.

PR #404는 공개 `/privacy` route와 landing·인증 후 `/menu` 링크를 추가했다. `/menu`는 generic placeholder라 삭제하되 공개 route와 landing 링크는 유지한다. 인증 후 보조 진입점은 full Web 우측 레일 최하단에만 두며, compact Web과 mobile Web·Android/iOS drawer에서는 좁은 공간과 navigation 위계를 보존하기 위해 표시하지 않는다. 가입·로그인 온보딩 안의 추가 진입점은 후속 범위다.

full Web sidebar와 mobile drawer의 ProfileSwitcher 닉네임에는 trigger 중심보다 6px 아래로 내리는 보정이 적용돼 있고 Shell Storybook이 그 offset을 고정한다. PROD-541은 이 보정을 제거해 nickname·chevron을 trigger 수직 중심으로 복원하고 compact avatar geometry는 유지한다.

mobile drawer에는 하단 5탭과 같은 `/compose` 글쓰기 진입점이 중복 노출된다. 우측 composer가 없는 compact Web rail의 글쓰기는 필요하지만 mobile은 하단 탭이 항상 제공되므로 drawer의 중복 버튼만 제거한다. `LogoutControl`의 Lucide `LogOut`은 1.5px stroke라 2px navigation glyph보다 얇게 보이므로 2px로 맞춘다. compact에서는 full-width wrapper 안에 44px target을 별도로 가운데 정렬해 직접 배치된 다른 footer target보다 오른쪽으로 밀리므로, wrapper 폭만 44px로 맞춰 같은 수평 중심선을 사용한다.

## Goals / Non-Goals

**Goals:**

- 알림 header의 설정 control을 시각·접근성 트리에서 제거한다.
- 기존 header 높이, padding, border와 `알림` 제목의 mobile/Web 배치를 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정`과 `팔로워 요청` row를 제거한다.
- `프로필` navigation이 선택한 Profile route만 사용하고 `/menu` 임시 href에 의존하지 않게 한다.
- generic `/menu` placeholder route와 positive route smoke를 제거한다.
- 공개 `/privacy` route와 landing 링크를 유지하고 인증 후 진입점은 full Web 우측 레일 최하단에만 둔다.
- compact Web과 mobile drawer에는 개인정보 처리방침 진입점을 표시하지 않는다.
- full Web sidebar와 mobile drawer의 ProfileSwitcher 닉네임 하향 보정을 제거한다.
- `피드백 보내기`의 sidebar glyph를 Lucide `Mail`로 교체하되 label·link·동작은 유지한다.
- mobile drawer의 중복 글쓰기를 제거하되 하단 5탭과 compact Web rail의 글쓰기는 유지한다.
- `LogOut` glyph stroke를 2px로 맞추되 로그아웃 동작·label·target geometry는 유지한다.
- compact Web rail의 로그아웃 target을 다른 footer target과 같은 수평 중심선에 둔다.
- Storybook에서 비노출과 실제 동작하는 주변 진입점을 검증한다.

**Non-Goals:**

- 설정 route, 설정 기능, 설정용 대체 진입점이나 안내 UI를 추가하지 않는다.
- `/feedback`, PROD-487 또는 PR #390의 feedback label·link·접근성 의미와 전달 동작을 변경하지 않는다.
- `프로필`, `북마크`, 로그아웃 진입점을 삭제하거나 변경하지 않는다.
- 팔로우 요청의 pending 저장 모델, GraphQL API, 보낸 요청의 `요청됨`·취소 동작을 변경하지 않는다.
- 받은 요청 목록과 승인·거절 UI를 구현하지 않는다.
- 승인제 팔로우 정책을 폐기하거나 모든 Profile을 자동 승인으로 바꾸지 않는다.
- `/menu` 직접 접근을 위한 새 redirect나 전용 404 화면을 추가하지 않는다.
- Notification Relay fragment, pagination, Read mutation, cache와 list item 동작을 변경하지 않는다.
- 향후 `설정 & 지원` 드롭다운 구성을 결정하지 않는다.
- 개인정보 처리방침 본문, 공개 route, 분석 수집·삭제 정책을 변경하지 않는다.
- 가입·로그인 온보딩 안의 추가 개인정보 처리방침 진입점을 구현하지 않는다.
- 하단 5탭, compact Web compose link와 `/compose` route를 변경하지 않는다.

## Implementation Guidance

### Current Constraints

- header의 disabled `Pressable` 자체가 접근성 button이므로 `Settings` glyph만 제거하면 PROD-541의 접근성 비노출 조건을 만족하지 못한다.
- `styles.settingsButton`은 control의 44×44 geometry와 opacity를 소유한다. control 제거 뒤 사용처가 없다면 함께 정리할 수 있다.
- Notifications Storybook의 기존 assertion은 disabled setting button이 존재한다고 고정하므로 새 계약과 반대로 바뀌어야 한다.
- `NotificationList`는 mobile/Web 공용 컴포넌트이므로 platform별 분기나 별도 UI를 만들 필요가 없다.
- `SidebarNavigation`의 navigation 배열은 full, compact와 mobile drawer가 공유하므로 두 item을 제거하면 세 surface에서 시각·접근성 link가 함께 사라진다.
- ProfileSwitcher의 full/mobile nickname style은 `translateY: 6`을 공유하며 Shell Storybook의 두 geometry assertion이 같은 offset을 직접 검증한다.
- feedback footer는 full·compact·mobile에서 같은 glyph component를 공유하므로 `Settings` import와 렌더링을 `Mail`로 교체하면 세 surface에 함께 반영된다.
- `프로필` item의 literal `/menu`는 실제 runtime destination이 아니다. 선택 Profile이 있으면 `/${relativeHandle}`로 치환되고 없으면 link가 아닌 button으로 렌더링된다.
- `/menu` positive smoke는 `apps/web/e2e/auth-routes.e2e.ts`에 있고, Shell Storybook은 세 surface에서 `팔로워 요청 → /menu`를 직접 고정한다.
- PR #390도 `SidebarNavigation`을 수정하지만 feedback footer만 변경하며 parent head에서는 `/menu`를 보존한다.
- `UniversalShell`의 right rail wrapper는 full breakpoint에서 항상 렌더링되지만 `RightRail` composer는 선택 Profile이 있을 때만 렌더링된다. 개인정보 처리방침 link를 composer의 sibling으로 두어 Profile 유무와 무관하게 유지하고, 하단 margin을 `spacing.lg`에서 `spacing.sm`으로 줄여 viewport 하단에 더 가깝게 둔다.
- compact rail과 mobile drawer는 `SidebarNavigation`을 공유한다. 현재 추가된 icon-only·text 개인정보 처리방침 link를 제거하되 피드백·로그아웃 footer와 compact compose는 유지한다.
- compose control은 현재 `compact || surface === 'drawer'` 조건을 사용한다. 이를 `compact`로 좁혀 mobile drawer에서만 제거하고 compact Web의 진입점은 유지한다.
- `LogoutControl`은 세 shell surface가 공유한다. `LogOut` stroke만 1.5에서 2로 올리면 geometry와 동작을 바꾸지 않고 한 곳에서 세 surface를 맞출 수 있다. compact mode에서는 outer wrapper의 폭도 inner target과 같은 44px로 제한해야 직접 배치된 feedback target과 수평 중심선이 일치한다.

### Recommended Approach

`NotificationHeader`에서 설정 `Pressable`과 glyph를 함께 제거하고 header geometry를 유지한다. `SidebarNavigation`에서는 `프로필 설정`과 `팔로워 요청`을 navigation 배열에서 제거하고, 일반 route item과 선택 Profile item을 작은 discriminated union으로 구분해 profile item의 `/menu` sentinel을 없앤다. 사용하지 않는 `UserRoundPlus` import는 제거하되 아이콘 이름은 PROD-566에 보존한다. feedback footer는 `Settings` glyph만 `Mail`로 교체하고 현재 size·stroke·color·link semantics를 유지한다.

ProfileSwitcher는 nickname style의 `translateY: 6`만 제거하고 trigger layout 자체는 변경하지 않는다. 기존 Shell Storybook의 full/mobile geometry assertion을 먼저 중심선 기준으로 바꿔 RED를 확인한 뒤 최소 style 변경으로 통과시킨다.

`apps/app/src/app/(tabs)/(protected)/menu.tsx`를 삭제하고 Web auth route의 positive `/menu` smoke를 제거한다. 별도 redirect나 특정 404 UI를 새로 고정하지 않는다. `RightRail`은 composer를 상단에 두고 개인정보 처리방침 링크를 flex footer로 최하단에 고정하며 bottom margin만 작은 spacing token으로 줄인다. `SidebarNavigation`에서는 compact·drawer 개인정보 처리방침 link와 `FileText` import를 제거한다. Notifications·Shell Storybook은 변경된 비노출, 유지 대상, full Web 개인정보 처리방침 진입과 compact·mobile 비노출을 검증한다.

### Allowed Alternatives

- 제목 정렬을 유지하기 위해 non-interactive layout spacer가 필요하다고 실제 viewport 검증에서 확인되면 사용할 수 있다. 단, 설정 glyph·label·role·focus target을 렌더링하지 않아야 한다.
- profile item을 discriminated union 대신 별도 렌더링 경로로 분리해도 실제 destination, active semantics와 no-profile button 동작이 같다면 허용한다.

### Known Traps

- glyph만 숨기고 invisible disabled button을 남기지 않는다.
- mobile drawer compose만 제거할 때 compact Web compose까지 함께 숨기지 않는다.
- logout icon의 크기·container padding까지 바꿔 target geometry를 흔들지 않는다.
- compact 로그아웃을 맞추면서 footer 전체를 재정렬하거나 feedback target까지 이동하지 않는다.
- 임시 비노출을 literal source comment나 dead code로 남기지 않는다. 복원 정보는 PROD-566과 git history가 소유한다.
- `UserRoundPlus`를 사용하지 않는 import로 남겨 lint를 깨뜨리지 않는다.
- `프로필 설정`·`팔로워 요청` 제거와 함께 실제 `프로필`, `북마크`, feedback footer, 로그아웃을 숨기지 않는다.
- nickname 정렬 복원 과정에서 avatar·chevron·trigger height나 compact rail profile button을 변경하지 않는다.
- feedback glyph 교체를 label, `/feedback` destination, active·drawer close·접근성 semantics 변경으로 확대하지 않는다.
- `/menu` route 삭제를 팔로우 요청 domain/API 삭제나 승인제 정책 변경으로 확대하지 않는다.
- `/menu` 삭제 뒤 임의 redirect나 전용 not-found UI를 추가하지 않는다.
- 이 presentation 변경과 무관한 Notification query·Relay·Read 동작을 수정하지 않는다.
- Parent feedback change의 active OpenSpec artifact와 `Universal shell feedback navigation` requirement를 child에서 수정하지 않는다. child archive를 parent production smoke에 묶지 않는다.
- active `add-web-openpanel-product-analytics`가 개인정보 처리방침 고지 requirement를 소유하므로 landing·menu 문구를 landing·full Web right rail로 함께 정렬하고 compact·mobile 비노출을 기록한다. 해당 change의 production acceptance와 archive는 PROD-575가 계속 소유한다.
- Active `add-web-app-shell-sticky-rails`의 PROD-219 task 4.1/6.4에는 과거 `/menu` smoke가 남아 있다. 해당 owner가 archive 전에 정렬해야 하며 이 child change에서 다른 issue의 artifact를 조용히 수정하지 않는다.

## Risks / Trade-offs

- [Risk] 오른쪽 44×44 control 제거로 title의 시각적 균형이 달라질 수 있다. → 기존 header geometry를 유지하고 mobile/Web viewport에서 제목 위치와 간격을 관찰한다.
- [Risk] 두 sidebar row 제거로 navigation 간격이나 drawer geometry가 달라질 수 있다. → full·compact·mobile Storybook에서 유지 대상, overflow와 drawer 동작을 함께 관찰한다.
- [Risk] nickname offset 제거가 full/mobile 중 한 surface에만 반영되거나 다른 trigger 요소를 움직일 수 있다. → 두 surface에서 nickname과 trigger 중심 차이가 0인지 기존 geometry assertion으로 검증한다.
- [Risk] feedback glyph가 댓글 action으로 오인될 수 있다. → Post action에서 사용하는 `MessageCircle` 대신 전달 의미가 독립적인 `Mail`을 사용하고 기존 `피드백 보내기` accessible name을 유지한다.
- [Risk] 정적 Storybook assertion만으로 Native 실제 화면을 증명했다고 오해할 수 있다. → 자동화, Web 관찰과 실행하지 못한 Android/iOS runtime 검증을 구분해 보고한다.
- [Risk] feedback parent requirement를 child가 MODIFIED하면 archive 순서와 production smoke가 불필요하게 결합된다. → child는 feedback requirement를 건드리지 않고 `Mail` glyph만 자기 sidebar requirement에 기록한다.
- [Risk] full Web 개인정보 처리방침 링크가 Profile 유무나 rail geometry에 따라 사라지거나 충분히 아래에 배치되지 않을 수 있다. → full rail은 Profile과 무관하게 렌더링하고 Storybook geometry 및 인증 Web E2E에서 `/privacy` href를 검증한다. compact·mobile에서는 링크 부재를 직접 검증한다.
- [Risk] compact 로그아웃 wrapper의 full-width centering 때문에 다른 44px footer target과 중심선이 어긋날 수 있다. → 실제 bounding rect 중심을 Storybook interaction에서 비교하고, logout wrapper만 44px로 제한해 feedback geometry는 유지한다.
- [Risk] PROD-219의 오래된 `/menu` smoke task가 이후 완료 불가능해질 수 있다. → PROD-219 owner가 해당 active change를 archive하기 전에 현재 route set에 맞게 별도 정렬한다.

## Migration Plan

데이터·API migration은 없다. 공용 UI, route와 검증을 함께 배포한다. 회귀가 확인되면 해당 UI·route commit을 되돌려 기존 placeholder를 복원할 수 있지만, 받은 요청 화면을 제공하는 정상 복원은 PROD-566의 별도 Linear·OpenSpec이 소유한다. 해당 이슈는 Lucide `UserRoundPlus` 아이콘과 새 canonical route를 사용하며 generic `/menu` placeholder를 복원하지 않는다.

Archive는 PROD-541 자체 구현과 필수 검증이 완료되면 parent feedback production smoke와 독립적으로 수행한다. active `add-web-openpanel-product-analytics`의 production acceptance·archive는 PROD-575가 계속 소유하므로, 이 child는 해당 requirement 문구만 현재 responsive shell 계약에 맞추고 lifecycle을 대신 완료하지 않는다.

## Open Questions

없음.
