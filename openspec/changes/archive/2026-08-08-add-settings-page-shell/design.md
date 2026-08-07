## Context

`apps/app`은 Expo Router의 단일 route tree를 Android·iOS·Web에서 공유하고, `(tabs)/(protected)` 아래의 인증
화면을 `UniversalShell` 안에 렌더링한다. 현재 `SidebarNavigation`은 full sidebar, compact icon rail과 mobile
drawer가 같은 navigation 목록을 공유하지만 `설정` 항목은 없고, `BottomTabBar`는 별도 고정 항목 집합을
사용한다. full Web은 중앙 최대 600px와 일반 `RightRail`을 분리해 렌더링하고, mobile Web header 선택은
`shellLayout.ts`가 pathname을 분류한다. `/settings` route family와 settings 전용 wide workspace는 아직 없다.

PROD-645는 Byulmaru ID가 소유한 Account Settings 외부 진입점을, PROD-667은 Kosmo가 소유한 Profile 기본
공개 범위 control을 소유한다. PROD-653은 canonical `/settings` 정보 구조를 확정한 완료된 선행 이슈다.
PROD-685는 production route·navigation·두 child 조립과 자동화된 page-level 검증을, PROD-684는 최종 Settings
통합과 change 완료·archive를 소유한다. 실제 Web 보조기술과 Android·iOS runtime QA는 PROD-727이 비차단
후속 이슈로 소유한다. Backend 계약은 PROD-648에 남고 이 change가 재구현하지 않는다.

## Goals / Non-Goals

**Goals:**

- Expo Router 보호 route에 `/settings` page shell을 추가하고 모든 승인된 shell surface에서 진입하게 한다.
- root 목록에 현재 승인된 Account 외부 진입점과 Profile 내부 진입점을 직접 제공한다.
- full Web에서 전역 sidebar를 유지하고 일반 RightRail 대신 Settings master-detail workspace를 제공한다.
- compact/mobile/native에서 root 목록과 detail을 한 화면씩 탐색하고 이전 navigation stack과 무관하게
  detail의 back action으로 Settings root에 돌아간다.
- PROD-645의 외부 navigation과 PROD-667의 Profile detail 데이터·상태·오류 경계를 유지한다.
- shell·route·Storybook과 platform별 검증에서 pane/header 중복, stale Profile data와 navigation 회귀를 잡는다.

**Non-Goals:**

- PROD-645의 별마루 ID 외부 URL, platform link API와 오류 정책 구현
- Kosmo 내부 Account settings route·UI, Account 데이터 query·input·save 또는 Account 관리 기능
- PROD-648의 DB·GraphQL과 PROD-667의 Relay mutation, 권한, Profile 전환 dirty state와 Composer 초기값 구현
- 승인되지 않은 미래 category·placeholder, 범용 settings registry 또는 항목 하나만 가진 category 계층
- 기존 shell breakpoint, bottom tab 구성, Profile switcher와 Relay actor 전환 계약 변경
- settings 밖 route의 중앙 column과 RightRail 동작 변경

## Implementation Guidance

### Current Constraints

- canonical route는 `apps/app/src/app/(tabs)/(protected)`에 있어야 기존 session guard와 universal route tree를
  재사용한다. Web 전용 route나 별도 Native screen을 만들면 route parity가 깨진다.
- `UniversalShell`의 query는 shell chrome에 필요한 session·selected Profile 최소 데이터만 소유한다. settings
  page의 Profile 표시 이름, `relativeHandle`과 PROD-667 fragment는 settings Profile child가 선언해야 하며 shell query
  결과를 route 전용 scalar prop으로 확장하지 않는다. PROD-645 Account 진입점을 위해 Account 데이터 query나
  mutation을 추가하지 않는다.
- `SidebarNavigation`의 한 목록이 full·compact·drawer를 함께 렌더링하므로 `설정`을 이 목록에 추가하면 세
  surface가 같이 활성화된다. `BottomTabBar`에는 추가하지 않는다. `RightRail`은 설정 진입점을 소유하지 않지만
  full Web settings route family에서는 일반 rail 자체를 숨기고 그 폭을 workspace에 제공해야 한다.
- mobile Web의 header는 `getWebMobileShellHeader`가 소유하지만 Native에서는 route가 header를 소유한다.
  settings route가 모든 플랫폼에서 무조건 `PageHeader`를 렌더링하면 mobile Web에 `설정` heading이 두 번
  생긴다.
- 새 presentational `SettingsItem`은 Mobile Figma cell의 행 높이·padding·divider와 필수 label, 선택적
  leading·description·trailing content·selected presentation을 container-width 기반 조합 API로 제공한다.
  새 설정 행을 추가할 때 component 수정이나 feature 이름별 분기가 필요하지 않아야 하며
  Link·Pressable·focus·accessible name과 feature 상태·조회·persistence semantics는 흡수하지 않는다.
