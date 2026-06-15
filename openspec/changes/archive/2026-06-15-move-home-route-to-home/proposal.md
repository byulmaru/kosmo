## Why

온보딩을 루트(`/`)에 배치하려면 먼저 `/`를 점유하고 있는 홈 화면을 비워야 한다. 현재 `/`는 앱 셸(사이드바·하단탭·우측레일)을 포함한 홈 화면을 직접 렌더링해, 비로그인 온보딩이 들어갈 자리가 없다. 본 변경은 홈을 `/home`으로 옮기고 내비게이션 진입점을 `/home` 기준으로 정리해 `/`와 `/home`의 책임을 분리한다. (Linear PROD-143, 후속 PROD-142가 `/`에 온보딩을 채운다)

## What Changes

- 홈 콘텐츠 진입점을 `/`에서 `/home`으로 옮긴다. `(tabs)` 레이아웃(앱 셸)은 그대로 적용된다.
- `/`는 `/home`으로 보내는 임시 리다이렉트 진입점이 된다. (후속 PROD-142가 비로그인 온보딩 + 로그인 사용자 `/home` 리다이렉트로 교체)
- 사이드바·하단 탭 바의 홈 링크와 active 강조 기준을 `/`에서 `/home`으로 맞춘다.
- 로그인 콜백의 로그인 후 진입점을 `/`에서 `/home`으로 바꾼다.
- 기존 탭 셸 레이아웃·하단 탭 바 표시 동작은 변경하지 않는다.
- (범위 외) `/`의 실제 온보딩 화면과 로그인/비로그인 분기는 PROD-142가 담당한다.

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-app-shell`: 홈 콘텐츠 진입점이 `/`에서 `/home`으로 이동하고, 공통 내비게이션(사이드바·하단 탭)의 홈 링크와 active 기준이 `/home`이 된다. `/`는 `/home`으로의 임시 리다이렉트 진입점이 된다.

## Impact

- `apps/web/src/routes/(tabs)/+page.svelte` → `apps/web/src/routes/(tabs)/home/+page.svelte`로 이동
- `apps/web/src/routes/(tabs)/+page.server.ts` 제거 (페이지에서 미사용인 죽은 server load)
- `apps/web/src/routes/+page.server.ts` 신규 (`/` → `/home` 307 리다이렉트)
- `apps/web/src/lib/components/SidebarNavigation.svelte`, `apps/web/src/lib/components/BottomTabBar.svelte` 홈 링크 `href` 변경
- `apps/web/src/routes/login/callback/+server.ts` 로그인 후 리다이렉트 대상 변경
- API·데이터 모델 영향 없음
