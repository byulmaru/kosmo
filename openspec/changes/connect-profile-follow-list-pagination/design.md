## Context

팔로워/팔로잉 목록 라우트와 `ProfileConnectionList`는 이미 `Profile.followers(first: 20)`와 `Profile.following(first: 20)` 첫 페이지를 표시한다. 선행 OpenSpec change인 `connect-profile-follow-lists`는 첫 페이지 연결까지만 다루고 pagination을 명시적으로 제외했으므로, 이 변경은 그 위에 쌓이는 후속 범위다.

API는 이미 Relay-style connection 인자(`first`, `after`, `before`, `last`)와 `PageInfo`를 제공한다. 따라서 서버 schema/resolver 변경 없이 웹 route query 변수와 목록 컴포넌트 상태를 확장하면 된다.

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

- route query가 `after` 변수를 소유하고, `ProfileConnectionList`는 pagination 상태와 load-more callback을 props로 받는다.
  - 이유: GraphQL query document와 변수는 route에 colocate하는 기존 패턴을 유지하고, 목록 컴포넌트는 표시와 상태 UI를 공유하는 책임에 집중한다.
  - 대안: `ProfileConnectionList`가 직접 query를 실행할 수 있지만, route별 handle 변수와 current session query가 컴포넌트 내부로 섞인다.

- 다음 페이지 결과는 route state에 누적하고, 목록 컴포넌트에는 현재 누적된 connection shape를 넘긴다.
  - 이유: Mearie normalized cache가 connection append 정책을 자동으로 제공한다는 repo 내 선례가 없다. 명시적으로 누적하면 실패/재시도와 중복 클릭 상태를 route에서 제어할 수 있다.
  - 대안: cache merge 정책에 의존할 수 있다면 코드가 짧아질 수 있지만, 현재 repo에는 fetch-more 패턴이 없고 동작 검증 부담이 커진다.

- pagination UI는 수동 “더 불러오기” 버튼으로 시작한다.
  - 이유: 접근성이 명확하고, 실패 후 같은 버튼으로 재시도 상태를 표현하기 쉽다. 무한 스크롤보다 테스트와 수동 검증 범위가 작다.
  - 대안: viewport 진입 시 자동 로드는 사용자가 목록 끝에 도달하기 전에 데이터를 가져올 수 있지만, 관찰자 cleanup, 중복 요청, 오류 복구 UX가 추가된다.

- 첫 페이지 전체 오류와 다음 페이지 오류를 분리한다.
  - 이유: 첫 페이지 오류는 기존 인라인 오류 상태를 그대로 사용하고, 다음 페이지 오류는 기존 목록 아래에서 재시도해야 이미 본 항목이 사라지지 않는다.

## Risks / Trade-offs

- Mearie query 재실행 시 첫 페이지 데이터가 갱신되면 route의 누적 목록과 최신 첫 페이지가 어긋날 수 있음 → handle 또는 첫 페이지 profile id가 바뀌면 누적 상태를 초기화하고, 추가 페이지는 현재 `endCursor` 기준으로만 붙인다.
- follow/unfollow로 관계 수나 목록 membership이 바뀌어도 pagination 누적 목록이 즉시 재정렬/삭제되지 않을 수 있음 → 이번 범위는 기존 `ProfileListItem`/`FollowButton` 정책 유지로 제한하고, 관계 목록 membership 동기화는 별도 후속으로 남긴다.
- 두 route의 pagination state 코드가 유사해 중복이 생길 수 있음 → 이번 PR은 두 route가 각각 필요한 connection만 조회하는 기존 구조를 유지한다. 구현 중 중복이 과도하면 route-local helper를 검토하되, GraphQL document colocation을 깨지 않는다.
