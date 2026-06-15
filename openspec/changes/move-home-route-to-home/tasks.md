## 1. 홈을 /home으로 이동

- [ ] 1.1 `apps/web/src/routes/(tabs)/+page.svelte`를 `apps/web/src/routes/(tabs)/home/+page.svelte`로 이동 (내용 그대로)
- [ ] 1.2 미사용 `apps/web/src/routes/(tabs)/+page.server.ts` 제거

## 2. 루트 임시 리다이렉트

- [ ] 2.1 `apps/web/src/routes/+page.server.ts` 신규 작성: load에서 `/` → `/home` 307 리다이렉트
- [ ] 2.2 (필요 시) SvelteKit이 `+page.svelte` 부재로 실패하면 빈 placeholder `apps/web/src/routes/+page.svelte` 추가

## 3. 내비게이션·로그인 진입점 정리

- [ ] 3.1 `apps/web/src/lib/components/SidebarNavigation.svelte` 홈 항목 `href`를 `/` → `/home`
- [ ] 3.2 `apps/web/src/lib/components/BottomTabBar.svelte` 홈 탭 `href`를 `/` → `/home`
- [ ] 3.3 `apps/web/src/routes/login/callback/+server.ts` 로그인 후 리다이렉트 `/` → `/home`

## 4. 검증

- [ ] 4.1 `pnpm --filter @kosmo/web check` 통과 (라우트 타입 재생성 포함)
- [ ] 4.2 `pnpm --filter @kosmo/web build` 성공
- [ ] 4.3 동작 확인: `/` → `/home` 리다이렉트, `/home` 홈 표시, 내비 홈 active, 로그인 후 `/home` 착지
- [ ] 4.4 `apps/web/src`에 홈을 가리키는 잔여 `/` 참조 없음 grep 확인
