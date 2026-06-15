## Why

앱 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)은 로그인 상태를 전제로 하지만, 현재 비로그인 사용자도 URL로 직접 진입할 수 있고 각 화면이 제각각 "로그인 필요" 폴백을 그려 정책이 중복돼 있다. 선행 PROD-142가 루트 `/`를 비로그인 온보딩(Welcome) 진입점으로 만들었으므로, 이제 보호 라우트 접근 시 `/`로 되돌리는 가드를 한곳에 두고 화면별 중복을 정리한다. 공개 프로필 `/@{handle}`만 비로그인 조회를 유지한다. (Linear PROD-148)

## What Changes

- `(tabs)/+layout.svelte`에 클라이언트 보호 가드를 추가한다. 기존 `TabsLayoutQuery`의 `currentSession`을 재사용해, 유효 세션이 없으면(`currentSession === null`) 루트 `/`로 `goto`한다.
- 공개 프로필 `@[handle]` 서브트리(게시글 상세 `+page@(tabs)` 포함)는 `page.route.id` prefix로 가드에서 제외한다.
- 화면별 중복 비로그인 폴백을 정리한다: `compose/+page.svelte`의 "로그인이 필요해요" 분기 제거(프로필 선택 안내는 유지), `home/+page.svelte`의 비로그인 위임 주석 갱신.
- (범위 외) 루트 `/` 온보딩·로그인 동선은 PROD-142, 로그인 후 프로필 없음 온보딩은 PROD-149, 로그인 후 원래 목적지 복귀(deep-link)는 본 범위 밖.

## Capabilities

### New Capabilities

(없음)

### Modified Capabilities

- `web-app-shell`: `(tabs)` 앱 셸 아래 보호 라우트는 유효 세션이 없으면 루트 온보딩(`/`)으로 이동한다. 세션 유효성은 클라이언트 `currentSession` 쿼리로 판정한다(쿠키 존재 아님). 공개 프로필 `@[handle]`은 비로그인 조회를 유지한다. 비로그인 사용자가 `/home`에 직접 도달하던 동작(프로필 없음 온보딩 요구사항의 비로그인 시나리오)은 가드 리다이렉트로 대체된다.

## Impact

- `apps/web/src/routes/(tabs)/+layout.svelte` 수정 (클라 가드 `$effect` 추가, `$app/navigation`·`$app/state` 사용)
- `apps/web/src/routes/(tabs)/compose/+page.svelte` 수정 (중복 비로그인 폴백 제거)
- `apps/web/src/routes/(tabs)/home/+page.svelte` 수정 (비로그인 위임 주석 갱신)
- 세션 검증은 기존 `currentSession`(API) 재사용 — 새 쿼리·API·데이터 모델 영향 없음
- 서버 가드(`(tabs)/+layout.server.ts`) 신규 없음
