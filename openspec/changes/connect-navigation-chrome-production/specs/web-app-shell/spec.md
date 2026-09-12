## ADDED Requirements

### Requirement: 공용 navigation chrome Production presentation

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/icons.md`, `docs/design/page-header.md`, `docs/design/accessibility.md`, `DSN-41`, `PROD-796` — 유니버설 앱은 공용 `SidebarNavigation`, `BottomTabBar`, `SearchToolbar`의 canonical 시각·interaction 상태를 해당 Production shell과 검색 route에 표시해야 한다(MUST). 공용 presentation은 router·Relay·Session을 직접 소유해서는 안 되며(MUST NOT), Production 경계는 기존 route link, navigation guard, drawer, ProfileSwitcher, unread count, logout과 검색 query·focus 생명주기를 계속 소유해야 한다(MUST).

#### Scenario: Sidebar presentation을 Production에 표시

- **WHEN** full Web sidebar, compact Web rail 또는 mobile drawer가 렌더링된다
- **THEN** 시스템은 해당 presentation의 공용 `SidebarNavigation` geometry, icon, selected·pressed·focus와 Light/Dark 상태를 표시한다
- **AND** 기존 ProfileSwitcher, 주요 route, feedback surface와 drawer close·focus 동작을 유지한다
- **AND** full·drawer ProfileSwitcher의 아바타, 이름·핸들·팔로우 수 행과 navigation의 leading icon slot은 sidebar 안쪽 `space/24` 기준선에 정렬된다
- **AND** 이 가로 정렬은 기존 프로필 요약 높이, trigger 크기·수직 배치, 편집 버튼과 열린 picker의 화면상 위치를 유지한다
- **AND** full·drawer 행은 좌우 `space/16` 바깥 여백과 `space/8` 내부 visual inset을 사용하고, 가용 폭 `320px`에서 `288×45px` target, `20px` 너비의 icon slot과 `space/16` label 간격을 사용한다
- **AND** full·compact·drawer의 Profile Avatar는 `28×28px` 크기를 유지하며 공통 icon slot 중앙에 배치해 다른 아이콘과 가로 중심선을 맞추고, full·drawer의 label 시작점도 유지한다
- **AND** 가용 폭이 줄어들 때는 좌우 `space/16` 바깥 여백과 높이 `45px`를 유지한 채 행 폭을 줄인다
- **AND** full·drawer의 `설정 및 기타`는 `Settings` icon과 상태에 따른 `24px` `ChevronDown`·`ChevronUp`을 행 오른쪽 `24px` 안쪽에 표시하고, 열린 하위 `설정`·`로그아웃` 행은 `space/32` content inset을 사용한다
- **AND** 열린 utility의 하위 `설정`·`로그아웃` 행은 trigger 직후부터 `45px` 단위로 연속 배치한다
- **AND** full·drawer의 닫힌 utility footer는 첫 행을 divider 뒤 `4px`, 두 번째 행을 `49px`에 배치해 행 사이 간격을 두지 않는다
- **AND** compact utility는 기존 `Ellipsis` icon-only presentation과 `44×44px` target을 유지한다
- **AND** `/settings` 화면군의 full·drawer utility는 항상 펼쳐지고 하위 `설정` 행만 current로 표시되며, 다른 route로 이탈하면 닫힌다
- **AND** compact ActionMenu는 선택 후 dismiss되는 transient popover를 유지하고, `NavigationLink`로 감싼 `설정` 행도 `36px` 한 줄 target·padding·정렬을 보존한다

#### Scenario: Bottom tab presentation을 Production에 표시

- **WHEN** mobile Web, Android 또는 iOS의 하단 navigation이 렌더링된다
- **THEN** 시스템은 공용 `BottomTabBar`의 플랫폼별 높이와 safe area, 5개 destination, selected filled icon·primary label과 unread 상태를 표시한다
- **AND** selected 항목에 지속적인 채움 배경을 추가하지 않는다
- **AND** 기존 route link, navigation guard와 선택 Profile 진입 동작을 유지한다

#### Scenario: SearchToolbar presentation을 Production에 표시

- **WHEN** 사용자가 Web `/search`의 최초·입력·결과 상태를 본다
- **THEN** route는 공용 `SearchToolbar`의 menu·back·search·clear 표현과 접근 가능한 input 상태를 표시한다
- **AND** 기존 `q`·`tab`, submit·clear·back focus, browser history와 mobile drawer 동작을 유지한다
- **AND** Android/iOS 검색 header 구조는 변경하지 않는다

#### Scenario: 로그아웃 상태와 Session 생명주기 보존

- **WHEN** 사용자가 full·compact·drawer의 공용 sidebar에서 로그아웃을 실행한다
- **THEN** Production 경계는 기존 navigation guard와 runtime별 logout action을 실행한다
- **AND** 진행 중 중복 입력을 막고 보조 기술에 진행 상태를 전달한다
- **AND** 결과 불명 실패에서는 credential을 유지한 채 실패 안내와 다시 활성화된 재시도 control을 제공한다

#### Scenario: Navigation chrome 접근성 상태 보존

- **WHEN** 사용자가 pointer, keyboard 또는 screen reader로 Production navigation chrome을 조작한다
- **THEN** 시스템은 destination과 action에 맞는 role·accessible name·current·disabled·busy 상태를 제공한다
- **AND** 플랫폼별 최소 interaction target과 visible focus를 유지한다
- **AND** reduced motion 환경에서 상태 의미를 motion에만 의존하지 않는다

## MODIFIED Requirements

### Requirement: Primary navigation targets home route

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/local-timeline.md`, `docs/design/page-header.md`, `PROD-610`, `PROD-649`, `PROD-796` — 공통 navigation의 홈 항목은 실제 `/home` link를 유지해야 하며(MUST), compact·full Web의 홈 헤더 브랜드 마크도 같은 link와 일반 활성화 동작을 제공해야 한다(MUST). 모바일 Web·Android·iOS 브랜드 마크는 비상호작용 요소로 유지해야 한다(MUST). 현재 경로가 `/home` 또는 `/local`이면 navigation의 홈 항목은 Home/Local 화면군의 active 진입점으로 표시해야 하며(MUST), Local 전용 primary navigation 항목을 추가해서는 안 된다(MUST NOT). 다른 route에서 홈 진입 control을 일반 활성화하면 기존 guarded forward navigation으로 `/home`을 열어야 하고(MUST), Web에서 이미 `/home` 또는 `/local`이면 route를 바꾸지 않고 document scroll을 매번 최상단으로 이동하면서 현재 타임라인의 기존 Relay 새로고침 경로를 실행해야 한다(MUST). Home은 기존 `PROD-610`의 진행 중 중복 요청 방지와 마지막 성공 데이터 보존을 유지해야 한다(MUST). Local은 기존 `RouteBoundary.refetch()` 경로를 재사용해야 하며(MUST), 별도 요청 조정 계층이나 상태 표시를 추가해서는 안 된다(MUST NOT). modifier 또는 새 탭 활성화는 실제 `/home` link 의미를 유지하고 현재 타임라인 재선택을 실행해서는 안 된다(MUST NOT). 이 정책은 다른 현재 route 재선택, Android/iOS Native navigation 또는 Home·Local 외 Relay 데이터 정책을 변경해서는 안 된다(MUST NOT).

