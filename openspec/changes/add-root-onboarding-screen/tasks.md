## 1. Welcome 화면 컴포넌트

- [x] 1.1 `apps/web/src/lib/components/OnboardingHero.svelte` 신규: eyebrow(`KOSMO`)·h1(`나만의 타임라인, 여기서 시작하세요`)·서브텍스트·CTA·각주. CTA는 `<a href="/login">`에 primary 토큰 클래스(`bg-primary text-text-primary …`).
- [x] 1.2 `apps/web/src/lib/components/OnboardingHero.stories.svelte` 신규: 기본 상태 스토리.
- [x] 1.3 Figma `get_design_context`로 토큰·치수 매핑. 색/radius/크기는 토큰·기존 스케일에 바인딩(arbitrary 금지). 토큰 없는 32px·13px는 가까운 스케일(`text-3xl`·`text-xsm`)에 바인딩.

## 2. 루트 Welcome 라우트

- [x] 2.1 `apps/web/src/routes/+page.svelte` 신규: 좌상단 브랜드(K 로고 + `KOSMO`) TopBar + `<OnboardingHero>`. `(tabs)` 셸 미적용. Welcome 항상 렌더(공개 페이지).

## 3. 루트 로그인 분기 (클라 GraphQL 검증)

- [x] 3.1 `apps/web/src/routes/+page.server.ts` 제거 — 서버 쿠키 분기 삭제. `/`는 서버 per-쿠키 분기가 없는 공개 페이지(캐시 안전).
- [x] 3.2 `apps/web/src/routes/+page.svelte`에 `createQuery(graphql('query RootOnboardingQuery { currentSession { id } }'))` + `$effect`: `currentSession`가 있으면(유효 세션) `goto('/home', { replaceState: true })`. 무효/없음이면 Welcome 유지.

## 4. 검증

- [x] 4.1 `pnpm --filter @kosmo/web check` 통과(mearie generate + 라우트 타입 재생성 포함).
- [x] 4.2 `pnpm --filter @kosmo/web build` 성공.
- [ ] 4.3 동작 확인: 비로그인 `/` → Welcome(SSR 즉시), `시작하기` → `/login`; 로그인(유효 세션) `/` → `/home`; **무효·만료 세션 쿠키 보유 시 `/` → Welcome 유지(잘못 리다이렉트 안 함)**.
- [ ] 4.4 `apps/web/src`에 부정확한 잔여 참조 없음 grep 확인.
- [x] 4.5 `pnpm exec openspec validate add-root-onboarding-screen --strict` 통과.
