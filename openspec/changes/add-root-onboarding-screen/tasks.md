## 1. Welcome 화면 컴포넌트

- [x] 1.1 `apps/web/src/lib/components/OnboardingHero.svelte` 신규: eyebrow(`KOSMO`)·h1(`나만의 타임라인, 여기서 시작하세요`)·서브텍스트·CTA·각주. CTA는 `<a href="/login">`에 primary 토큰 클래스(`bg-primary text-text-primary …`).
- [x] 1.2 `apps/web/src/lib/components/OnboardingHero.stories.svelte` 신규: 기본 상태 스토리.
- [x] 1.3 Figma `get_design_context`로 토큰·치수 매핑. 색/radius/크기는 토큰·기존 스케일에 바인딩(arbitrary 금지). 토큰 없는 32px·13px는 가까운 스케일(`text-3xl`·`text-xsm`)에 바인딩.

## 2. 루트 Welcome 라우트

- [x] 2.1 `apps/web/src/routes/+page.svelte` 신규: 좌상단 브랜드(K 로고 + `KOSMO`) TopBar + `<OnboardingHero>`. `(tabs)` 셸 미적용.

## 3. 루트 서버 분기

- [x] 3.1 `apps/web/src/routes/+page.server.ts` 수정: `cookies.get(sessionName)` 존재로 분기 — 있으면 `redirect(307, '/home')`, 없으면 `return {}`(Welcome 렌더). 세션 유효성 검증은 API/보호 라우트(PROD-148)가 담당(apps/web의 `graphql/+server.ts`와 동일 패턴, `drizzle-orm` 신규 의존 없음).

## 4. 검증

- [x] 4.1 `pnpm --filter @kosmo/web check` 통과(라우트 타입 재생성 포함).
- [x] 4.2 `pnpm --filter @kosmo/web build` 성공.
- [ ] 4.3 동작 확인: 비로그인 `/` → Welcome, `시작하기` → `/login`; 로그인 `/` → `/home`; `/home` 정상.
- [ ] 4.4 `apps/web/src`에 부정확한 잔여 참조 없음 grep 확인.
- [ ] 4.5 `pnpm exec openspec validate add-root-onboarding-screen --strict` 통과.
