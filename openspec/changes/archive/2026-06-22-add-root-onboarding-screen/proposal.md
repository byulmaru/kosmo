## Why

선행 작업 PROD-143이 홈을 `/home`으로 옮기고 루트 `/`를 `/home`으로의 임시 리다이렉트로 비워 두었다. 이제 `/`는 비로그인 사용자가 처음 만나는 온보딩(로그인 시작) 진입점이어야 한다. 본 변경(Linear PROD-142)은 그 임시 리다이렉트를 실제 분기로 교체한다: 비로그인 사용자에게는 Welcome 온보딩 화면을 보여주고, 로그인 사용자는 `/home`으로 보낸다.

## What Changes

- `routes/+page.server.ts`의 무조건 `/home` 리다이렉트를 **세션 조건부 분기**로 교체한다. 유효 세션이면 `/home`으로 리다이렉트하고, 아니면 Welcome 온보딩을 렌더링한다.
- 루트 `/`에 비로그인 Welcome 화면(`routes/+page.svelte`)을 추가한다. `(tabs)` 앱 셸(사이드바·하단 탭·우측 레일) 없이 독립으로 선다.
- Welcome 본문을 `OnboardingHero` 컴포넌트로 분리하고 Storybook 스토리를 추가한다. CTA "시작하기"는 로그인 시작(`/login`)으로 이동한다.
- (범위 외) 비로그인 보호 라우트(`/home`·`/compose`·`/search`) → `/` 되돌림은 PROD-148, 프로필 생성(Create Profile) 화면·로그인 후 프로필 없음 온보딩은 PROD-149가 담당한다.

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-app-shell`: 루트 경로 `/`가 더 이상 무조건 `/home`으로 리다이렉트하지 않는다. 비로그인 사용자에게는 로그인 온보딩(Welcome) 화면을 렌더링하고, 로그인(유효 세션) 사용자만 `/home`으로 리다이렉트한다.

## Impact

- `apps/web/src/routes/+page.server.ts` 수정 (무조건 리다이렉트 → 세션 검증 분기)
- `apps/web/src/routes/+page.svelte` 신규 (Welcome 온보딩 화면)
- `apps/web/src/lib/components/OnboardingHero.svelte`, `OnboardingHero.stories.svelte` 신규
- 세션 검증에 `@kosmo/core`(`sessionName`)·`@kosmo/core/db`(`Sessions`)·`@kosmo/core/enums`(`SessionState`) 사용 (`login/callback/+server.ts`와 동일 경계)
- API·데이터 모델 영향 없음
