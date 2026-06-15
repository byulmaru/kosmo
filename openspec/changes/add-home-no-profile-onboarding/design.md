# Design: add-home-no-profile-onboarding

## Context

홈 `(tabs)/+page.svelte`는 placeholder 한 화면(`TestQuery` → `me { name }`)에서 시작했고 선택 프로필 유무로 분기하지 않는다. 상위 `(tabs)/+layout.svelte`는 이미 `currentSession.selectedProfile`을 조회하고, `invalidateSidebarNavigationData()`(=`currentSession`+`me` 무효화)를 `onProfileStateChanged`로 `SidebarNavigation`에 넘긴다. 프로필 생성/선택 흐름은 `SidebarNavigation.svelte`가 소유한다(`createProfile`→`selectProfile`→`onProfileStateChanged()`, 내부 `profileSwitcherOpen` 상태로 스위처 드롭다운 토글). 데스크톱 사이드바는 `hidden lg:block`로 항상 보이고, 모바일은 `{#if drawerOpen}` 드로어(`lg:hidden`)로 `SidebarNavigation`을 한 번 더 렌더한다. `Session.selectedProfile`은 스키마에서 nullable이다.

## Goals / Non-Goals

**Goals:**

- 로그인 + 선택 프로필 없음 상태에서 홈 타임라인 자리 대신 프로필 온보딩 안내를 표시한다.
- 온보딩 CTA로 기존 사이드바 프로필 생성/선택 흐름을 연다(데스크톱/모바일 차이 처리).
- `/compose` 선택 프로필 없음 상태를 `/`으로 안내한다.
- Storybook에서 온보딩 만들기/선택 상태를 확인할 수 있게 한다.

**Non-Goals:**

- 다단계·"다음" 튜토리얼, 스포트라이트 코치마크.
- 정식 온보딩 디자인/카피 보강(임시 구현).
- 비로그인 전용 고정 온보딩 화면(별도 이슈).
- 로그인 시 기존 프로필 자동 선택(PROD-140, 백엔드).

## Decisions

- **단일 중앙 카드로 시작한다.** 다단계 튜토리얼/스포트라이트 대안과 비교해, 위치 계산·단계 엔진·드로어 연동 비용이 크고 이번 범위(임시 온보딩)에 과하다. 아이콘 + 제목 + 보조 설명 + CTA 1개로 둔다.
- **생성/선택은 기존 사이드바 스위처를 재사용하고 온보딩은 유도만 한다.** `createProfile`/`selectProfile` mutation을 온보딩에 복제하지 않는다(생성/선택 책임은 `SidebarNavigation`이 소유). 무효화도 기존 `onProfileStateChanged`(`currentSession`+`me`) 경로를 그대로 타서, 성공 시 레이아웃·홈 query가 함께 갱신되고 온보딩이 사라진다.
- **온보딩 컴포넌트는 fragment 없는 프레젠테이션 컴포넌트로 둔다.** 보유 프로필 여부(`hasProfiles`)와 CTA 콜백(`onAction`)만 받는다. GraphQL을 직접 소비하지 않으므로 Storybook에 Mearie mock이 필요 없고, 데이터 소유는 라우트(`+page.svelte`)에 둔다(route query colocation 컨벤션).
- **스위처 open 상태를 탭 레이아웃으로 끌어올리고 context로 노출한다.** `SidebarNavigation`의 내부 `profileSwitcherOpen`을 bindable prop `switcherOpen`으로 바꿔 레이아웃이 소유하고, 데스크톱·드로어 두 인스턴스에 같은 상태를 bind한다. 자식 라우트(홈)는 layout이 `setContext`로 노출한 `openProfileSwitcher`를 `getContext`로 받아 CTA에 연결한다. 기존 context/전역 store 패턴이 없어 최소 타입 안전 모듈(`profileSwitcherContext.ts`)을 새로 도입한다.
- **모바일에서는 드로어를 먼저 연다.** 사이드바가 `lg` 미만에서 드로어로만 보이므로, `openProfileSwitcher`는 `window.matchMedia('(min-width: 64rem)')`로 데스크톱 여부를 판단해 모바일이면 `openDrawer()` 후 스위처를 연다. `lg` 기본값은 64rem(1024px).
- **`/compose`는 안내만 바꾼다.** 자동 `goto` 리다이렉트 대신, 기존 카드 문구를 교체하고 `/` 이동 링크/버튼을 제공한다("안내한다" 요구에 부합, 진입 맥락 유지).

## Risks / Trade-offs

- [데스크톱·드로어 두 `SidebarNavigation`이 같은 `switcherOpen`을 공유한다] → 두 인스턴스는 동시에 보이지 않으므로(데스크톱 `lg:block` vs 드로어 `lg:hidden`) 상태 공유가 안전하다. 보이지 않는 인스턴스의 스위처 open은 화면에 영향이 없다.
- [`matchMedia` breakpoint가 코드의 `lg` 토큰과 어긋날 수 있다] → 구현 시 `layout.css`/tailwind 설정의 `lg` 값을 확인하고, 어긋나면 같은 값으로 맞춘다.
- [임시 온보딩 카피/레이아웃이 추후 정식 디자인과 달라진다] → 토큰 기반 마크업이라 교체 비용이 작고, 컴포넌트가 분리되어 있어 교체 지점이 명확하다. 코드 주석과 PR 본문에 임시 구현임을 남긴다.
- [PROD-140 머지 전에는 재로그인 사용자가 일시적으로 온보딩을 볼 수 있다] → PROD-140과 hard block이 아니며, 자동 선택이 들어오면 노출 빈도가 줄어든다. 동작상 문제는 아니다.
