## Context

PROD-852는 router·Relay와 분리된 공용 `SidebarNavigation`, `BottomTabBar`, `SearchToolbar` 및 Storybook 계약을 추가했다. Production은 아직 `components/shell`의 이전 visual tree와 `/search`의 인라인 toolbar를 사용한다. 단순 치환하면 `NavigationLink`의 실제 link·guard·scroll 기록, `ProfileSwitcher`, unread Relay 상태, drawer focus, `LogoutControl`의 pending/error와 검색 query·focus 소유권이 사라진다.

Home은 `ShellChromeContext`에 Web 재선택 callback을 등록하지만 Local은 자기 `TimelineTabs` 재선택만 처리한다. 따라서 `/local`에서 active Home control을 실행하면 실제 `/home` link가 일반 route 이동으로 처리된다.

## Goals / Non-Goals

### Goals

- 세 공용 navigation chrome presentation을 실제 shell과 Web 검색 route에 연결한다.
- 기존 route·link·guard·Relay·ProfileSwitcher·drawer·logout·검색 생명주기를 보존한다.
- Web `/home`과 `/local`의 active Home control 및 compact·full 브랜드 마크를 현재 타임라인 재선택으로 통합한다.
- 공용 component story와 실제 Production 소비 story/test를 함께 검증한다.

### Non-Goals

- GraphQL·API·database·Session logout 정책이나 검색 결과 정책을 변경하지 않는다.
- UniversalShell 구조, route hierarchy, ProfileSwitcher와 drawer lifecycle을 재설계하지 않는다.
- 모바일 브랜드 마크를 control로 만들거나 Android/iOS 하단 navigation의 재선택·scroll 동작을 추가하지 않는다.
- 화면별 navigation chrome override나 미래용 public prop을 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- 공용 UI는 controlled presentation이고 Production `NavigationLink`는 Expo Router link, modifier·새 탭, navigation guard와 primary scroll intent를 소유한다.
- `/local`의 Home control은 시각적으로 active지만 실제 href `/home`이 현재 pathname과 달라 기존 `onCurrentNavigate` 분기에 들어가지 않는다.
- `SidebarNavigation` Production wrapper는 ProfileSwitcher와 scroll surface를 소유하고, `LogoutControl`은 `useLogout`·guard와 visual tree를 함께 소유한다.
- `/search`는 menu/back phase, `q`·`tab`, input ref와 drawer ref를 route 안에서 관리한다. 공용 toolbar의 내부 ref만으로 기존 외부 focus/drawer 계약을 대체할 수 없다.

### Recommended Approach

1. `components/shell/SidebarNavigation.tsx`와 `BottomTabBar.tsx`는 Production adapter로 유지한다. pathname, Relay profile·unread, safe area, presentation과 destination을 계산하고 공용 UI에 전달한다.
2. 공용 navigation control에 현재 Production 소비자가 필요한 좁은 render seam을 추가한다. 기본값은 기존 `Pressable`이며 Production adapter는 동일 visual control을 `NavigationLink`로 감싸 실제 href, modifier·새 탭, guard와 primary scroll 기록을 보존한다.
3. `NavigationLink`가 실제 href와 별도로 Home/Local 화면군의 현재 상태를 받을 수 있게 하고, 일반 활성화에만 현재 타임라인 callback을 실행한다. 기존 shell callback을 재사용하고 Home·Local route가 각각 document top 이동과 자기 새로고침 경로를 등록한다. Home은 기존 중복 요청 방지를 유지하고 Local은 별도 coordinator 없이 `RouteBoundary.refetch()`를 사용한다.
4. compact·full Web `PageHeader` 브랜드 마크는 같은 실제 `/home` link와 현재 timeline callback을 사용한다. mobile Web·Android·iOS에는 href나 press handler를 전달하지 않는다.
5. `SidebarNavigation` adapter가 기존 `useLogout`과 navigation guard를 직접 연결하고, 공용 presentation에는 현재 필요한 pending·error만 전달한다. 중복 visual `LogoutControl`은 다른 소비자가 없으면 제거한다.
6. `/search`에서는 인라인 toolbar 구간만 공용 `SearchToolbar`로 교체한다. route가 leading phase, input value, submit·clear·back, drawer와 focus를 계속 소유하도록 필요한 ref·expanded 상태만 현재 소비 범위에서 노출한다.
7. component Storybook은 순수 presentation 계약을 유지하고, `Shell.stories.tsx`와 `Search.stories.tsx`는 실제 adapter·route 연결을 증명한다.

### Allowed Alternatives

- 기존 `LogoutControl`을 작은 render callback controller로 남겨도 된다. 단, 공용 Sidebar의 visual 상태를 사용하고 hook·guard를 중복 구현하지 않아야 한다.
- render seam의 이름과 타입은 기존 `ActionMenu.renderTrigger` 패턴에 맞게 조정할 수 있다. router·Relay를 공용 UI로 이동하거나 visual markup을 adapter에서 복제해서는 안 된다.
- SearchToolbar focus 연결은 forwarded ref 또는 명시적 focus callback 중 더 작은 쪽을 사용할 수 있다. 기존 clear/back focus 결과가 동일해야 한다.

### Known Traps

- `onNavigate`에서 `router.navigate()`만 호출하면 Web link role, modifier·새 탭과 navigation guard가 회귀한다.
- `/local`에서 href만 `/home`으로 두면 현재 Local 재선택이 아니라 Home 이동이 된다. 반대로 href를 `/local`로 바꾸면 새 탭의 canonical Home 의미가 달라진다.
- logout callback만 연결하면 서버 중복 방지는 남더라도 disabled·busy·failure alert·retry UI가 사라진다.
- ProfileSwitcher를 공용 Sidebar 내부로 옮기거나 drawer scroll owner를 제거하면 picker overlay와 긴 drawer의 배치가 회귀한다.
- SearchToolbar가 query나 phase를 자체 state로 복제하면 deep link, back/forward와 input focus가 어긋난다.

## Risks / Trade-offs

- 공용 UI의 render seam은 public API를 조금 늘리지만 현재 Production link 의미를 보존하는 실제 소비 요구에만 한정한다.
- 실제 href `/home`과 `/local`에서의 일반 활성화 결과가 다르므로 `NavigationLink` 회귀 테스트가 필요하다.
- Android/iOS는 같은 공용 presentation source를 사용하지만 이번 작업에서 실제 기기 runtime 완료를 주장하지 않는다.
- full·compact·drawer의 기존 layout을 한 공용 visual tree로 전환하므로 Light/Dark와 390·1024·1440 Web 시각 QA가 필요하다.
