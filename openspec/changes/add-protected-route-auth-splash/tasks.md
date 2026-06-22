## 1. 스플래시 컴포넌트

- [x] 1.1 `apps/web/src/lib/components/Splash.svelte`를 추가한다: `fixed inset-0 z-50` 풀스크린 오버레이, 중립 배경(`bg-bg`) + 중앙 임시 K 로고(아이콘 단독), 디자인 토큰만 사용
- [x] 1.2 시각 요소는 `aria-hidden`, 스크린리더용 `role="status"` 로딩 안내를 둔다

## 2. 보호 가드 게이팅

- [x] 2.1 `(tabs)/(protected)/+layout.svelte`에서 `{@render children()}`를 `query.data?.currentSession || query.error`일 때만 렌더하고, 그 외에는 `Splash`를 표시하도록 게이팅한다
- [x] 2.2 기존 `$effect` 리다이렉트(로딩·에러 보류, `null`이면 `/`로 이동) 동작은 유지한다

## 3. 검증

- [x] 3.1 `pnpm -F @kosmo/web check`와 lint·prettier를 통과시킨다
- [x] 3.2 게스트 콜드 진입 시 셸·홈 스켈레톤 대신 스플래시가 표시되고 `/`로 리다이렉트되며, 캐시된 유효 세션 탭 이동 시에는 스플래시가 뜨지 않는지 확인한다(시각 확인은 사용자)
