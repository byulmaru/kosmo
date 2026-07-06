## Context

현재 `profile_follow`는 `state = ACCEPTED | PENDING | REJECTED`와 `responded_at`을 가져 실제 팔로잉 관계와 요청 상태를 한 테이블에 섞어 표현한다. 구현상 follow request 생성/승인/거절 mutation은 아직 없고, `followProfile`은 즉시 `ACCEPTED` row를 만들며 목록, 카운트, 타임라인, followers-only 게시글 접근은 모두 `ACCEPTED` 필터를 반복한다.

이번 변경은 `ProfileFollow`를 “성립된 팔로잉 관계”로 축소한다. 대기 중인 요청은 새 `profile_follow_request` 테이블의 row 존재로만 표현하고, 공개 GraphQL request API와 승인 플로우는 후속 변경으로 남긴다.

## Goals / Non-Goals

**Goals:**

- `profile_follow`에서 `state`와 `responded_at` 책임을 제거한다.
- `profile_follow_request` Drizzle table, relations, table discriminator를 추가한다.
- `ProfileFollow` GraphQL 타입에서 `state` 필드를 제거하고, viewer follow와 follow connection은 row 존재 여부로 판단한다.
- post visibility와 home timeline의 accepted-state 조건을 follow row 존재 조건으로 단순화한다.
- web fragments와 FollowButton UI를 binary follow 상태에 맞춘다.
- OpenSpec delta와 generated GraphQL schema를 코드와 정렬한다.

**Non-Goals:**

- 팔로우 요청 생성/승인/거절 mutation 추가.
- `ProfileFollowRequest` GraphQL Node, query, connection, notification UI 노출.
- 기존 운영 DB의 pending/rejected 데이터 마이그레이션 정책 확정. 현재 코드에는 해당 row 생성 경로가 없다.
- ActivityPub remote follow request 정책 변경.

## Risks / Trade-offs

- [Risk] `APPROVAL_REQUIRED` 프로필을 `followProfile`로 즉시 팔로우하면 요청 정책을 우회할 수 있다. → 요청 플로우가 구현되기 전까지 `APPROVAL_REQUIRED` 대상은 conflict 오류로 거부하고 `ProfileFollow`를 만들지 않는다.
- [Risk] `ProfileFollow.state` 제거는 GraphQL 클라이언트 fragments와 Storybook mock을 깨뜨린다. → web fragments에서 `state` 선택을 제거하고 버튼 상태를 `viewerFollow` 존재 여부로 계산한다.
- [Risk] 기존 DB에 `PENDING`/`REJECTED` row가 있으면 Drizzle push만으로 의미 보존이 어렵다. → 현재 제품 코드에는 생성 경로가 없음을 전제로 하며, 운영 데이터가 발견되면 별도 데이터 마이그레이션 change에서 `profile_follow_request`로 이관한다.
- [Risk] 요청 테이블을 API 없이 추가하면 당장 사용되지 않는 schema가 생긴다. → follow/request 도메인 경계를 미리 고정해 `profile_follow`의 상태 의존 구현이 더 퍼지는 것을 막는다.

## Migration Plan

1. core enum에서 `ProfileFollowState`를 제거한다.
2. Drizzle schema에서 `ProfileFollows.state/respondedAt`를 제거하고 상태 없는 `ProfileFollowRequests`를 추가한다.
3. Drizzle relations와 table discriminator를 갱신한다.
4. API resolver에서 `ProfileFollowState` import와 state 필터를 제거한다.
5. `followProfile`은 기존 follow가 있으면 멱등 반환하고, `OPEN` 대상만 새 follow를 만든다. `APPROVAL_REQUIRED` 대상은 후속 요청 플로우 전까지 conflict로 거부한다.
6. web GraphQL fragments, FollowButton 상태, Storybook mock을 binary follow 모델로 정리한다.
7. GraphQL schema를 재생성하고 타입체크/포맷 검사를 실행한다.

Rollback은 같은 범위의 Drizzle schema와 GraphQL fragments를 이전 상태로 되돌리는 방식으로 처리한다. 실제 운영 DB에 이미 적용된 뒤에는 `profile_follow_request` 제거와 `profile_follow.state` 복구가 데이터 손실 가능성을 가지므로 별도 rollback migration 검토가 필요하다.

## Open Questions

- `APPROVAL_REQUIRED` 프로필의 FollowButton 문구를 “요청”으로 바꾸는 시점은 request mutation이 생기는 후속 UI change에서 결정한다.
