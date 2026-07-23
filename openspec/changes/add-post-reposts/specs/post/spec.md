## MODIFIED Requirements

### Requirement: Post GraphQL object

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-402`, `PROD-403` API는 조회 가능한 활성 게시글을 기존 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, nullable 현재 콘텐츠, nullable 직접 Repost Source, viewer-independent Repost count, 현재 selected Profile의 nullable Active Repost identity, 공개 범위, 상태와 생성 시각을 제공해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `repostSource`, `repostCount`, `viewerRepost`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 nullable 현재 콘텐츠를 가리킨다
- **AND** `repostSource`는 저장된 nullable 직접 Source Post를 가리킨다

#### Scenario: 조회 가능한 Source를 가진 Repost와 Quote object 조회

- **WHEN** 클라이언트가 direct Source까지 조회 가능한 Repost 또는 Quote Node를 조회한다
- **THEN** Repost는 `content = null`과 non-null `repostSource`를 제공한다
- **AND** Quote는 non-null `content`와 non-null `repostSource`를 제공한다
- **AND** Reply이면서 Quote인 Post도 같은 `Post` Node에서 Reply Parent와 Repost Source를 독립적으로 제공할 수 있다

#### Scenario: 공개 게시글 object 조회

- **WHEN** 클라이언트가 `PUBLIC` 또는 `UNLISTED` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: 작성자 본인의 비공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자이고 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: follower의 팔로워 공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자를 팔로우하고 `FOLLOWERS` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: 접근 권한 없는 viewer의 비공개 게시글 object 조회

- **WHEN** 인증되지 않았거나, 현재 active profile이 게시글 작성자가 아니고 게시글 작성자를 팔로우하지 않는 클라이언트가 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 게시글 Node를 조회한다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다
- **AND** `DIRECT` viewer 기준 세부 접근 제어는 후속 변경에서 정의한다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

#### Scenario: unavailable Repost Source를 가진 Content 없는 Repost 조회

- **WHEN** Content 없는 Repost의 direct Source가 Tombstone이거나 viewer 기준 Post Visibility 또는 Post Eligibility를 통과하지 못한다
- **THEN** 시스템은 해당 Repost를 GraphQL `Post` object로 노출하지 않는다

#### Scenario: unavailable Repost Source를 가진 Quote 조회

- **WHEN** Content 있는 Quote 또는 Reply이면서 Quote인 Post 자체는 조회 가능하지만 direct Source는 조회할 수 없다
- **THEN** 시스템은 Quote Post와 자체 Content를 GraphQL `Post` object로 반환한다
- **AND** nullable `repostSource`는 `null`을 반환한다
- **AND** direct Source의 Source가 unavailable하다는 이유로 바깥 Quote를 숨기지 않는다

### Requirement: 프로필 게시글 목록 connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-430` API는 Target Profile이 작성한 eligible Active Post 중 Reply Parent가 없는 Content Post와 Content 없는 Repost를 최신순 Relay connection `Profile.posts`로 노출해야 한다(MUST). `Profile.posts`는 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST).

#### Scenario: 공개 프로필 게시글 목록 조회

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 Target Profile이 작성한 `PUBLIC` 또는 `UNLISTED` 범위의 eligible Active Post 중 Reply Parent가 없는 Content Post와 Repost를 반환한다
- **AND** Content 없는 Repost는 Repost Post와 direct Source가 각각 viewer 기준 조회 가능할 때만 포함한다
- **AND** 게시글은 최신순으로 정렬되고 connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 작성자 본인의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필이고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 Target Profile이 작성한 모든 공개 범위의 eligible Active Post 중 Reply Parent가 없는 Content Post와 Repost를 반환한다
- **AND** 게시글은 최신순으로 정렬되고 connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: follower의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필을 팔로우하고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 Target Profile이 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 범위의 eligible Active Post 중 Reply Parent가 없는 Content Post와 Repost를 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬되고 connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: Reply 또는 unavailable Source Repost 제외

