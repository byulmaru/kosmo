## Context

`connect-profile-follow-list-pagination`의 proposal, web-app-shell delta spec, design에 기록된 팔로워/팔로잉 목록 pagination 결정을 ADR 형식으로 정리한다.

## Decision Records

### Route가 pagination query state를 소유한다

- Status: Accepted
- Context / Problem: 팔로워/팔로잉 목록은 route별 handle과 connection query가 다르지만 pagination UI는 공유해야 한다.
- Decision Outcome: Route query가 `after` 변수를 소유하고, `ProfileConnectionList`는 누적 connection, pagination 상태, load-more callback을 props로 받는다.
- Alternatives Considered: 목록 컴포넌트가 직접 query를 실행할 수 있지만 route별 변수와 session query가 컴포넌트 내부로 섞인다.
- Consequences: route에 pagination state 코드가 생기며, 컴포넌트는 표시와 상태 UI에 집중한다.
- Confirmation / Follow-up: 두 route가 같은 list component 상태를 사용하면서 query colocation을 유지하는지 확인한다.

### 다음 페이지 결과는 route state에 명시적으로 누적한다

- Status: Accepted
- Context / Problem: Mearie normalized cache가 connection append 정책을 자동 제공한다는 repo 내 선례가 없다.
- Decision Outcome: 다음 페이지 결과는 route state에 누적하고, 목록 컴포넌트에는 현재 누적된 connection shape를 넘긴다.
- Alternatives Considered: cache merge 정책에 의존할 수 있지만 동작 검증 부담이 크고 실패/재시도 제어가 불명확하다.
- Consequences: handle 또는 첫 페이지 profile id가 바뀌면 누적 상태를 초기화해야 한다.
- Confirmation / Follow-up: 실패 후 기존 항목 유지, handle 변경 초기화, 중복 클릭 방지를 확인한다.

### Pagination UI는 수동 더 불러오기 버튼으로 시작한다

- Status: Accepted
- Context / Problem: 다음 페이지 로딩, 실패, 재시도를 명확하고 작은 범위로 제공해야 한다.
- Decision Outcome: `pageInfo.hasNextPage`와 `endCursor` 기준의 수동 "더 불러오기" 버튼을 사용한다.
- Alternatives Considered: viewport 기반 무한 스크롤은 관찰자 cleanup, 중복 요청, 오류 복구 UX가 추가된다.
- Consequences: 사용자가 직접 다음 페이지 로드를 요청해야 하지만 접근성과 테스트 범위가 단순해진다.
- Confirmation / Follow-up: 로딩, 마지막 페이지, 다음 페이지 오류 재시도 상태를 Storybook/E2E로 확인한다.

## Remaining Decisions

- Follow/unfollow 후 관계 목록 membership 재정렬/삭제 동기화는 별도 후속 change에서 다룬다.
- 무한 스크롤 또는 viewport 관찰 기반 자동 로드는 이번 범위 밖으로 남긴다.

## Superseded Decisions

- 없음.