#### Scenario: Home navigation links to /home

- **WHEN** 사용자가 sidebar, mobile drawer, 하단 탭 바 또는 compact·full Web 홈 헤더의 브랜드 마크를 본다
- **THEN** 해당 홈 진입 control의 실제 link 대상은 `/home`이다

#### Scenario: Home item active on timeline routes

- **WHEN** 현재 경로가 `/home` 또는 `/local`이다
- **THEN** sidebar·mobile drawer·하단 탭 바의 홈 항목이 active로 강조된다

#### Scenario: No standalone Local primary item

- **WHEN** 사용자가 공통 sidebar, mobile drawer 또는 하단 탭 바를 본다
- **THEN** 시스템은 Local 전용 navigation 항목을 표시하지 않는다

#### Scenario: Navigate to home from another route

- **WHEN** 현재 경로가 `/home`과 `/local`이 아니고 사용자가 홈 진입 control을 일반 활성화한다
- **THEN** 시스템은 기존 guarded forward navigation으로 `/home`을 연다
- **AND** 현재 타임라인 재선택용 Relay 새로고침을 별도로 시작하지 않는다

#### Scenario: Reselect the current Web timeline route

- **WHEN** Web의 현재 경로가 `/home` 또는 `/local`이고 사용자가 활성 홈 항목이나 compact·full 브랜드 마크를 일반 활성화한다
- **THEN** 시스템은 route를 바꾸지 않고 document scroll을 최상단으로 이동한다
- **AND** 현재 Home 또는 Local이 이미 사용하는 Relay 새로고침 경로를 실행한다

#### Scenario: Reselect Home while refresh is in flight

- **WHEN** Home 재선택 새로고침이 진행 중이고 사용자가 해당 Web 진입점을 다시 일반 활성화한다
- **THEN** 시스템은 document scroll을 다시 최상단으로 이동한다
- **AND** 추가 Relay 네트워크 요청을 시작하지 않는다

#### Scenario: Reselect Home after refresh settles

- **WHEN** 이전 Home 재선택 새로고침이 성공 또는 실패로 종료된 뒤 사용자가 해당 Web 진입점을 일반 활성화한다
- **THEN** 시스템은 Home의 새로운 Relay 네트워크 요청을 정확히 한 번 시작한다
- **AND** 이전 요청이 실패했어도 현재 Home 데이터를 유지한다

#### Scenario: Reuse Local refresh without a new coordinator

- **WHEN** Web `/local`에서 사용자가 활성 홈 항목이나 compact·full 브랜드 마크를 일반 활성화한다
- **THEN** 시스템은 선택된 Local 탭이 이미 사용하는 `RouteBoundary.refetch()` 경로를 실행한다
- **AND** 별도 요청 조정 계층이나 새로고침 상태 표시를 추가하지 않는다

#### Scenario: Preserve the actual home link

- **WHEN** 현재 Web 타임라인에서 사용자가 modifier click 또는 새 탭 동작으로 활성 홈 항목이나 compact·full 브랜드 마크를 실행한다
- **THEN** browser는 실제 link 대상인 `/home`을 기존 방식으로 연다
- **AND** 현재 document scroll 이동이나 Relay 재선택을 시작하지 않는다

#### Scenario: Keep mobile brand marks non-interactive

- **WHEN** mobile Web, Android 또는 iOS header가 브랜드 마크를 렌더링한다
- **THEN** 브랜드 마크는 시각 geometry를 유지한다
- **AND** pointer·keyboard·screen reader용 navigation control로 노출되지 않는다

#### Scenario: Reselect another current route

- **WHEN** 사용자가 Home·Local이 아닌 현재 route의 navigation 항목을 다시 실행하거나 Android/iOS Native에서 홈을 다시 실행한다
- **THEN** 시스템은 이 요구사항에 따른 document 최상단 이동이나 Relay 새로고침을 추가하지 않는다
