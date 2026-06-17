## Context

`(tabs)` 그룹은 내부 화면(home·compose·search·notifications·menu)과 공개 프로필 `@[handle]`(및 게시글 상세 `+page@(tabs)`)을 함께 담는다. `(tabs)/+layout.svelte`는 이미 `TabsLayoutQuery`로 `currentSession { id, selectedProfile }`를 클라이언트에서 조회해 사이드바·우측 레일을 그린다. 세션 검증은 API가 한다: `currentSession`은 `withAuth({ login: true })` + `unauthorizedResolver: () => null`이라 만료·폐기 세션이면 `null`을 반환한다. 쿠키→Bearer 전달은 `routes/graphql/+server.ts`가 한다.

선행 PROD-142가 루트 `/`를 "Welcome 항상 렌더 + 유효 세션이면 클라이언트에서 `goto('/home')`"로 만들었다(서버 쿠키 분기 제거). 본 변경(PROD-148)은 그 반대 방향 — 보호 라우트에 비로그인/무효 세션으로 접근하면 `/`로 되돌리는 가드를 같은 검증 기준으로 추가한다.

가드의 "어디에 두는가"는 PR #121 리뷰에서 재검토했다. 초기 구현은 `(tabs)/+layout.svelte`에서 `page.route.id` prefix(`/(tabs)/@[handle]`)로 공개 라우트를 제외하는 방식이었으나, 공개/보호 케이스가 늘수록 prefix 매칭이 계속 관리 포인트가 된다는 지적이 있었다. 보호 경계를 라우트 트리 구조로 흡수하는 `(protected)` 그룹 분리로 전환한다.

## Goals / Non-Goals

**Goals:**

- 비로그인·무효 세션 사용자가 보호 라우트(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)에 접근하면 루트 온보딩(`/`)으로 보낸다.
- 정책을 한곳(`(protected)` 레이아웃)에 두어 화면별 중복 비로그인 처리를 없앤다.
- 공개 프로필 `@[handle]`(게시글 상세 포함)은 비로그인 조회를 유지한다.
- 공개/보호 경계를 prefix 문자열이 아니라 라우트 구조로 표현해, 케이스가 늘어도 관리 포인트가 증가하지 않게 한다.

**Non-Goals:**

- 루트 `/` 온보딩·로그인 동선(PROD-142), 로그인 후 프로필 없음 온보딩(PROD-149).
- 로그인 후 원래 목적지로 복귀하는 deep-link return URL.
- 서버 사이드 가드.
- 세션 확인 구간 splash 표시(후속 이슈). 본 변경은 기존 fail-open 동작을 그대로 유지한다.

## Decisions

- **가드는 클라이언트 `currentSession` 검증으로 한다(서버 쿠키 존재 체크 아님)**: 쿠키 존재 ≠ 유효 세션. 만료·폐기 쿠키 보유자를 서버 쿠키 가드는 통과시켜 `/home`에서 깨진 상태를 보이고, 쿠키를 의존성으로 추적하지 않는 서버 분기는 클라 내비게이션 캐시와 꼬인다. `currentSession`은 API가 `Sessions.ACTIVE`+`Accounts.ACTIVE`로 검증해 무효 세션을 `null`로 주므로 비로그인과 동일하게 다룬다. PROD-142 루트 분기와 동일 기준 → `/`↔`/home` 판정 일관, 루프 없음.
- **보호 화면을 `(tabs)/(protected)/` 라우트 그룹으로 모으고 가드를 그 레이아웃에 둔다**: 공개/보호 경계를 라우트 트리 구조(파일 위치)로 표현한다. `(protected)/+layout.svelte`는 자체 최소 쿼리 `currentSession { id }`로 가드만 수행하고, 앱 셸(사이드바·우측 레일)은 부모 `(tabs)/+layout.svelte`가 그대로 그린다. `cache-and-network`이므로 부모가 이미 받은 `currentSession`을 캐시에서 즉시 채워 추가 네트워크 비용이 사실상 없다. prefix 문자열(`page.route.id`) 매칭이 사라져 공개/보호 케이스가 늘어도 라우트 위치로 흡수된다. `(protected)`는 URL에 드러나지 않으므로 `/home` 등 경로는 그대로다.
- **공개 프로필은 `(protected)` 밖에 둬서 제외**: `@[handle]` 서브트리는 `(tabs)` 직속이라 `(protected)` 가드가 적용되지 않는다. 게시글 상세(`+page@(tabs)`)도 `@[handle]` 하위이며 breakout 대상이 `(tabs)` 셸이라 `(protected)` 가드를 거치지 않고 비로그인 조회를 유지한다.
- **로딩·에러 중에는 리다이렉트 보류(fail-open)**: `query.loading`/`query.error` 동안에는 판단하지 않아 유효 세션·일시 오류 사용자를 잘못 튕기지 않는다.
- **세션 확인 중 children 게이팅은 하지 않는다(현행 fail-open 유지)**: `(protected)` 레이아웃에서 세션 resolve 전 `children` 렌더를 막으면 보호 화면 본문 플래시는 줄지만, 스켈레톤 플래시 수용은 PROD-142와 동일 트레이드오프로 이미 합의됐고 splash 도입은 후속 이슈다. 본 변경은 동작 변화 없이 구조만 바꾸므로 `{@render children()}`를 그대로 렌더하고 `$effect`에서 리다이렉트한다. 단, `(protected)` 레이아웃으로 분리해 둔 덕에 후속 splash는 공개 라우트를 건드리지 않고 이 레이아웃에 자연스럽게 스코프된다.
- **`goto('/', { replaceState: true })`**: 보호 라우트가 히스토리에 남아 뒤로가기로 재진입→재튕김되는 것을 막는다. 루트 `/+page.svelte`의 `goto('/home', { replaceState: true })`와 대칭.
- **중복 폴백 정리**: 가드 도입 후 비로그인은 보호 라우트에 도달하지 못하므로 `compose`의 "로그인이 필요해요" 분기는 unreachable → 제거한다. 프로필 선택 안내(`!selectedProfile`)는 별개 관심사(PROD-149)라 유지한다.

## Risks / Trade-offs

- [비로그인 보호 라우트 진입 시 스켈레톤 플래시] → `createQuery`는 클라 전용이라 `currentSession` resolve 전 스켈레톤이 잠깐 보였다가 `/`로 이동. PROD-142 Welcome 플래시와 동일 트레이드오프(캐시 안전·정확한 세션 판정 우선)로 수용. 후속 splash를 `(protected)` 레이아웃에 스코프해 개선한다.
- [`(protected)` 레이아웃의 별도 `currentSession` 쿼리] → 부모 `(tabs)` 쿼리와 필드가 겹치지만 `cache-and-network` 정규화 캐시로 즉시 채워져 중복 네트워크 비용은 사실상 없다. 가드 책임을 보호 레이아웃 안에 자족적으로 두는 이점이 더 크다.
- [쿼리 실패·네트워크 오류] → fail-open으로 리다이렉트하지 않는다. 안전한 기본값(유효 사용자를 잘못 내쫓지 않음).
- [PROD-149 비로그인 시나리오 변경] → "Home no-profile onboarding"의 비로그인 시나리오(기존 홈 유지)는 가드 리다이렉트로 대체된다. 본 변경에서 해당 요구사항을 MODIFY해 baseline 일관성을 맞춘다.

## Open Questions

(없음)
