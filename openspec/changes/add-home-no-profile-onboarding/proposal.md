# Proposal: add-home-no-profile-onboarding

## Why

로그인했지만 선택 프로필(active profile)이 없는 사용자는 현재 `/`에서 다음에 무엇을 해야 하는지 알 수 없다. 홈은 아직 placeholder(`TestQuery` → `me { name }`) 한 화면뿐이라 선택 프로필 유무로 분기하지 않는다. 같은 사용자가 `/compose`에 가면 "프로필을 선택해주세요" 상태만 보이고, 정작 프로필을 만들거나 선택할 경로는 안내하지 않는다.

이 변경은 그 상태에 홈 중앙에 **프로필 온보딩 안내**를 표시하고, 기존 프로필 생성/선택 흐름(좌측 사이드바 프로필 스위처)으로 유도한다. 또한 `/compose`의 선택 프로필 없음 안내를 `/`으로 보내는 안내로 바꾼다. (Linear PROD-149)

이번 온보딩은 **임시(interim) 구현**이다. 프로필 생성/선택 플로우가 정식으로 구현·보강된 뒤 제대로 된 온보딩으로 교체/확장될 필요가 있다.

## What Changes

- 홈(`(tabs)/home/+page.svelte`, 라우트 `/home`)을 선택 프로필 유무로 분기한다. `TestQuery`를 `HomePageQuery`(`currentSession.selectedProfile`, `me.profiles`)로 교체한다.
  - 로그인 + 선택 프로필 없음: 타임라인 영역 자리 **대신** 프로필 온보딩 카드(아이콘 + 제목 + 보조 설명 + CTA)를 표시한다. 보유 프로필 유무에 따라 문구/라벨을 `프로필 만들기`/`프로필 선택`으로 분기한다.
  - 선택 프로필 있음 / 비로그인: 기존 홈 화면(향후 타임라인 자리)을 그대로 유지한다.
- 온보딩 카드(`lib/components/ProfileOnboarding.svelte`, 신규)는 GraphQL을 직접 소비하지 않는 프레젠테이션 컴포넌트로, 보유 프로필 여부와 CTA 콜백만 받는다. Storybook 스토리(`KOSMO/ProfileOnboarding`: 만들기 상태·선택 상태)를 추가한다.
- 온보딩 CTA는 새 생성/선택 흐름을 만들지 않고 **기존 사이드바 프로필 스위처**를 연다. 이를 위해 사이드바 스위처 open 상태를 탭 레이아웃(`(tabs)/+layout.svelte`)으로 끌어올리고(`SidebarNavigation`의 내부 상태 → bindable prop), 자식 라우트가 호출할 수 있도록 Svelte context(`lib/profileSwitcherContext.ts`, 신규)로 `openProfileSwitcher`를 노출한다. 모바일(`lg` 미만)에서는 사이드바 드로어를 먼저 연다.
- `/compose`(`(tabs)/compose/+page.svelte`)의 선택 프로필 없음 상태를 `/`으로 이동하는 안내(링크/버튼)로 바꾼다.
- (Non-goals) 다단계·"다음" 튜토리얼, 스포트라이트 코치마크, 정식 온보딩 디자인/카피 보강, 비로그인 전용 고정 온보딩 화면(별도 이슈), 로그인 시 기존 프로필 자동 선택(PROD-140, 백엔드)은 본 변경의 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 홈에 로그인 + 선택 프로필 없음 상태의 프로필 온보딩 표시, 온보딩 CTA가 기존 사이드바 프로필 생성/선택 흐름을 여는 동작(데스크톱/모바일 차이 포함) 요구사항을 추가한다.
- `post`: 새 글 작성 컴포넌트 사용처의 "선택 프로필이 없는 사용자" 처리 요구사항을 단순 "프로필 선택 필요 상태 표시"에서 "홈(`/home`)으로 이동해 프로필을 만들거나 선택하도록 안내(이동 링크 제공)"로 변경한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/home/+page.svelte`(교체), `routes/(tabs)/+layout.svelte`(스위처 상태 lift·context 제공·CTA), `routes/(tabs)/compose/+page.svelte`(안내 교체), `lib/components/SidebarNavigation.svelte`(스위처 open을 bindable prop으로), `lib/components/ProfileOnboarding.svelte`·`lib/components/ProfileOnboarding.stories.svelte`(신규), `lib/profileSwitcherContext.ts`(신규).
- 재사용: 기존 사이드바 프로필 생성/선택 흐름(`createProfile`/`selectProfile`)과 무효화 경로(`currentSession`+`me`), 시맨틱 디자인 토큰과 인라인 empty-state 마크업 패턴(`PostList`/`/compose`), `Button` 컴포넌트. 새 mutation/스키마 변경 없음.
- 소비 API: `currentSession.selectedProfile`, `me.profiles`(둘 다 기존 필드). 백엔드 변경 없음.
- 의존: **PROD-143(홈 라우트 `/`→`/home` 이동, PR #117) 위에 스택**한다. 홈 화면이 `(tabs)/home/+page.svelte`(라우트 `/home`)로 옮겨진 구조를 전제로, 그 홈에 온보딩을 얹는다. 또한 기존 `(tabs)` 셸과 사이드바 내비게이션 흐름 위에 얹힌다. PROD-140(로그인 시 기존 프로필 자동 선택)과는 hard block 관계가 아니며, PROD-140 머지 후에는 신규(프로필 0개) 사용자 위주로 노출된다.
