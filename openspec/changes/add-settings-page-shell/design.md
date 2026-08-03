## Context

`apps/app`은 Expo Router의 단일 route tree를 Android·iOS·Web에서 공유하고, `(tabs)/(protected)` 아래의 인증
화면을 `UniversalShell` 안에 렌더링한다. 현재 `SidebarNavigation`은 full sidebar, compact icon rail과 mobile
drawer가 같은 navigation 목록을 공유하지만 `설정` 항목은 없고, `BottomTabBar`는 별도 고정 항목 집합을
사용한다. mobile Web header 선택은 `shellLayout.ts`가 pathname을 분류하며 `/settings`는 아직 route-owned
header 기본 경로로 남아 있다.

PROD-645는 Byulmaru ID가 소유한 Account Settings의 외부 진입점·navigation을, PROD-648은 Kosmo가 소유한
Profile 기본 공개 범위 기능을 소유한다. PROD-653은 Account 기능을 구현하지 않고 canonical `/settings`,
외부 Account 진입점/내부 Profile 기능의 공통 정보 구조, shell navigation과 페이지 통합만 소유한다.
PROD-653 완료와 change archive는 두 자식 결과가 통합 가능해진 뒤에만 진행할 수 있다.

## Goals / Non-Goals

**Goals:**

- Expo Router 보호 route에 `/settings` page shell을 추가하고 모든 승인된 shell surface에서 진입하게 한다.
- Byulmaru ID Account 외부 진입점과 Kosmo Profile 내부 설정의 heading·설명·접근성 이름, 현재 Profile 대상과
  Profile empty/loading/error 상태를 공통 구조로 제공한다.
- PROD-645의 외부 navigation과 PROD-648의 Profile 데이터·상태·오류 경계를 유지하면서 같은 page에 결합될
  수 있는 좁은 통합 경계를 둔다.
- shell·route·Storybook과 platform별 검증에서 heading 중복, stale Profile data와 navigation 회귀를 잡는다.

**Non-Goals:**

- PROD-645의 별마루 ID 외부 URL, platform link API와 오류 정책 구현
- Kosmo 내부 Account settings route·UI, Account 데이터 query·input·save 또는 Account 관리 기능
- PROD-648의 DB·GraphQL·Relay mutation, 권한, Profile 전환 dirty state와 Composer 초기값 구현
- 범용 settings registry, nested settings router 또는 승인되지 않은 category placeholder
- 기존 shell breakpoint, bottom tab 구성, Profile switcher와 Relay actor 전환 계약 변경

## Implementation Guidance

### Current Constraints

- canonical route는 `apps/app/src/app/(tabs)/(protected)`에 있어야 기존 session guard와 universal route tree를
  재사용한다. Web 전용 route나 별도 Native screen을 만들면 route parity가 깨진다.
- `UniversalShell`의 query는 shell chrome에 필요한 session·selected Profile 최소 데이터만 소유한다. settings
  page의 Profile 표시 이름, `relativeHandle`과 PROD-648 fragment는 route query가 선언해야 하며 shell query
  결과를 route 전용 scalar prop으로 확장하지 않는다. PROD-645 Account 진입점을 위해 Account 데이터 query나
  mutation을 추가하지 않는다.
- `SidebarNavigation`의 한 목록이 full·compact·drawer를 함께 렌더링하므로 `설정`을 이 목록에 추가하면 세
  surface가 같이 활성화된다. `BottomTabBar`와 `RightRail`은 별도이므로 수정하지 않아야 중복 진입점이 생기지
  않는다.
- mobile Web의 header는 `getWebMobileShellHeader`가 소유하지만 Native에서는 route가 header를 소유한다.
  settings route가 모든 플랫폼에서 무조건 `PageHeader`를 렌더링하면 mobile Web에 `설정` heading이 두 번
  생긴다.
- 공용 `RouteBoundary`는 route 전체 Suspense/error fallback에 적합하다. PROD-645의 external navigation
  action과 PROD-648의 Profile query·mutation이 독립적으로 실패할 수 있으면 가장 가까운 child boundary가
  자기 section을 복구해야 하며 route boundary 하나로 두 section을 함께 숨기지 않는다. Account 외부 이동
  실패를 Account 데이터 조회 실패로 모델링하지 않는다.
- 기존 Profile 선택·생성 진입은 `ShellChromeContext.openProfileSwitcher()`가 breakpoint별 drawer/picker
  조립을 소유한다. settings empty state에서 별도 selector를 만들 필요가 없다.
- 현재 Shell Storybook은 준비되지 않은 Profile 설정 link가 없음을 검증한다. 새 canonical route와 page
  content를 같은 slice에 추가하면서 assertion을 실제 `설정` navigation과 route 동작으로 바꿔야 한다.

### Recommended Approach

1. settings route가 current session과 selected Profile identity를 읽는 top-level Relay query를 소유하고,
   공통 React Native page view에 필요한 fragment ref 또는 명시적 UI state를 전달한다. no-profile 상태는
   `ShellChromeContext`의 기존 Profile switcher action을 재사용한다. Account 진입점은 Account data fragment나
   mutation을 요구하지 않는다.
2. page view는 `계정 설정`, `프로필 설정` section과 공통 spacing·heading·소유권 설명·Profile 상태 배치만
   소유한다. `계정 설정`에는 PROD-645가 제공하는 Byulmaru ID 외부 진입점을 배치하고, `프로필 설정`에는
   PROD-648의 Kosmo 내부 control을 배치한다. 공통 shell은 Account UI·데이터·저장 또는 Profile 저장 상태를
   소유하지 않는다.
