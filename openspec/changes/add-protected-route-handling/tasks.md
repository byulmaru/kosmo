## 1. OpenSpec

- [ ] 1.1 proposal·design·tasks를 `(protected)` 라우트 그룹(A안)으로 갱신, spec delta(동작 요구사항)는 유지, `pnpm exec openspec validate add-protected-route-handling --strict` 통과.

## 2. 라우트 구조 재편 ((protected) 그룹)

- [ ] 2.1 `home`·`compose`·`search`·`notifications`·`menu`를 `apps/web/src/routes/(tabs)/(protected)/` 아래로 이동(URL 경로는 그대로).
- [ ] 2.2 `apps/web/src/routes/(tabs)/(protected)/+layout.svelte` 신설: 자체 `query ProtectedLayoutQuery { currentSession { id } }` + `$effect` 가드(`query.loading`/`query.error`면 보류, `currentSession`이 없으면 `goto('/', { replaceState: true })`), `{@render children()}`.
- [ ] 2.3 `apps/web/src/routes/(tabs)/+layout.svelte`에서 보호 가드 제거: `PUBLIC_ROUTE_PREFIX` 상수, `page.route.id` 매칭 `$effect`, `$app/navigation`의 `goto`·`$app/state`의 `page` import 제거. 앱 셸·`TabsLayoutQuery`는 유지.

## 3. 중복 비로그인 폴백 정리 (유지)

- [ ] 3.1 `(protected)/compose/+page.svelte`의 "로그인이 필요해요" 블록 제거 상태 유지(`!selectedProfile` "프로필이 필요해요"는 유지).
- [ ] 3.2 `(protected)/home/+page.svelte`의 비로그인 위임 주석을 `(protected)` 가드 기준으로 갱신.

## 4. 검증

- [ ] 4.1 `pnpm --filter @kosmo/web check` 통과(mearie generate + 라우트 타입 재생성 포함).
- [ ] 4.2 `pnpm --filter @kosmo/web build` 성공.
- [ ] 4.3 동작 확인: 비로그인 보호 라우트(`/home`·`/compose`·`/search`·`/notifications`·`/menu`) → `/`; 비로그인 `/@{handle}`·게시글 상세 → 공개 조회 유지; **무효·만료 세션 쿠키 보유 시 보호 라우트 → `/`(잘못 통과시키지 않음)**; 로그인 사용자 정상 진입; `/`↔`/home` 루프 없음.
- [ ] 4.4 `pnpm exec openspec validate add-protected-route-handling --strict` 통과.
