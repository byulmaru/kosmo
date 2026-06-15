## Context

현재 홈은 `apps/web/src/routes/(tabs)/+page.svelte`가 URL `/`를 담당한다. `(tabs)`는 URL에 영향을 주지 않는 라우트 그룹이고, `(tabs)/+layout.svelte`가 앱 셸(사이드바·하단 탭·우측 레일)을 제공한다. 홈 화면 자체는 아직 플레이스홀더(`TestQuery` + "홈" 텍스트)이며, 함께 있는 `(tabs)/+page.server.ts`의 `accountName` 반환값은 페이지에서 사용되지 않는다.

내비게이션 홈 링크는 사이드바·하단 탭 두 컴포넌트에 각각 `href: '/'`로 하드코딩돼 있고(공유 config 없음), active 판정은 `page.url.pathname === href` 정확 매칭이다. 로그인 콜백(`login/callback/+server.ts`)은 로그인 후 `/`로 리다이렉트한다.

이 변경은 온보딩을 `/`에 두려는 PROD-142의 선행 작업으로, 홈을 `/home`으로 옮겨 `/`를 비운다.

## Goals / Non-Goals

**Goals:**

- 홈 콘텐츠를 `/home`으로 이동하되 앱 셸 적용은 유지한다.
- 모든 홈 진입점(내비게이션, 루트 접근, 로그인 후)을 `/home` 기준으로 정리한다.
- `/`를 단독 머지해도 앱이 깨지지 않도록 `/home`으로의 임시 리다이렉트를 둔다.

**Non-Goals:**

- `/`의 실제 온보딩 화면, 로그인/비로그인 분기, 조건부 리다이렉트(PROD-142).
- 홈 타임라인 콘텐츠 구현(현재 플레이스홀더 유지).
- 내비게이션 항목을 공유 config로 통합하는 리팩터링.

## Decisions

- **홈을 `(tabs)/home/`으로 이동**: `(tabs)` 그룹 안에 두어 상위 `+layout.svelte`의 앱 셸을 그대로 상속한다. 별도 셸 재구성 불필요. 대안인 "그룹 밖 `/home`"은 셸을 잃으므로 기각.
- **`/` 리다이렉트는 `(tabs)` 그룹 밖 `routes/+page.server.ts`에 배치**: `/`는 셸이 필요 없고, PROD-142의 온보딩 화면도 앱 셸 없이 독립으로 서는 게 자연스럽다. 서버 사이드 리다이렉트로 렌더 전에 처리해 플래시가 없다.
- **307(임시) 리다이렉트 사용**: PROD-142가 곧 교체하므로 브라우저가 영구 캐시하지 않도록 301 대신 307을 쓴다.
- **미사용 `(tabs)/+page.server.ts` 제거**: 페이지가 GraphQL `me.name`을 직접 쓰고 server load의 `accountName`을 참조하지 않으므로, 이동하면서 불필요한 DB 쿼리를 제거한다.
- **active 판정 로직은 유지**: 정확 매칭(`pathname === href`)이라 링크 대상만 `/home`으로 바꾸면 `/home`에서 정상 동작한다.
- **로그인 후 진입점을 `/home`으로 직접 변경**: 로그인 직후 사용자는 확정적으로 홈으로 가야 하므로 `/` 경유 이중 리다이렉트 대신 `/home`을 직접 가리킨다.

## Risks / Trade-offs

- [`routes/+page.server.ts`만 두고 `+page.svelte`가 없으면 SvelteKit이 라우트를 거부할 수 있음] → load가 항상 redirect하면 일반적으로 허용되지만, 빌드/체크에서 문제가 생기면 빈 `routes/+page.svelte` placeholder를 추가한다(PROD-142가 온보딩으로 대체).
- [`/`를 가리키는 다른 내부 링크가 남아 회귀] → `apps/web/src`에서 홈을 가리키는 `href="/"`/`redirect('/')`/`goto('/')` 잔여 참조를 grep으로 확인한다.
- [단독 머지 시 `/` 동작] → 임시 리다이렉트로 앱이 깨지지 않게 보장한다.

## Migration Plan

- 본 변경은 라우트 이동 + 진입점 정리로, 데이터 마이그레이션이나 롤백 절차가 필요 없다.
- PROD-142는 `routes/+page.server.ts`의 임시 리다이렉트를 비로그인 온보딩 + 로그인 사용자 `/home` 리다이렉트로 교체한다.

## Open Questions

(없음)