3. mobile Web에서는 shell header 분류에 `/settings`를 추가하고 route header를 숨긴다. Native와
   compact/full Web에서는 route가 기존 `PageHeader` text variant를 첫 heading으로 렌더링한다. 플랫폼 분기는
   공용 breakpoint helper 또는 기존 shell context를 사용해 한 곳에서 계산한다.
4. route와 PROD-645 외부 진입점·PROD-648 Profile content가 통합 가능한 commit에서 `SidebarNavigation`의 주요 목록에
   `/settings`와 설정 icon을 추가한다. active 판정, `GuardedLink`와 drawer close callback은 기존 navigation
   경로를 그대로 사용한다.
5. presentational state와 shell surface는 React Native Web Storybook 및 가까운 unit/component test로 검증하고,
   실제 Web forward navigation·history·reflow와 Android·iOS screen reader·font scaling·touch target은 각 runtime
   증거로 분리한다.

### Allowed Alternatives

- settings page view는 route 파일 안의 좁은 local component이거나 별도 settings component일 수 있다. child
  section을 교체하기 위한 범용 registry·schema가 없어도 specs와 section 소유권을 만족하면 허용한다.
- PROD-648 Profile feature는 route query에 fragment를 colocate하거나 자기 Suspense boundary 안에서 독립
  query를 소유할 수 있다. 어느 방식이든 Relay actor 전환 뒤 이전 Profile 결과를 새 identity 아래에 표시하지
  않고 section 오류 격리를 유지해야 한다. PROD-645 Account 진입점은 이 선택을 Account 데이터 조회 근거로
  사용하지 않는다.
- header 중복을 막는 플랫폼 판정은 기존 shell layout helper 확장 또는 page header 표시 여부를 계산하는 좁은
  공용 helper로 구현할 수 있다. route별 raw breakpoint 숫자와 `window` 직접 접근은 허용하지 않는다.

### Known Traps

- child 기능이 준비되기 전에 sidebar/drawer link만 먼저 노출해 빈 category나 placeholder로 이동시키는 것
- `/settings/account`, `/settings/profile` 같은 별도 canonical route를 OpenSpec 근거 없이 추가하는 것
- Kosmo 내부에 Account 설정 form·query·mutation·save state를 만들거나 `/settings`를 Byulmaru ID Account
  Settings 자체로 표현하는 것
- Account 외부 이동 실패를 Kosmo Account 데이터 loading/error로 모델링하는 것
- `설정`을 mobile bottom tab이나 full right rail에도 추가해 navigation 위계를 중복하는 것
- shell query에 settings 전용 field를 계속 누적하거나 selected Profile scalar를 route prop으로 수동 복제하는 것
- mobile Web shell header와 route `PageHeader`를 동시에 렌더링해 heading과 sticky chrome을 중복하는 것
- 이전 Relay environment 또는 local state의 Profile 설정값을 새 selected Profile의 loading fallback으로 쓰는 것
- child section 오류 하나를 route-level boundary로 승격해 정상인 다른 소유 단위까지 숨기는 것
- Web Storybook a11y 통과를 Native screen reader·touch target 또는 전체 WCAG 적합성 증거로 일반화하는 것

## Risks / Trade-offs

- [PROD-645·PROD-648의 통합 surface가 늦어져 settings navigation 노출이 지연될 수 있음] → 공통 shell 작업은
  component와 검증 경계까지 준비할 수 있지만, 실제 navigation·완료·archive task는 두 child 결과가 준비될
  때까지 pending으로 유지한다.
- [route query와 Profile child query의 Suspense 조합이 page 전체를 불필요하게 가릴 수 있음] → 공통 Profile
  identity에 필요한 최소 query만 route boundary에 두고 PROD-648 failure/loading은 Profile section 가까이에서
  처리한다. Account entry에는 데이터 Suspense를 만들지 않는다.
- [selected Profile 전환 시 identity와 control이 다른 Relay actor 결과를 잠시 조합할 수 있음] → revision 또는
  selected Profile ID가 바뀔 때 route/section boundary를 새 actor key에 맞춰 재평가하고 stale result를
  content로 유지하지 않는다.
- [full·compact·mobile surface를 한 navigation 목록에서 바꾸면 기존 shell story가 넓게 변경됨] → 기존
  `GuardedLink`, active semantics와 surface layout은 유지하고 설정 항목·header 분류에 한정한 회귀 검증을
  추가한다.

## Migration Plan

1. canonical 디자인과 OpenSpec Gate를 승인하고 PROD-645 외부 진입점·PROD-648 내부 Profile 기능의 통합
   가능한 component/API 경계를
   확인한다.
2. 공통 settings page shell과 상태 catalog를 구현하되 준비되지 않은 navigation은 노출하지 않는다.
3. PROD-645 외부 진입점과 PROD-648 내부 Profile feature를 각 section에 연결하고 같은 commit 범위에서
   `/settings` route, sidebar·rail·drawer navigation과 mobile Web header 분류를 활성화한다.
4. Relay/typecheck, unit/component, Storybook build·a11y와 Web runtime 검증을 수행하고 Android·iOS runtime
   확인 결과를 별도로 기록한다.
5. 회귀 시 settings navigation과 route를 함께 되돌린다. DB·GraphQL schema나 persisted data migration은 없어
   별도 data rollback은 필요하지 않다.

## Open Questions

없음.
