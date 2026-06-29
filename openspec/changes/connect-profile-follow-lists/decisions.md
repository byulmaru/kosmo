## Context

`connect-profile-follow-lists`의 proposal, web-app-shell delta spec, design에 기록된 팔로워/팔로잉 첫 페이지 연결 결정을 ADR 형식으로 정리한다.

## Decision Records

### ProfileConnectionList는 profile fragment prop으로 connection을 읽는다

- Status: Accepted
- Context / Problem: Route query colocation은 유지하면서 목록 컴포넌트가 로딩/오류/빈 상태와 항목 렌더링을 공유해야 한다.
- Decision Outcome: `ProfileConnectionList`가 `followersProfile` 또는 `followingProfile` fragment prop을 받아 필요한 connection과 항목 fragment를 읽는다.
- Alternatives Considered: route에서 edge 배열을 풀어 scalar props로 넘길 수 있지만 `ProfileListItem_profile` fragment 계약이 route에 중복된다.
- Consequences: 컴포넌트 API는 followers/following 두 입력을 구분해야 하며, route는 query document를 계속 소유한다.
- Confirmation / Follow-up: follower/following route가 각 connection을 전달하고 `ProfileListItem` fragment 계약을 중복하지 않는지 확인한다.

### Followers와 following route는 별도 query document를 둔다

- Status: Accepted
- Context / Problem: 두 route는 비슷하지만 follower와 followee 필드가 다르고 stacked PR 분리가 필요하다.
- Decision Outcome: `ProfileFollowersPageQuery`와 `ProfileFollowingPageQuery`를 각각 둔다.
- Alternatives Considered: 공용 helper나 query document로 묶을 수 있지만 route별 colocation과 분리 구현 이점이 흐려진다.
- Consequences: query 중복이 일부 생기지만 route별 변경 범위가 명확하다.
- Confirmation / Follow-up: 두 route가 필요한 connection만 조회하는지 확인한다.

### 첫 페이지는 first: 20으로 고정하고 connection edge 순서를 유지한다

- Status: Accepted
- Context / Problem: 이번 변경은 첫 페이지 렌더링 계약만 다루고 pagination은 후속 change에서 분리한다.
- Decision Outcome: 각 목록은 `first: 20` 첫 페이지를 조회하고 connection edge 반환 순서를 그대로 렌더한다.
- Alternatives Considered: 클라이언트 정렬이나 pagination 선구현을 포함할 수 있지만 API cursor 순서와 후속 pagination 계약이 어긋날 수 있다.
- Consequences: 20개 초과 관계는 후속 pagination change 전까지 탐색할 수 없다.
- Confirmation / Follow-up: delta spec의 첫 페이지 렌더링 계약과 클라이언트 정렬 부재를 확인한다.

## Remaining Decisions

- Pagination 또는 추가 페이지 로딩은 `connect-profile-follow-list-pagination`에서 다룬다.
- Active profile 전환 시 목록 viewer 상태 재동기화는 별도 후속 change에서 다룬다.

## Superseded Decisions

- 없음.
