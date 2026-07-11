## 1. 표시 순서 정정

- [ ] 1.1 `ProfileHero.svelte`의 팔로우 수를 `팔로잉 → 팔로워` 순서로 바꾼다
- [ ] 1.2 `SidebarNavigation.svelte`의 활성 프로필 팔로우 수를 `팔로잉 → 팔로워` 순서로 바꾼다
- [ ] 1.3 두 컴포넌트 모두 카운트 값과 라벨이 어긋나지 않게(팔로잉=followingCount, 팔로워=followersCount) 확인한다

## 2. 검증

- [ ] 2.1 `pnpm -F @kosmo/web check`와 prettier를 통과시킨다
- [ ] 2.2 프로필 페이지에서 순서가 `팔로잉 → 팔로워`인지 헤더·사이드바 모두 확인한다(시각 확인은 사용자)
