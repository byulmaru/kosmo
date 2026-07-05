## Context

이 결정 기록은 `split-profile-follow-requests` proposal, data-model/profile/post/api-platform delta, design.md를 반영한다. 핵심 변경은 `ProfileFollow`를 성립된 팔로잉 관계 전용 모델로 축소하고, 팔로우 요청 상태를 별도 저장 모델로 분리하는 것이다.

## Decision Records

### ProfileFollow는 상태 없는 팔로잉 관계로 유지한다

- Status: Accepted
- Context / Problem: `ProfileFollow.state`가 있으면 follow graph, count, timeline, visibility 코드가 모두 `ACCEPTED` 상태를 반복해서 필터링하고, `PENDING`/`REJECTED` 요청 상태까지 같은 GraphQL 타입으로 노출된다.
- Decision Outcome: `profile_follow` row의 존재 자체를 성립된 팔로우 관계로 해석하고, `ProfileFollow.state`와 `respondedAt` 책임을 제거한다.
- Alternatives Considered: `ProfileFollowState`를 `ACCEPTED` 하나만 남기는 방법은 상태 컬럼이 사실상 boolean marker가 되어 도메인 경계를 흐린다. 기존 상태 enum을 유지하고 loader에서 pending/rejected만 숨기는 방법은 API 표면과 저장 모델이 계속 요청 상태를 공유한다.
- Consequences: GraphQL 클라이언트는 `viewerFollow` 존재 여부로 팔로잉 상태를 판단한다. followers/following count와 followers-only post 접근은 `profile_follow` 존재 조건으로 단순화된다.
- Confirmation / Follow-up: generated GraphQL schema에 `ProfileFollow.state`와 `ProfileFollowState`가 없어야 한다.

### 팔로우 요청은 ProfileFollowRequest 저장 모델로 분리한다

- Status: Accepted
- Context / Problem: 승인 대기는 팔로잉 관계가 아니라 관계를 만들기 전의 요청 lifecycle이다. 요청이 승인되거나 거절되면 대기 상태가 끝나므로 request row가 더 이상 필요하지 않다.
- Decision Outcome: `profile_follow_request` 테이블은 상태 컬럼 없이 요청 방향과 생성 시각만 저장한다. 동일 follower/followee pair의 request row는 하나만 허용하고, row 존재 자체를 대기 중인 요청으로 해석한다. 승인 시 `profile_follow`를 만들고 request row를 삭제하며, 거절 시에도 request row를 삭제한다.
- Alternatives Considered: 요청 상태를 `profile_follow`에 계속 두는 방법은 이번 변경의 목적과 충돌한다. `ProfileFollowRequestState` enum을 별도로 두는 방법은 pending-only request row에 불필요한 상태 모델을 만든다. 요청 테이블을 후속 변경까지 미루는 방법은 지금 `ProfileFollowState` 제거 후 후속 구현에서 다시 저장 경계를 설계해야 한다.
- Consequences: 이번 변경에서 테이블은 추가되지만 공개 GraphQL request API는 열지 않는다. 후속 요청 플로우는 pair당 단일 pending request row와 승인/거절 시 삭제 정책을 기준으로 mutation/query를 설계한다.
- Confirmation / Follow-up: `ProfileFollowRequest` GraphQL Node, 요청 목록, 승인/거절 mutation은 후속 OpenSpec change에서 정의한다.

### 승인 필요 프로필 follow는 요청 플로우 전까지 거부한다

- Status: Accepted
- Context / Problem: `APPROVAL_REQUIRED` 대상에 즉시 `ProfileFollow`를 만들면 승인 정책을 우회한다. 하지만 요청 생성 mutation은 아직 범위 밖이다.
- Decision Outcome: `followProfile`은 `OPEN` 대상만 즉시 follow를 만들고, `APPROVAL_REQUIRED` 대상은 conflict 오류로 거부한다.
- Alternatives Considered: 임시로 `ProfileFollowRequest` row를 만드는 방법은 요청 생성 로직을 부분 구현하게 되어 API payload와 UI 상태가 불명확하다. 기존처럼 즉시 follow를 만드는 방법은 제품 정책을 깨뜨린다.
- Consequences: request UI가 생기기 전에는 승인 필요 프로필을 follow할 수 없다. FollowButton의 pending 상태도 이번 변경에서는 제거된다.
- Confirmation / Follow-up: 후속 요청 mutation이 추가되면 FollowButton 문구와 cache update shape를 다시 정렬한다.

## Remaining Decisions

- ActivityPub follow request와 local approval request를 같은 테이블로 통합할지, federation 전용 lifecycle 테이블을 둘지 결정해야 한다.

## Superseded Decisions

- `ProfileFollow`가 `ACCEPTED`, `PENDING`, `REJECTED` 상태를 모두 포함할 수 있다는 기존 GraphQL 계약은 `ProfileFollow`는 성립된 팔로잉 관계만 표현한다는 계약으로 대체된다.
