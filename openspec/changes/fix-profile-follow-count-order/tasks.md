## 1. 표시 순서 정정

> 중복 change note: legacy 구현과 검증은 `openspec/changes/archive/2026-06-24-fix-profile-follow-count-order`에서 5/5 완료됐다. 아래 미체크 항목은 다시 구현하지 않고, migration change 4.3/5.5가 Expo `SidebarNavigation`/`ProfileHero`에 동작을 보존하며 6.x 검증에 흡수한다.

- [ ] 1.1 Expo `ProfileHero.tsx`가 팔로우 수를 `팔로잉 → 팔로워` 순서로 보존하는지 확인한다
- [ ] 1.2 Expo `SidebarNavigation.tsx`가 활성 프로필 팔로우 수를 `팔로잉 → 팔로워` 순서로 보존하는지 확인한다
- [ ] 1.3 두 컴포넌트 모두 카운트 값과 라벨이 어긋나지 않게(팔로잉=followingCount, 팔로워=followersCount) 확인한다

## 2. 검증

- [ ] 2.1 `pnpm --filter @kosmo/app check`와 prettier를 통과시킨다
- [ ] 2.2 Expo Web 프로필 페이지에서 순서가 `팔로잉 → 팔로워`인지 헤더·사이드바 모두 확인한다(시각 확인은 사용자)
