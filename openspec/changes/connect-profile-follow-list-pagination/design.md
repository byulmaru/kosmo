## Context

팔로워/팔로잉 목록 라우트와 `ProfileConnectionList`는 이미 `Profile.followers(first: 20)`와 `Profile.following(first: 20)` 첫 페이지를 표시한다. 선행 OpenSpec change인 `connect-profile-follow-lists`는 첫 페이지 연결 계약만 다루고 첫 페이지 이후 pagination을 후속 change로 남기므로, 이 변경은 그 위에 쌓이는 후속 범위다.

API는 이미 Relay-style connection 인자(`first`, `after`, `before`, `last`)와 `PageInfo`를 제공한다. 따라서 서버 schema/resolver 변경 없이 `@refetchable`/`@connection` fragment와 `usePaginationFragment`로 universal 목록을 확장한다.

## Goals / Non-Goals

**Goals:**

- 팔로워/팔로잉 두 목록에서 `pageInfo.hasNextPage`와 `pageInfo.endCursor`를 기준으로 다음 페이지를 불러온다.
- 두 목록이 같은 pagination UI, 로딩, 실패, 재시도, 마지막 페이지 처리를 공유한다.
- 다음 페이지 요청이 실패해도 이미 표시된 목록은 유지한다.
- 추가 페이지 항목도 기존 `ProfileListItem`/`FollowButton` 정책과 connection edge 순서를 유지한다.

**Non-Goals:**

- API GraphQL connection, resolver, schema 변경.
- follow/unfollow mutation 동작 변경.
- active profile 전환 시 기존 목록 항목 viewer 상태 재동기화(PROD-189).
- `FollowButton`의 viewer/session 책임 경계 재설계(PROD-170).
- 무한 스크롤 또는 viewport 관찰 기반 자동 로드.

## Decisions

- `ProfileConnectionList`의 profile fragment가 pagination variable과 load-more 상태를 소유한다.
  - 이유: `@refetchable`, `@connection`, `usePaginationFragment`가 route별 handle query와 무관하게 connection 누적/재시도를 같은 fragment 경계에서 처리한다.
  - 대안: route가 `after`와 edge 배열을 직접 소유하면 Relay Store와 별도 누적 state가 생긴다.

- 다음 페이지 결과는 Relay connection Store에 누적하고 route-local edge array를 만들지 않는다.
  - 이유: connection key와 `loadNext`가 edge identity, cursor와 concurrent loading을 일관되게 관리한다.
  - 대안: 수동 concat/dedup은 profile/actor 전환과 query refresh 때 두 cache source를 동기화해야 하므로 제외한다.

- pagination UI는 수동 “더 불러오기” 버튼으로 시작한다.
  - 이유: 접근성이 명확하고, 실패 후 같은 버튼으로 재시도 상태를 표현하기 쉽다. 무한 스크롤보다 테스트와 수동 검증 범위가 작다.
  - 대안: viewport 진입 시 자동 로드는 사용자가 목록 끝에 도달하기 전에 데이터를 가져올 수 있지만, 관찰자 cleanup, 중복 요청, 오류 복구 UX가 추가된다.

- 첫 페이지 전체 오류와 다음 페이지 오류를 분리한다.
  - 이유: 첫 페이지 오류는 기존 인라인 오류 상태를 그대로 사용하고, 다음 페이지 오류는 기존 목록 아래에서 재시도해야 이미 본 항목이 사라지지 않는다.

## Risks / Trade-offs

- profile handle 또는 active actor가 바뀌면 이전 connection이 보일 수 있음 → fragment owner가 바뀌면 새 connection identity를 사용하고, active profile 변경은 Relay Environment 자체를 재생성한다.
- follow/unfollow로 관계 수나 목록 membership이 바뀌어도 pagination 누적 목록이 즉시 재정렬/삭제되지 않을 수 있음 → 이번 범위는 기존 `ProfileListItem`/`FollowButton` 정책 유지로 제한하고, 관계 목록 membership 동기화는 별도 후속으로 남긴다.
- followers/following fragment의 pagination code가 유사해질 수 있음 → connection field와 edge projection은 별도 fragment로 유지하되 load-more UI/state는 공용 `ProfileConnectionList` 안에서 공유한다.
