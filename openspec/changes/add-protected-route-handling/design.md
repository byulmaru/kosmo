## Context

`(tabs)` 그룹은 내부 화면(home·compose·search·notifications·menu)과 공개 프로필 `@[handle]`(및 게시글 상세 `+page@(tabs)`)을 함께 담는다. `(tabs)/+layout.svelte`는 이미 `TabsLayoutQuery`로 `currentSession { id, selectedProfile }`를 클라이언트에서 조회해 사이드바·우측 레일을 그린다. 세션 검증은 API가 한다: `currentSession`은 `withAuth({ login: true })` + `unauthorizedResolver: () => null`이라 만료·폐기 세션이면 `null`을 반환한다. 쿠키→Bearer 전달은 `routes/graphql/+server.ts`가 한다.

선행 PROD-142가 루트 `/`를 "Welcome 항상 렌더 + 유효 세션이면 클라이언트에서 `goto('/home')`"로 만들었다(서버 쿠키 분기 제거). 본 변경(PROD-148)은 그 반대 방향 — 보호 라우트에 비로그인/무효 세션으로 접근하면 `/`로 되돌리는 가드를 같은 검증 기준으로 추가한다.

## Goals / Non-Goals

**Goals:**

- 비로그인·무효 세션 사용자가 보호 라우트(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)에 접근하면 루트 온보딩(`/`)으로 보낸다.
- 정책을 `(tabs)` 레이아웃 한곳에 두어 화면별 중복 비로그인 처리를 없앤다.
- 공개 프로필 `@[handle]`(게시글 상세 포함)은 비로그인 조회를 유지한다.

**Non-Goals:**

- 루트 `/` 온보딩·로그인 동선(PROD-142), 로그인 후 프로필 없음 온보딩(PROD-149).
- 로그인 후 원래 목적지로 복귀하는 deep-link return URL.
- 서버 사이드 가드.

## Decisions

- **가드는 클라이언트 `currentSession` 검증으로 한다(서버 쿠키 존재 체크 아님)**: 쿠키 존재 ≠ 유효 세션. 만료·폐기 쿠키 보유자를 서버 쿠키 가드는 통과시켜 `/home`에서 깨진 상태를 보이고, 쿠키를 의존성으로 추적하지 않는 서버 분기는 클라 내비게이션 캐시와 꼬인다. `currentSession`은 API가 `Sessions.ACTIVE`+`Accounts.ACTIVE`로 검증해 무효 세션을 `null`로 주므로 비로그인과 동일하게 다룬다. PROD-142 루트 분기와 동일 기준 → `/`↔`/home` 판정 일관, 루프 없음.
- **가드를 `(tabs)/+layout.svelte`에 둔다**: 이미 `currentSession`을 조회하는 한곳에 `$effect`를 더해 home·compose·search·notifications·menu 전체를 덮는다(화면별 중복 제거). 새 쿼리 불필요.
- **공개 프로필은 `page.route.id` prefix(`/(tabs)/@[handle]`)로 제외**: 게시글 상세(`+page@(tabs)`)도 `(tabs)` 셸 안에서 렌더되어 가드가 돌지만 같은 prefix로 제외돼 비로그인 조회를 유지한다. apps/web 클라 리다이렉트 선례(`(tabs)/@[handle]/[postId]/+page@(tabs).svelte`)와 동일하게 `$app/state`의 `page` + `$effect` + `goto` 사용.
- **로딩·에러 중에는 리다이렉트 보류(fail-open)**: `query.loading`/`query.error` 동안에는 판단하지 않아 유효 세션·일시 오류 사용자를 잘못 튕기지 않는다.
- **`goto('/', { replaceState: true })`**: 보호 라우트가 히스토리에 남아 뒤로가기로 재진입→재튕김되는 것을 막는다. 루트 `/+page.svelte`의 `goto('/home', { replaceState: true })`와 대칭.
- **중복 폴백 정리**: 가드 도입 후 비로그인은 보호 라우트에 도달하지 못하므로 `compose`의 "로그인이 필요해요" 분기는 unreachable → 제거한다. 프로필 선택 안내(`!selectedProfile`)는 별개 관심사(PROD-149)라 유지한다.

## Risks / Trade-offs

- [비로그인 보호 라우트 진입 시 스켈레톤 플래시] → `createQuery`는 클라 전용이라 `currentSession` resolve 전 스켈레톤이 잠깐 보였다가 `/`로 이동. PROD-142 Welcome 플래시와 동일 트레이드오프(캐시 안전·정확한 세션 판정 우선)로 수용.
- [쿼리 실패·네트워크 오류] → fail-open으로 리다이렉트하지 않는다. 안전한 기본값(유효 사용자를 잘못 내쫓지 않음).
- [PROD-149 비로그인 시나리오 변경] → "Home no-profile onboarding"의 비로그인 시나리오(기존 홈 유지)는 가드 리다이렉트로 대체된다. 본 변경에서 해당 요구사항을 MODIFY해 baseline 일관성을 맞춘다.

## Open Questions

(없음)
