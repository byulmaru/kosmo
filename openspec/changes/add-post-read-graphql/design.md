## Context

PROD-92(PR #67)가 `Post`/`PostContent` loadable Node 타입, `Post.profile`/`Post.content` 필드, `createPost` mutation을 추가했다. `Post` Node 로더는 `state=ACTIVE`이고 작성자 `profile.state=ACTIVE`인 게시글만 로드한다. 다만 게시글을 다시 조회하는 query나 프로필별 목록은 아직 없다.

이번 PROD-93은 작성된 게시글을 다시 읽는 조회 경로만 추가한다. 단건 상세는 기존 `Post` Node 로더에 위임하고, 목록은 `(profile_id, id desc)` 인덱스를 활용한 cursor 기반 connection으로 제공한다.

## Goals / Non-Goals

**Goals:**

- ID로 단일 활성 게시글을 조회하는 `post(id: ID!): Post` query를 추가한다.
- `Profile.posts` Relay connection으로 프로필 게시글을 최신순(`id desc`)으로 페이지네이션한다.
- 없는/비활성 게시글과 비활성 프로필 게시글을 조회에서 제외한다.

**Non-Goals:**

- viewer 기준 공개 범위 접근 제어(`FOLLOWERS`/`DIRECT` 제한, `UNLISTED` 목록 제외) — `PROD-102`.
- `PostContent` Node 직접 로드 시 부모 게시글 정책 우회 차단 — `PROD-102`.
- 홈 타임라인, 팔로잉 기반 피드, 검색.
- 게시글 수 집계 필드, 답글/thread, 리포스트.
- GraphQL resolver 자동 테스트 — `PROD-102`.

## Decisions

1. 단건 조회 query는 기존 `Post` Node 로더에 위임한다.

   `post(id: ID!)` query는 입력 ID를 그대로 반환하고 `Post` loadable Node ref가 로딩한다. 로더가 이미 `state=ACTIVE` + 작성자 `profile.state=ACTIVE` 조건을 적용하므로, 없는/비활성 게시글은 자연히 `null`이 된다. 글로벌 ID는 UUID 자체이고 타입 코드가 UUID에 내장되어 있어 추가 decode가 필요 없다. `node(id:)`와 동일한 로딩 경로를 재사용하므로 공개 범위 정책을 한 곳(로더)에서 강화할 수 있다(`PROD-102`).

2. 목록은 `Profile.posts` Relay connection으로 제공하고 cursor는 게시글 ID를 사용한다.

   `profile/field/follow.ts`의 `resolveCursorConnection` 패턴을 따른다. UUID v7은 시간 정렬되므로 `id desc` 정렬이 최신순과 일치하고 `(profile_id, id desc)` 인덱스를 그대로 활용한다. 부모 `profile`은 이미 활성 상태로 로드되어 있어 목록 쿼리에서 profile 상태를 다시 검사하지 않는다.

3. 목록 필드는 게시글 도메인 모듈에 둔다.

   `Profile.posts`는 Profile 타입 필드이지만 게시글 관계를 노출하므로, `Account.profiles`를 profile 모듈에 두는 규칙과 동일하게 `post/field/profile.ts`에 둔다.

4. 공개 범위 접근 제어는 이번 변경에서 적용하지 않는다.

   PROD-92가 `Post`/`PostContent` Node 로더에 `TODO(PROD-102)`로 공개 범위 정책을 미뤘다. PROD-93 목록도 동일하게 `state=ACTIVE`만 필터하고 공개 범위와 무관하게 노출한다. `FOLLOWERS`/`DIRECT` viewer 제한과 `UNLISTED` 목록 제외는 `PROD-102`가 로더와 목록에 일관되게 적용한다.

## Risks / Trade-offs

- `PROD-102` 적용 전까지 `Profile.posts` 목록과 `post(id)` 단건 조회는 `FOLLOWERS`/`DIRECT` 게시글도 노출한다. 의도적으로 `PROD-102`까지 미룬 제약이며, 두 이슈는 같은 사이클 stacked PR로 진행한다.
- 게시글 수 집계 필드(`postsCount`)는 이번 범위에서 제외한다. 필요 시 follower count와 동일한 후속 최적화로 추가한다.
