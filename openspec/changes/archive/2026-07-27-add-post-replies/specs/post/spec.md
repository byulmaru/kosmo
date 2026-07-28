## ADDED Requirements

### Requirement: Post의 직접 Reply Parent 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-398` API는 기존 단일 GraphQL `Post` Node에 nullable `replyParent` field를 제공해야 하며(MUST), 현재 Post와 Parent의 Visibility와 Eligibility를 독립적으로 판정해야 한다(MUST).

#### Scenario: 직접 Parent 조회

- **WHEN** 조회 가능한 Post가 조회 가능한 직접 Reply Parent를 가진다
- **THEN** `Post.replyParent`는 저장된 직접 Parent를 기존 `Post` Node로 반환한다
- **AND** 다른 Post로 평탄화하지 않는다

#### Scenario: Reply Parent가 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않는다
- **THEN** `Post.replyParent`는 `null`을 반환한다

#### Scenario: 조회 불가능한 Parent

- **WHEN** 현재 Post는 조회 가능하지만 Parent가 Tombstone이거나 viewer 기준 Visibility 또는 Eligibility를 통과하지 못한다
- **THEN** 현재 Post 조회는 유지한다
- **AND** `Post.replyParent`만 `null`을 반환한다

### Requirement: Post의 Reply 조상 경로 GraphQL 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-399` API는 기존 단일 GraphQL `Post` Node에 pagination 없는 non-null `replyAncestors: [Post!]!` field를 제공해야 하며(MUST), 저장된 직접 Reply Parent부터 root 방향으로 조회 가능한 조상을 반환해야 한다(MUST).

#### Scenario: 직접 Parent 우선 조상 list

- **WHEN** 조회 가능한 Post가 여러 단계의 조회 가능한 Reply Parent를 가진다
- **THEN** `Post.replyAncestors`는 직접 Parent를 첫 요소로 반환한다
- **AND** 이후 요소는 저장된 Reply Parent 관계를 따라 root 방향으로 이어진다

#### Scenario: 조상이 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않거나 직접 Parent부터 조회할 수 없다
- **THEN** `Post.replyAncestors`는 빈 배열을 반환한다

#### Scenario: 조상 경로 pagination 제외

- **WHEN** 클라이언트가 Reply 조상 경로를 조회한다
- **THEN** API는 Relay connection이나 pagination 인자 없이 전체 조회 가능 경로를 non-null list로 반환한다

### Requirement: Post의 하위 Reply GraphQL 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-400` API는 기존 단일 GraphQL `Post` Node에 non-null `replyDescendants: PostConnection!` field를 제공해야 한다(MUST). 이 connection은 `first`/`after`와 `last`/`before`를 지원하고(MUST), 조회 가능한 descendant를 `createdAt ASC, id ASC`로 정렬해야 한다(MUST).

#### Scenario: 직접·간접 하위 Reply 조회

- **WHEN** 현재 Post 아래에 조회 가능한 직접 Reply와 간접 Reply가 존재한다
- **THEN** `Post.replyDescendants`는 두 종류의 descendant를 모두 기존 `Post` Node로 반환한다

#### Scenario: 양방향 Relay pagination과 시간순 정렬

- **WHEN** 클라이언트가 여러 생성 시각과 같은 생성 시각을 가진 descendant를 앞이나 뒤 방향으로 조회한다
- **THEN** API는 `createdAt ASC, id ASC`의 동일한 전체 순서에서 `first`/`after`와 `last`/`before` page를 제공한다
- **AND** 같은 생성 시각에는 `id`를 deterministic tie-breaker로 사용한다
- **AND** 이 시간순 정렬만으로 Parent-before-child 위상 순서를 별도로 보장하지 않는다

#### Scenario: 조회 정책을 pagination 전에 적용

- **WHEN** descendant 구조에 조회 불가능한 Post와 조회 가능한 Post가 page 경계 앞뒤로 함께 존재한다
- **THEN** API는 각 descendant의 Visibility와 Eligibility를 page limit 전에 적용한다
- **AND** 조회 불가능한 후보 때문에 조회 가능한 page가 비거나 누락되지 않는다

## MODIFIED Requirements

### Requirement: 프로필 게시글 목록 connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-388`, `PROD-429` API는 프로필이 작성한 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 최신순 Relay connection `Profile.posts`로 노출해야 하며(MUST), viewer와 작성자의 관계에 따라 공개 범위를 제한해야 한다(MUST). `Profile.posts`는 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST). Reply 여부와 Visibility·Eligibility는 page limit 전에 적용해야 한다(MUST).

#### Scenario: 공개 프로필 게시글 목록 조회

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC` 또는 `UNLISTED` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 작성자 본인의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필이고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 모든 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: follower의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필을 팔로우하고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** `DIRECT` 공개 범위의 Post는 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: Profile에서 Reply 제외

- **WHEN** Target Profile이 Reply Parent가 있는 Post를 작성했다
- **THEN** 시스템은 Reply이면서 Quote인 경우를 포함해 그 Post를 page limit 적용 전에 `Profile.posts` 후보에서 제외한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 조회 가능한 후보가 없는 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 프로필 목록에서 숨겨지는 게시글

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 `FOLLOWERS`, `DIRECT` 공개 범위의 Post를 반환하지 않는다

### Requirement: Home timeline connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-388`, `PROD-429` API는 현재 active profile 기준 eligible `ACTIVE` Post 후보를 최신순 Relay connection `Query.homeTimeline`로 노출해야 한다(MUST). `Query.homeTimeline`은 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST). 각 후보의 Visibility·Eligibility와 Reply 후보 정책은 page limit 전에 적용해야 한다(MUST). active profile이 없거나 인증되지 않은 조회에는 요청을 거부하지 않고 `null`을 반환해야 한다(MUST).

#### Scenario: 내 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 현재 active profile이 작성한 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 첫 페이지 조회에 사용할 수 있어야 한다

#### Scenario: followee 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 다른 활성 프로필을 팔로우한다
- **THEN** 시스템은 해당 followee가 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 반환한다
- **AND** `DIRECT` 공개 범위의 Post는 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다

#### Scenario: Home에서 viewer 관련 Reply 포함

- **WHEN** Reply가 viewer Profile의 Post에 달렸거나 viewer가 작성했거나, viewer가 팔로우한 Profile의 Post에 viewer가 팔로우한 Profile이 작성했다
- **THEN** 시스템은 Reply 자체가 Visibility와 Eligibility를 통과하면 Home 후보에 포함한다
- **AND** Reply이면서 Quote인 Post에도 같은 규칙을 적용한다

#### Scenario: Home에서 관련 없는 Reply 제외

- **WHEN** Reply가 Home의 viewer 관련 Reply 조건을 충족하지 않는다
- **THEN** 시스템은 그 Reply를 page limit 적용 전에 Home 후보에서 제외한다

#### Scenario: 비팔로우 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 작성자를 팔로우하지 않으며 그 Post가 viewer 관련 Reply 조건도 충족하지 않는다
- **THEN** 시스템은 해당 작성자의 Post를 반환하지 않는다

#### Scenario: 역방향 팔로워 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 다른 프로필이 현재 active profile을 팔로우하지만 현재 active profile은 그 프로필을 팔로우하지 않으며 그 Post가 viewer 관련 Reply 조건도 충족하지 않는다
- **THEN** 시스템은 해당 팔로워의 Post를 반환하지 않는다

#### Scenario: active profile 없는 홈 타임라인 조회

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 요청을 거부하지 않고 `homeTimeline` 필드로 `null`을 반환한다
- **AND** GraphQL 인증 오류를 발생시키지 않는다