- Profile detail은 필요한 Profile query·loading·error·empty·content와 재시도를 자기 화면 안에서 소유한다.
  settings shell은 Profile 오류를 Account entry와 결합하거나 child error type을 해석하지 않는다. Account 외부
  이동 lifecycle은 브라우저·OS가 소유하므로 Account data error boundary나 retry state를 만들지 않는다.
- 기존 Profile 선택·생성 진입은 `ShellChromeContext.openProfileSwitcher()`가 breakpoint별 drawer/picker
  조립을 소유한다. settings empty state에서 별도 selector를 만들 필요가 없다.
- 현재 Shell Storybook은 준비되지 않은 Profile 설정 link가 없음을 검증한다. 새 canonical route와 page
  content를 같은 slice에 추가하면서 assertion을 실제 `설정` navigation과 route 동작으로 바꿔야 한다.

### Recommended Approach

1. `(protected)` 아래에 `/settings` root와 내부 detail을 공유하는 route family를 둔다. root는 현재 승인된
   시각 label `계정 설정`인 Byulmaru ID 외부 entry와 `게시물 기본 공개 범위` 내부 entry를 직접 구성하고 미래 category나
   registry를 만들지 않는다.
2. full Web에서는 global sidebar를 유지하고 일반 `RightRail`을 숨긴 뒤 center+right 폭을 약 320px master와
   flexible detail로 나눈다. `/settings` root는 Profile detail을 기본 선택한다. document scroll과 기존
   `full=1280` breakpoint는 유지한다.
3. compact/mobile/native root는 두 entry 목록부터 표시한다. 내부 entry는 한 화면짜리 detail route를 열고
   shell 또는 route-owned header의 back action으로 `/settings` root를 명시적으로 연다. full에서도 같은
   detail route를 직접 열 수 있으며 Settings navigation은 root와 detail에서 current 상태를 유지한다. Native
   inbound link처럼 unrelated 화면이 이전 navigation stack에 남아 있어도 back action은 그 화면을 열지 않는다.
4. `SettingsItem`은 master·하위 목록의 공통 geometry와 composition만 제공한다. Account child는 external
   Link·focus·accessible name을, Profile entry/detail은 내부 navigation·Profile query·상태·persistence를
   소유한다. Profile 공개 범위의 구체적인 선택·저장 interaction은 shell contract로 고정하지 않는다.
5. mobile Web에서는 root에 menu+`설정`, detail에 back+detail title을 shell header로 표시한다. Native와
   compact Web은 route-owned text header를 사용하고, full Web은 master와 detail pane이 각 heading을 소유한다.
6. route와 PROD-645 외부 진입점·PROD-667 Profile detail이 통합 가능한 commit에서
   `SidebarNavigation`에 `/settings`를 추가하고 route-specific RightRail visibility를 활성화한다. active 판정,
   `GuardedLink`와 drawer close callback은 기존 navigation 경로를 재사용한다.
7. presentational state와 shell surface는 React Native Web Storybook 및 가까운 unit/component test로 검증하고,
   실제 Web forward navigation·history는 Playwright로 확인한다. Web 보조기술과 Android·iOS screen reader·
   font scaling·touch target runtime 증거는 PROD-727로 분리한다. 구현이 안정된 뒤 기존 Figma Settings frames는
   보존하고 별도 PROD-685 frames를 추가해 production 구조와 정렬한다.

### Allowed Alternatives

- root/detail은 nested layout의 명시적 child 구성 또는 동등한 route composition으로 구현할 수 있다. exact
  내부 segment와 component 파일 배치는 구현 선택이며 `/settings` hub, deep-link parity와 back 동작을
  만족해야 한다.
- full workspace 폭은 master 약 320px와 flexible detail을 기본으로 하되 기존 breakpoint·reflow와 관찰 가능한
  hierarchy를 유지하는 가까운 theme-token 값으로 조정할 수 있다.
- PROD-667 Profile feature는 detail route query에 fragment를 colocate하거나 자기 boundary 안에서 독립 query를
  소유할 수 있다. 어느 방식이든 Relay actor 전환 뒤 이전 Profile 결과를 새 identity 아래에 표시하지 않는다.
- header 중복을 막는 플랫폼 판정은 기존 shell layout helper 확장 또는 page header 표시 여부를 계산하는 좁은
  공용 helper로 구현할 수 있다. route별 raw breakpoint 숫자와 `window` 직접 접근은 허용하지 않는다.

### Known Traps

