## Context

홈 타임라인은 선택 프로필의 글과 `ACCEPTED` followee의 글을 함께 보여줘야 한다. 이 change는 Redis fanout 없이 DB 직접 조회로 첫 페이지를 제공하는 `Query.homeTimeline` 추가에 집중한다.

## Goals / Non-Goals

**Goals:**

- 현재 active profile 기준 `Query.homeTimeline` Relay connection을 제공한다.
- 내 글과 `ACCEPTED` followee의 글만 타임라인 후보로 포함한다.
- 공통 게시글 visibility 정책을 적용해 viewer가 조회할 수 있는 게시글만 반환한다.
- 첫 페이지 조회에 필요한 cursor connection shape를 제공한다.

**Non-Goals:**

- Redis fanout, 타임라인 저장 테이블, 운영용 백필을 만들지 않는다.
- `DIRECT` 수신자 정책, 삭제/숨김/블라인드 상태별 에러 계약은 처리하지 않는다.
- 프론트엔드 홈 화면 데이터 연결은 별도 이슈에서 처리한다.

## Decisions

- fan-in on read 방식을 사용한다. 이번 사이클 범위는 Redis fanout 없이 DB 직접 조회이므로, `post`와 `profile_follow`를 조회 시점에 조합한다.
- 타임라인 후보는 `Posts.profileId = activeProfileId` 또는 `ACCEPTED` followee의 글로 제한한다. 역방향 follower와 비팔로우 작성자의 글은 후보에서 제외한다.
- 후보 글에는 `postVisibilityAccessWhere`를 적용한다. 이 helper가 게시글 상태, 작성자 활성 상태, viewer 기준 공개 범위 정책을 일관되게 처리한다.
- `homeTimeline`은 `Post` Node connection을 반환한다. 프론트엔드가 기존 `PostListItem_post` fragment와 같은 `Post` shape를 재사용할 수 있고, normalized cache에도 자연스럽다.
- 정렬과 cursor는 기존 게시글 목록처럼 `Posts.id`를 사용한다. kosmo UUID v8 ID가 시간 정렬 의미를 제공하고, 기존 `Profile.posts`와 같은 pagination 방식을 유지한다.

## Risks / Trade-offs

- [Risk] fan-in 조회는 팔로우 수와 게시글 수가 늘면 비용이 커질 수 있다. → 이번 범위는 첫 페이지 DB 직접 조회로 제한하고, 운영 확장 시 Redis fanout 또는 materialized timeline으로 전환한다.
- [Risk] `DIRECT` 글은 아직 수신자 모델이 없어 followee 타임라인에서 잘못 노출될 수 있다. → 이번 변경에서는 followee의 `DIRECT` 글을 계속 제외하고 PROD-121에서 후속 처리한다.
