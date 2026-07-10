## Why

PROD-148의 legacy Svelte 구현은 보호 라우트(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)를 `(tabs)/(protected)/` 그룹으로 분리하고 가드를 `(tabs)/(protected)/+layout.svelte`에 두었다. 가드는 `currentSession`이 확정되기 전(로딩·에러) 리다이렉트를 보류하며 자식을 그대로 렌더했다(fail-open). 그 결과 콜드 로드 시 게스트·무효 세션 사용자에게 `(tabs)` 셸(사이드바·우측 레일 스켈레톤)과 홈 스켈레톤이 잠깐 노출된 뒤 루트 `/`로 리다이렉트되는 플래시가 발생했다. 이 change가 확정한 인증 검증 의미는 Expo Router 보호 layout에도 그대로 적용한다. (Linear PROD-161)

## What Changes

- 보호 가드(`apps/app/src/app/(tabs)/(protected)/_layout.tsx`와 session provider)에서, 재사용할 캐시된 세션이 없는 콜드 검증 구간에는 자식·셸·홈 스켈레톤 대신 보호 영역 전체를 덮는 풀스크린 스플래시를 표시한다.
- 이미 캐시된 유효 세션으로 보호 라우트 사이를 이동할 때는 스플래시를 표시하지 않는다(매 진입 빈 화면 노출 방지).
- 세션이 `null`로 확정되어 루트(`/`)로 이동하는 동안에도 스플래시를 유지해 게스트가 보호 셸을 보지 않게 한다.
- `currentSession` 조회가 오류로 실패한 동안에는 스플래시 대신 콘텐츠 렌더를 유지한다(기존 fail-open 보존).
- 스플래시는 임시 K 로고(중립 배경 + 아이콘 단독)를 중앙에 둔 신규 `Splash` 컴포넌트로 구현한다.

## Capabilities

### Modified Capabilities

- `web-app-shell`: `Protected app routes require a valid session` 요구사항에, 캐시 없는 콜드 검증 구간의 풀스크린 스플래시 표시·캐시 세션 시 미표시·게스트 리다이렉트 중 스플래시 유지·오류 시 fail-open 동작을 추가한다.

## Impact

- `apps/app/src/app/(tabs)/(protected)/_layout.tsx`, `apps/app/src/session/SessionProvider.tsx` — 자식 렌더를 세션 확정/오류 조건으로 게이팅하고, 콜드 검증 중 `Splash`를 표시
- `apps/app/src/components/Splash.tsx` — Android/iOS/Web 공용 풀스크린 스플래시와 접근성 status
- 공개 라우트·API·데이터 모델 영향 없음

## Out of Scope

- 스플래시가 사라진 뒤 각 보호 화면이 자기 데이터 쿼리로 표시하는 자체 로딩 스켈레톤(각 화면 소관)
- 루트 `/` Welcome 화면(PROD-142 소관)과 공개 프로필 라우트
- 정식 로고·브랜드 자산 도입(임시 K 로고 유지)
