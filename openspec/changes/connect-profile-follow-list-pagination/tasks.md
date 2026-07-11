## 1. Route pagination state

- [x] 1.1 followers route query에 `after` 변수를 추가하고 첫 페이지와 다음 페이지를 구분해 조회할 수 있게 한다
- [x] 1.2 following route query에 `after` 변수를 추가하고 첫 페이지와 다음 페이지를 구분해 조회할 수 있게 한다
- [x] 1.3 handle 또는 첫 페이지 대상 profile이 바뀌면 누적 connection state와 다음 페이지 오류 상태를 초기화한다
- [x] 1.4 다음 페이지 성공 시 새 edge를 기존 목록 뒤에 connection 순서대로 append하고 최신 `pageInfo`를 보존한다

## 2. Shared pagination UI

- [x] 2.1 `ProfileConnectionList` fragment에 `pageInfo { hasNextPage endCursor }`를 포함한다
- [x] 2.2 `ProfileConnectionList`에 다음 페이지 가능 여부, 로딩 여부, 오류 여부, load-more/retry callback props를 추가한다
- [x] 2.3 목록 아래에 공통 “더 불러오기” 버튼을 표시하고, 다음 페이지 로딩 중에는 중복 클릭을 막는다
- [x] 2.4 마지막 페이지에서는 load-more UI를 숨기고, 다음 페이지 실패 시 기존 목록을 유지한 채 재시도 UI를 표시한다

## 3. Storybook states

- [x] 3.1 followers story에 다음 페이지 있음, 다음 페이지 로딩, 다음 페이지 실패, 마지막 페이지 상태를 추가한다
- [x] 3.2 following story에 같은 pagination 상태를 추가해 두 목록의 UI 구조가 일치하는지 확인할 수 있게 한다

## 4. Verification

- [x] 4.1 `pnpm --filter @kosmo/web check`를 통과시킨다
- [ ] 4.2 `pnpm lint:prettier`를 통과시킨다
- [x] 4.3 팔로워/팔로잉 목록에서 첫 페이지 오류와 다음 페이지 오류가 서로 다른 위치에서 처리되는지 수동 또는 Storybook으로 확인한다
