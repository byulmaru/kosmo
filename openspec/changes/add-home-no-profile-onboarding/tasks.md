# Tasks: add-home-no-profile-onboarding

## 1. 사이드바 스위처 상태 lift

- [x] 1.1 `lib/components/SidebarNavigation.svelte`의 내부 `profileSwitcherOpen` $state를 bindable prop `switcherOpen`(`$bindable(false)`)으로 전환하고, 본문·토글(`openProfileSwitcher`)·성공 핸들러의 참조를 모두 치환한다. `profileCreationOpen` 등 나머지 내부 상태는 유지한다

## 2. 레이아웃 wiring + context

- [x] 2.1 `lib/profileSwitcherContext.ts`를 추가한다: `setProfileSwitcherContext`/`getProfileSwitcherContext`(Symbol 키, `{ openProfileSwitcher: () => void }`)
- [x] 2.2 `(tabs)/+layout.svelte`에 `profileSwitcherOpen` $state를 두고 데스크톱·드로어 두 `SidebarNavigation`에 `bind:switcherOpen`을 연결한다
- [x] 2.3 `openProfileSwitcher()`를 추가한다: `lg` 미만이면 `openDrawer()` 후 스위처를 연다(`matchMedia('(min-width: 64rem)')`). `setProfileSwitcherContext({ openProfileSwitcher })`로 자식 라우트에 노출한다

## 3. 온보딩 카드 + Storybook

- [x] 3.1 `lib/components/ProfileOnboarding.svelte`를 추가한다(fragment 없는 프레젠테이션, props `{ hasProfiles?: boolean; onAction: () => void }`). 아이콘(`Icon` suffix Lucide) + 제목 + 보조 설명 + `Button` CTA, 시맨틱 토큰 사용. 보유 프로필 유무로 문구/라벨 분기(`프로필 만들기`/`프로필 선택`). **임시 온보딩**·후속 보강 필요(PROD-149) 주석을 남긴다
- [x] 3.2 `lib/components/ProfileOnboarding.stories.svelte`를 추가한다(`KOSMO/ProfileOnboarding`): 만들기 상태(`hasProfiles=false`)·선택 상태(`hasProfiles=true`)

## 4. 홈 분기

- [x] 4.1 `(tabs)/+page.svelte`의 `TestQuery`를 `HomePageQuery`(`currentSession { id selectedProfile { id } }`, `me { id profiles { id } }`)로 교체한다
- [x] 4.2 로그인 + 선택 프로필 없음일 때 `<ProfileOnboarding>`을 렌더하고 CTA에 context의 `openProfileSwitcher`를 연결한다. 선택 프로필 있음/비로그인은 기존 화면을 유지하고, 로딩 깜빡임을 방지한다

## 5. compose 안내

- [x] 5.1 `(tabs)/compose/+page.svelte`의 선택 프로필 없음 카드를 홈(`/`) 이동 안내(문구 교체 + 링크/버튼)로 바꾼다

## 6. 검증

- [x] 6.1 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [x] 6.2 `pnpm lint:eslint`, `pnpm lint:prettier` 통과를 확인한다(루트 prettier 글롭이 Windows 셸에서 동작하지 않으면 변경 파일은 pre-commit lint-staged로 검증)
- [x] 6.3 `openspec validate add-home-no-profile-onboarding --strict` 통과를 확인한다
- [ ] 6.4 로컬 웹 앱에서 상태별(프로필 0개·미선택·선택됨·비로그인, `/compose` 미선택) 동작을 확인한다 — 브라우저 시각 확인은 작성자/리뷰어가 진행

## 7. 후속 (이 변경 범위 밖 · 별도 이슈)

- [ ] 7.1 프로필 생성/선택 플로우 정식 구현 후 정식 온보딩(디자인/카피/플로우)으로 교체·보강한다 — PROD-149 후속
- [ ] 7.2 비로그인 전용 고정 온보딩 화면을 추가한다 — 별도 이슈
