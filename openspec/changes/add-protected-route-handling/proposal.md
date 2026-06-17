## Why

앱 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)은 로그인 상태를 전제로 하지만, 현재 비로그인 사용자도 URL로 직접 진입할 수 있고 각 화면이 제각각 "로그인 필요" 폴백을 그려 정책이 중복돼 있다. 선행 PROD-142가 루트 `/`를 비로그인 온보딩(Welcome) 진입점으로 만들었으므로, 이제 보호 라우트 접근 시 `/`로 되돌리는 가드를 한곳에 두고 화면별 중복을 정리한다. 공개 프로필 `/@{handle}`만 비로그인 조회를 유지한다. (Linear PROD-148)

## What Changes

- 보호 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)을 `(tabs)/(protected)/` 라우트 그룹으로 모으고, `(tabs)/(protected)/+layout.svelte`에 클라이언트 보호 가드를 둔다. 가드는 자체 `currentSession` 쿼리로 유효 세션이 없으면(`currentSession === null`) 루트 `/`로 `goto`한다(로딩·에러 중에는 보류).
- 공개/보호 경계를 라우트 구조로 표현한다. 공개 프로필 `@[handle]` 서브트리(게시글 상세 `+page@(tabs)` 포함)는 `(protected)` 밖에 있어 가드가 적용되지 않고 비로그인 조회를 유지한다(기존 `page.route.id` prefix 매칭 제거).
- `(tabs)/+layout.svelte`는 앱 셸 책임만 유지하고 보호 가드를 들지 않는다(`TabsLayoutQuery`로 사이드바·우측 레일은 그대로 그린다).
- 화면별 중복 비로그인 폴백 정리는 유지한다: `compose/+page.svelte`의 "로그인이 필요해요" 분기 제거(프로필 선택 안내는 유지), `home/+page.svelte`의 비로그인 위임 주석을 `(protected)` 가드 기준으로 갱신.
- (범위 외) 루트 `/` 온보딩·로그인 동선은 PROD-142, 로그인 후 프로필 없음 온보딩은 PROD-149, 로그인 후 원래 목적지 복귀(deep-link)는 본 범위 밖. 세션 확인 중 스플래시 표시는 후속 이슈.

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-app-shell`: `(tabs)` 앱 셸 아래 보호 라우트는 유효 세션이 없으면 루트 온보딩(`/`)으로 이동한다. 세션 유효성은 클라이언트 `currentSession` 쿼리로 판정한다(쿠키 존재 아님). 공개 프로필 `@[handle]`은 `(protected)` 그룹 밖에 있어 가드에서 제외되고 비로그인 조회를 유지한다. 비로그인 사용자가 `/home`에 직접 도달하던 동작(프로필 없음 온보딩 요구사항의 비로그인 시나리오)은 가드 리다이렉트로 대체된다.

## Impact

- `apps/web/src/routes/(tabs)/(protected)/+layout.svelte` 신규 (클라 가드 `$effect` + 자체 `currentSession` 쿼리)
- `apps/web/src/routes/(tabs)/{home,compose,search,notifications,menu}/` → `(tabs)/(protected)/` 아래로 이동
- `apps/web/src/routes/(tabs)/+layout.svelte` 수정 (보호 가드 제거, 앱 셸만 유지)
- `apps/web/src/routes/(tabs)/(protected)/compose/+page.svelte` 수정 (중복 비로그인 폴백 제거)
- `apps/web/src/routes/(tabs)/(protected)/home/+page.svelte` 수정 (비로그인 위임 주석 갱신)
- 세션 검증은 기존 `currentSession`(API) 재사용 — 새 API·데이터 모델 영향 없음. 가드 쿼리는 `cache-and-network`로 부모 `(tabs)` 쿼리 캐시를 즉시 활용한다.
- 서버 가드(`(tabs)/+layout.server.ts`) 신규 없음.
