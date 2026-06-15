## Context

PROD-143 이후 루트 `/`는 `(tabs)` 그룹 밖 `routes/+page.server.ts`의 `load`에서 `redirect(307, '/home')`만 수행한다. `(tabs)/home/+page.svelte`가 앱 셸 안에서 홈을 담당한다. 세션은 `kosmo_session` 쿠키(`@kosmo/core`의 `sessionName`)에 토큰으로 저장되고, `login/callback/+server.ts`가 `@kosmo/core/db`의 `Sessions`에 `SessionState.ACTIVE` 레코드를 만든 뒤 쿠키를 굽고 `/home`으로 보낸다.

Figma는 `05 Screens - Web → 🔑 Onboarding` 섹션에 Welcome(좌상단 브랜드 + 좌하단 Hero)과 Create Profile 두 화면을 둔다. 본 변경은 Welcome만 구현한다(Create Profile은 PROD-149 책임).

## Goals / Non-Goals

**Goals:**

- 비로그인 `/`에서 로그인 온보딩(Welcome)을 보여준다.
- 로그인(유효 세션) 사용자가 `/`에 오면 서버에서 렌더 전에 `/home`으로 보낸다.
- Welcome 본문을 재사용·시각 검증 가능한 컴포넌트(`OnboardingHero`)로 둔다.

**Non-Goals:**

- Create Profile(핸들 정하기) 전용 화면, 로그인 후 프로필 없음 온보딩(PROD-149).
- 비로그인 보호 라우트 가드(PROD-148), 로그인 시 기존 프로필 자동 선택(PROD-140).
- 홈 타임라인 콘텐츠.

## Decisions

- **Welcome을 `(tabs)` 그룹 밖 `routes/+page.svelte`에 둔다**: Figma처럼 앱 셸(사이드바·탭바·우측레일) 없이 독립으로 선다. 루트 `+layout.svelte`(폰트·테마)만 상속한다.
- **`/` 분기는 단순 쿠키 존재가 아니라 DB로 ACTIVE 세션을 검증한다**: 후속 PROD-148(`/home` 비로그인 → `/`)과 "로그인" 판정 기준이 어긋나면 `/ ↔ /home` 리다이렉트 루프가 생긴다. `login/callback`과 동일한 `Sessions`/`SessionState.ACTIVE` 기준으로 맞춰 루프를 방지한다. 무효/만료 쿠키는 비로그인으로 간주해 Welcome을 보여준다.
- **서버 사이드 리다이렉트(렌더 전)**: 로그인 사용자에게 Welcome이 깜빡이지 않도록 `+page.server.ts`의 `load`에서 처리한다. 임시 307이 아니라 의미상 영구적이지 않은 인증 분기이므로 307(임시)을 유지한다.
- **CTA는 `Button` 컴포넌트 대신 토큰 클래스를 입힌 `<a href="/login">`**: `Button.svelte`는 `<button>` 전용(anchor 미지원)이고, 온보딩 진입은 JS 없이도 동작하는 실제 링크여야 한다. `Button`에 anchor 변형을 추가하는 리팩터링은 범위를 넘으므로 보류한다.
- **색/폰트/치수는 `layout.css @theme` 토큰 사용**: Figma `get_design_context`로 매핑하되 값은 토큰 이름으로 참조한다(하드코딩 금지). 코드는 기존 SUIT/Pretendard 토큰 그대로(Figma의 Inter/Noto는 대치 표기일 뿐).

## Risks / Trade-offs

- [루트 `/`에 `+page.svelte`가 생기면, 로그인 사용자 분기는 반드시 `load`에서 먼저 redirect해야 플래시가 없다] → `load`에서 redirect 후에만 페이지가 렌더되도록 한다.
- [세션 검증 쿼리가 매 `/` 진입마다 1회 추가] → 인덱스된 토큰 조회 1건으로 비용이 작다. 비로그인은 쿼리 없이 바로 Welcome.
- [PROD-143 미머지 → 본 변경은 스택 PR] → prod-143 리베이스/머지 시 함께 리베이스한다.

## Open Questions

(없음)
