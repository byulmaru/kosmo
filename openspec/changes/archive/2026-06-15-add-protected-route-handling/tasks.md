## 1. OpenSpec

- [x] 1.1 proposal·design·tasks·spec delta 작성, `pnpm exec openspec validate add-protected-route-handling --strict` 통과.

## 2. 보호 가드 ((tabs) 레이아웃)

- [x] 2.1 `apps/web/src/routes/(tabs)/+layout.svelte`에 `$app/navigation`의 `goto`, `$app/state`의 `page` import.
- [x] 2.2 `PUBLIC_ROUTE_PREFIX = '/(tabs)/@[handle]'` 상수 + `$effect` 가드: `query.loading`/`query.error`면 보류, 비공개 라우트(`!isPublic`)에서 `query.data?.currentSession`이 없으면 `goto('/', { replaceState: true })`.

## 3. 중복 비로그인 폴백 정리

- [x] 3.1 `apps/web/src/routes/(tabs)/compose/+page.svelte`의 `{:else if !session}` "로그인이 필요해요" 블록 제거(`!selectedProfile` "프로필이 필요해요"는 유지).
- [x] 3.2 `apps/web/src/routes/(tabs)/home/+page.svelte`의 비로그인 위임 주석을 보호 가드가 처리한다는 내용으로 갱신.

## 4. 검증

- [x] 4.1 `pnpm --filter @kosmo/web check` 통과(mearie generate + 라우트 타입 재생성 포함).
- [x] 4.2 `pnpm --filter @kosmo/web build` 성공.
- [x] 4.3 동작 확인: 비로그인 보호 라우트(`/home`·`/compose`·`/search`·`/notifications`·`/menu`) → `/`; 비로그인 `/@{handle}`·게시글 상세 → 공개 조회 유지; **무효·만료 세션 쿠키 보유 시 보호 라우트 → `/`(잘못 통과시키지 않음)**; 로그인 사용자 정상 진입; `/`↔`/home` 루프 없음.
- [x] 4.4 `pnpm exec openspec validate add-protected-route-handling --strict` 통과.
