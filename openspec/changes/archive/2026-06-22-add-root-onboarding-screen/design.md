## Context

PROD-143 이후 루트 `/`는 `(tabs)` 그룹 밖 `routes/+page.server.ts`의 `load`에서 `redirect(307, '/home')`만 수행했다. `(tabs)/home/+page.svelte`가 앱 셸 안에서 홈을 담당한다. 세션은 `kosmo_session` 쿠키(`@kosmo/core`의 `sessionName`)에 토큰으로 저장되고, `login/callback/+server.ts`가 `@kosmo/core/db`의 `Sessions`에 `SessionState.ACTIVE` 레코드를 만든 뒤 쿠키를 굽고 `/home`으로 보낸다. 쿠키→Bearer 전달은 `routes/graphql/+server.ts`가, 세션 검증은 API가 한다(`currentSession`은 `withAuth({login:true})` + `unauthorizedResolver: () => null`).

Figma는 `05 Screens - Web → 🔑 Onboarding` 섹션에 Welcome(좌상단 브랜드 + 좌하단 Hero)과 Create Profile 두 화면을 둔다. 본 변경은 Welcome만 구현한다(Create Profile은 PROD-149 책임).

## Goals / Non-Goals

**Goals:**

- 비로그인 `/`에서 로그인 온보딩(Welcome)을 보여준다.
- 로그인(유효 세션) 사용자가 `/`에 오면 클라이언트에서 `currentSession` 검증 후 `/home`으로 보낸다.
- Welcome 본문을 재사용·시각 검증 가능한 컴포넌트(`OnboardingHero`)로 둔다.

**Non-Goals:**

- Create Profile(핸들 정하기) 전용 화면, 로그인 후 프로필 없음 온보딩(PROD-149).
- 비로그인 보호 라우트 가드(PROD-148), 로그인 시 기존 프로필 자동 선택(PROD-140).
- 홈 타임라인 콘텐츠.

## Decisions

- **Welcome을 `(tabs)` 그룹 밖 `routes/+page.svelte`에 둔다**: Figma처럼 앱 셸(사이드바·탭바·우측레일) 없이 독립으로 선다. 루트 `+layout.svelte`(폰트·테마)만 상속한다.
- **`/` 로그인 분기는 클라이언트 `currentSession` GraphQL 검증으로 한다**(서버 쿠키 존재 체크 아님): `currentSession`은 API가 `Sessions.ACTIVE`+`Accounts.ACTIVE`로 검증해 만료·폐기 세션이면 `null`을 반환하므로, 쿠키 존재만 보던 방식의 "무효 쿠키 오리다이렉트" 결함을 없앤다. 클라에서 `createQuery`로 받아 `$effect`+`goto('/home')`로 이동한다. apps/web 기존 인증 패턴(`(tabs)/+layout.svelte`)과 동일.
- **`/`는 Welcome을 항상 렌더하는 공개 페이지로 둔다**: `+page.server.ts`(서버 per-쿠키 분기)를 제거해 `/` 응답이 모두 동일 → 캐시 안전(서버 분기가 클라 캐시와 꼬이는 문제 해소). 비로그인은 즉시 SSR Welcome. 트레이드오프(아래).
- **CTA는 `Button` 컴포넌트 대신 토큰 클래스를 입힌 `<a href="/login">`**: `Button.svelte`는 `<button>` 전용(anchor 미지원)이고, 온보딩 진입은 실제 링크여야 한다. `Button` anchor 변형 추가는 범위를 넘으므로 보류.
- **색/크기/radius는 토큰·기존 스케일에 바인딩(arbitrary 하드코딩 금지)**: 색·radius·`text-md`·`text-sm` 등은 토큰으로 참조. `@theme` 전용 토큰이 없는 Figma 크기(h1 32px·각주 13px)는 새 토큰을 만들기보다 가장 가까운 기존 스케일에 바인딩한다 — h1 → `text-3xl`(30px), 각주 → `text-xsm`(12px). 정확한 값이 필요해지면 그때 Foundation 토큰 추가. 폰트는 기존 SUIT/Pretendard.

## Risks / Trade-offs

- [로그인 사용자가 `/` 직접 진입 시 Welcome 플래시] → `currentSession` resolve 전까지 Welcome이 잠깐 보였다가 `/home`으로 이동. 비로그인 진입이 대부분인 공개 페이지라 즉시 표시·SEO를 우선해 수용. (플래시 제거하려면 세션 확인까지 콘텐츠를 숨겨야 하나, 그러면 비로그인 첫 페인트가 느려져 트레이드오프가 나쁨.)
- [쿼리 실패·네트워크 오류] → `currentSession` 미확인 시 Welcome 유지(fail-open). 안전한 기본값.
- [PROD-148(`/home` 비로그인 → `/` 가드)과의 일관성] → PROD-148도 같은 `currentSession` 검증 기준을 쓰면 `/`↔`/home` 판정이 일치(별도 이슈).

## Open Questions

(없음)
