## 1. 공유 상태 컴포넌트 (PROD-179)

- [x] 1.1 `ProfileConnectionList.svelte`를 신설해 `kind`(followers/following)별 제목과 로딩·오류·빈 상태를 `PostList` 패턴으로 구성한다(`loading`/`error`/`onRetry` props, 데이터 연결은 후속 주석)
- [x] 1.2 `ProfileConnectionList.stories.svelte`에 followers·following × 로딩/오류/빈 상태를 노출한다

## 2. 팔로워 목록 라우트 (PROD-179)

- [x] 2.1 `(tabs)/@[handle]/followers/+page.svelte`를 신설해 `ProfileConnectionList kind="followers"`를 렌더한다(쿼리 없음 → 빈 상태)
- [x] 2.2 `ProfileHero` 유지(`(tabs)` 셸 리셋 없음)와 라우트 직접 접근 시 깨지지 않음을 확인한다

## 3. 팔로잉 목록 라우트 (PROD-180)

- [x] 3.1 `(tabs)/@[handle]/following/+page.svelte`를 신설해 `ProfileConnectionList kind="following"`를 재사용 렌더한다
- [x] 3.2 팔로워 목록과 시각/상태 구조가 일치하는지 확인한다

## 4. 검증 (PROD-180에서 마무리)

- [x] 4.1 `pnpm -F @kosmo/web check`와 prettier를 통과시킨다
- [x] 4.2 `/@{handle}/followers`·`/@{handle}/following` 직접 접근 시 `ProfileHero` + 제목 + 빈 상태가 표시되는지 확인한다(시각 확인은 사용자)
