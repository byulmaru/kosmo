<!-- PROD-91에서 이미 구현·검증 완료된 backfill 체인지. 아래 작업은 모두 완료 상태다. -->

## 1. 라우트 · 조회

- [x] 1.1 `(tabs)/@[handle]` 라우트 추가(`+layout.svelte`, `+page.svelte`)로 `/@{handle}` 접근 가능하게 한다
- [x] 1.2 `@` 프리픽스로 정적 엔드포인트(`/login`·`/graphql`·`/health`)와 충돌하지 않음을 확인한다
- [x] 1.3 `+layout.svelte`에서 `profileByHandle(handle:)` query를 `page.params.handle`로 조회한다

## 2. 프로필 헤더 · 공용 유틸

- [x] 2.1 `ProfileHero.svelte`(profile/loading prop)로 커버·아바타·이름·핸들·bio·카운트 표시를 구현한다
- [x] 2.2 `lib/utils/profile.ts`에 `getProfileInitial`·compact `formatCount`를 두고 ProfileHero·사이드바에서 공용 사용한다
- [x] 2.3 시맨틱 디자인 토큰으로 라이트/다크에 대응한다
- [x] 2.4 `ProfileHero.stories.svelte`(Default / No bio / Loading)를 추가한다

## 3. 상태 처리

- [x] 3.1 로딩 스켈레톤 + 스크린리더 안내를 표시한다
- [x] 3.2 조회 오류 시 안내 + 다시 시도 동작을 제공한다
- [x] 3.3 없는 프로필 시 인라인 빈 상태를 표시하고, 오류·빈 상태에서도 `(tabs)` 셸을 유지한다

## 4. 레이아웃 정렬

- [x] 4.1 공유 main을 건드리지 않고 프로필 라우트만 `self-start`로 탑정렬한다
- [x] 4.2 모바일 풀블리드 / 데스크톱 고정 폭 컬럼 가운데 정렬 + 라이트 구분선을 적용한다

## 5. 사이드바 진입점

- [x] 5.1 사이드바 "프로필" 항목을 선택된 프로필의 `/@{handle}`로 연결한다
- [x] 5.2 선택된 프로필이 없으면 해당 항목을 비활성화한다

## 6. 검증

- [x] 6.1 `svelte-check` 0 errors, `vite build`, `build-storybook` 통과를 확인한다
- [x] 6.2 main 머지 충돌(`SidebarNavigation.svelte`)을 해결해 PR을 MERGEABLE로 유지한다
