## 1. 진입점 링크 연결

- [ ] 1.1 `ProfileHero.svelte`의 팔로잉/팔로워 수를 각각 숫자+라벨 전체를 감싸는 `<a>`로 만들어 `/@{handle}/following`·`/@{handle}/followers`로 연결한다
- [ ] 1.2 `SidebarNavigation.svelte`의 활성 프로필 팔로잉/팔로워 수를 각각 숫자+라벨 전체를 감싸는 `<a>`로 만들어 선택 프로필의 `/@{handle}/following`·`/@{handle}/followers`로 연결한다
- [ ] 1.3 hover 시 밑줄이 숫자와 라벨 사이 공백까지 연속되도록 border-bottom으로 처리한다
- [ ] 1.4 사이드바 카운트 링크에 `onclick={onNavigate}`를 달아, 모바일 drawer에서 이동 시 drawer가 닫히도록 한다(기존 메뉴 링크와 동일)

## 2. 검증

- [ ] 2.1 `pnpm -F @kosmo/web check`와 prettier를 통과시킨다
- [ ] 2.2 헤더·사이드바에서 숫자·라벨 어디를 눌러도 각 목록 라우트로 이동하는지 확인한다(시각 확인은 사용자)