- child 기능이 준비되기 전에 sidebar/drawer link만 먼저 노출해 빈 category나 placeholder로 이동시키는 것
- 내부 detail을 별도 최상위 route로 만들거나 Byulmaru ID Account용 Kosmo detail route를 추가하는 것
- Kosmo 내부에 Account 설정 form·query·mutation·save state를 만들거나 `/settings`를 Byulmaru ID Account
  Settings 자체로 표현하는 것
- Account 외부 이동 실패를 Kosmo Account 데이터 loading/error로 모델링하는 것
- `설정`을 mobile bottom tab이나 일반 right rail에도 추가해 navigation 위계를 중복하는 것
- full settings에서 일반 RightRail과 Settings detail을 함께 렌더링해 workspace 폭을 다시 600px로 압축하는 것
- shell query에 settings 전용 field를 계속 누적하거나 selected Profile scalar를 route prop으로 수동 복제하는 것
- mobile Web shell header와 route `PageHeader`를 동시에 렌더링해 heading과 sticky chrome을 중복하는 것
- 이전 Relay environment 또는 local state의 Profile 설정값을 새 selected Profile의 loading fallback으로 쓰는 것
- Profile 오류 종류와 복구를 master 목록이나 Account entry가 해석하는 것
- 공용 `SettingsItem`이 feature 이름별 variant를 요구하거나 Link·Pressable·mutation·persistence lifecycle까지
  소유하는 것
- 현재 두 항목을 위해 `계정`·`프로필` 같은 한 항목짜리 category를 만들거나 미래 placeholder를 노출하는 것
- route 내부 ScrollView로 Web document scroll·history restoration을 바꾸는 것
- Web Storybook a11y 통과를 Native screen reader·touch target 또는 전체 WCAG 적합성 증거로 일반화하는 것

## Risks / Trade-offs

- [PROD-645·PROD-667의 통합 surface가 늦어져 settings navigation 노출이 지연될 수 있음] → 공통 shell 작업은
  component와 검증 경계까지 준비할 수 있지만, 실제 navigation·완료·archive task는 두 child 결과가 준비될
  때까지 pending으로 유지한다.
- [Profile detail query가 master navigation state와 결합될 수 있음] → Profile detail만 자기 query·오류·재시도를
  소유하고 master entry 구성은 data registry나 Profile query 결과에서 만들지 않는다.
- [selected Profile 전환 시 identity와 control이 다른 Relay actor 결과를 잠시 조합할 수 있음] → revision 또는
  selected Profile ID가 바뀔 때 route/section boundary를 새 actor key에 맞춰 재평가하고 stale result를
  content로 유지하지 않는다.
- [settings 전용 full workspace가 기존 feed/right rail을 바꿀 수 있음] → route family에서만 일반 RightRail을
  숨기고 다른 route의 center 600px와 rail visibility가 유지되는 회귀 검증을 추가한다.
- [full·compact·mobile surface를 한 navigation 목록에서 바꾸면 기존 shell story가 넓게 변경됨] → 기존
  `GuardedLink`, active semantics를 유지하고 설정 항목·route-specific layout·header 분류에 한정한 회귀
  검증을 추가한다.

## Migration Plan

1. canonical 디자인과 OpenSpec Gate를 승인하고 PROD-645 외부 진입점·PROD-667 내부 Profile 기능의 통합
   가능한 component/API 경계를
   확인한다.
2. 공통 Settings root/detail route, `SettingsItem`, full wide workspace와 compact/mobile/native one-pane
   navigation을 구현하되 준비되지 않은 navigation은 노출하지 않는다.
3. PROD-645 외부 진입점과 PROD-667 내부 Profile detail을 연결하고 같은 commit 범위에서 `/settings` route
   family, sidebar·rail·drawer navigation, route-specific RightRail visibility와 mobile Web header 분류를
   활성화한다.
4. Relay/typecheck, unit/component, Storybook build·a11y와 Web navigation runtime 검증을 수행한다. 실제 Web
   보조기술과 Android·iOS runtime QA는 PROD-727에 환경·증거·결함 후속 조치와 함께 기록한다.
5. 기존 Figma Settings frames를 유지하고 별도 PROD-685 frames를 추가해 구현된 item·상태·breakpoint 구조를
   정렬한 뒤 PROD-684에 완료 증거와 PROD-727 QA handoff를 인계한다. PROD-727은 이 change archive를 차단하지
   않으며 실제 결함은 별도 구현 이슈와 PR로 추적한다.
6. 회귀 시 settings navigation과 route를 함께 되돌린다. DB·GraphQL schema나 persisted data migration은 없어
   별도 data rollback은 필요하지 않다.

## Open Questions

없음.