- **WHEN** Target Profile이 Reply Parent가 있는 Post를 작성했거나 Content 없는 Repost의 direct Source가 viewer 기준 unavailable하다
- **THEN** 시스템은 그 Post를 Profile Post List에서 page limit 적용 전에 제외한다
- **AND** Reply이면서 Quote인 Post도 Reply Parent가 있으므로 제외한다
- **AND** Reply Parent가 없는 Content 있는 Quote는 Source가 unavailable해도 Quote 자체의 조회 정책을 통과하면 유지한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 후보 정책을 통과하는 게시글이 없는 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 프로필 목록에서 숨겨지는 게시글

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 `FOLLOWERS`, `DIRECT` 공개 범위의 게시글을 반환하지 않는다

### Requirement: Home timeline connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-430` API는 현재 active profile 기준 Home Post List 후보를 최신순 Relay connection `Query.homeTimeline`으로 노출해야 한다(MUST). `Query.homeTimeline`은 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 하며(MUST), active profile이 없거나 인증되지 않은 조회에는 요청을 거부하지 않고 `null`을 반환해야 한다(MUST).

#### Scenario: 내 Content Post와 Repost 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 현재 active profile이 작성한 eligible Active Content Post 중 Reply Parent가 없는 Post와 eligible Repost를 반환한다
- **AND** Content 없는 Repost는 Repost Post와 direct Source가 viewer 기준 조회 가능할 때만 포함한다
- **AND** 게시글은 최신순으로 정렬되고 connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: followee Content Post와 Repost 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 다른 Active/Normal Profile을 팔로우한다
- **THEN** 시스템은 해당 followee가 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 범위의 eligible Content Post 중 Reply Parent가 없는 Post와 eligible Repost를 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다

#### Scenario: Home Reply 후보

- **WHEN** Reply가 viewer Profile의 Post에 달렸거나 viewer Profile이 작성했거나, viewer가 팔로우한 Profile의 Post에 viewer가 팔로우한 Profile이 작성했다
- **THEN** 시스템은 Reply 자체의 Post Visibility와 Post Eligibility를 통과하면 그 Reply를 Home 후보로 포함한다
- **AND** 그 밖의 Reply는 Home 후보에서 제외한다

#### Scenario: 비팔로우 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 작성자를 팔로우하지 않는다
- **THEN** 시스템은 Home Reply 후보 규칙에 해당하지 않는 해당 작성자의 게시글을 반환하지 않는다

#### Scenario: 역방향 팔로워 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 다른 프로필이 현재 active profile을 팔로우하지만 현재 active profile은 그 프로필을 팔로우하지 않는다
- **THEN** 시스템은 Home Reply 후보 규칙에 해당하지 않는 해당 팔로워의 게시글을 반환하지 않는다

#### Scenario: unavailable Source 후보 분리

- **WHEN** Content 없는 Repost 또는 Content 있는 Quote의 direct Source가 viewer 기준 unavailable하다
- **THEN** 시스템은 Content 없는 Repost를 page limit 적용 전에 Home 후보에서 제외한다
- **AND** Content 있는 Quote는 Quote 자체의 조회 정책을 통과하면 Home 후보로 유지한다

#### Scenario: active profile 없는 홈 타임라인 조회

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 요청을 거부하지 않고 `homeTimeline` 필드로 `null`을 반환한다
- **AND** GraphQL 인증 오류를 발생시키지 않는다

## ADDED Requirements

### Requirement: Hashtag Post List의 Repost 제외

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/domain/objects/post.md`, `PROD-389`, `PROD-430` Hashtag Post List는 Public이고 Content가 있으며 Reply Parent가 없는 eligible Post만 후보로 사용해야 한다(MUST).

#### Scenario: Content 없는 Repost 제외

- **WHEN** Content 없이 Repost Source만 가진 Repost가 Target Hashtag와 관계된 Source를 참조한다
- **THEN** 시스템은 Repost 자체를 Hashtag Post List 후보에 포함하지 않는다
- **AND** Source의 Hashtag를 Repost에 복제하거나 상속하지 않는다

#### Scenario: Quote 후보

- **WHEN** Public Quote가 Content와 Target Hashtag를 직접 가지며 Reply Parent가 없고 Quote 자체가 eligible하다
- **THEN** 시스템은 Quote 자체를 Hashtag Post List 후보로 포함할 수 있다
