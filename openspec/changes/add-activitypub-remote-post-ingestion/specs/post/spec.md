## MODIFIED Requirements

### Requirement: Post GraphQL object

API는 활성 local 게시글과 remote ActivityPub Note에서 materialized된 활성 게시글을 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, 현재 콘텐츠, 공개 범위, 상태, 생성 시각을 제공해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** 작성자 프로필은 local profile 또는 ActivityPub remote profile일 수 있다
- **AND** `content`는 게시글의 현재 콘텐츠를 가리킨다

#### Scenario: 공개 게시글 object 조회

- **WHEN** 클라이언트가 `PUBLIC` 또는 `UNLISTED` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 작성자 본인의 비공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자이고 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: established follower의 팔로워 공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자를 established `ProfileFollow`로 팔로우하고 `FOLLOWERS` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 접근 권한 없는 viewer의 비공개 게시글 object 조회

- **WHEN** 인증되지 않았거나, 현재 active profile이 게시글 작성자가 아니고 게시글 작성자를 established `ProfileFollow`로 팔로우하지 않는 클라이언트가 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 게시글 Node를 조회한다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다
- **AND** `DIRECT` viewer 기준 세부 접근 제어는 후속 변경에서 정의한다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

#### Scenario: SUSPENDED instance 리모트 게시글 object 조회

- **WHEN** remote ActivityPub Note에서 materialized된 게시글의 작성자 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

### Requirement: 프로필 게시글 목록 connection

API는 local profile 또는 ActivityPub remote profile이 작성한 활성 게시글을 최신순 Relay connection `Profile.posts`로 노출해야 하며, viewer와 작성자의 관계에 따라 공개 범위를 제한해야 한다(MUST). `Profile.posts`는 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST).

#### Scenario: 공개 로컬 프로필 게시글 목록 조회

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 local profile을 established `ProfileFollow`로 팔로우하지 않는 클라이언트가 local profile의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC` 또는 `UNLISTED` 공개 범위의 `ACTIVE` 게시글만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 작성자 본인의 로컬 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 local profile이고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 모든 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: established follower의 로컬 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 local profile을 established `ProfileFollow`로 팔로우하고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 리모트 프로필 게시글 목록 조회

- **WHEN** 클라이언트가 활성 ActivityPub remote profile의 `posts` connection을 조회한다
- **THEN** 시스템은 inbox delivery에서 materialized된 `ACTIVE` 게시글을 반환한다
- **AND** 시스템은 `Profile.posts` 조회 중 remote actor outbox refresh를 시도하지 않는다
- **AND** 반환되는 게시글은 viewer가 볼 수 있는 공개 범위로 제한된다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 리모트 프로필 materialized 게시글 없음

- **WHEN** 활성 ActivityPub remote profile의 `posts` connection 조회 중 저장된 materialized posts가 없다
- **THEN** 시스템은 remote actor outbox refresh를 시도하지 않는다
- **AND** 시스템은 빈 connection을 반환한다

#### Scenario: 리모트 instance가 unresponsive인 게시글 목록 조회

- **WHEN** `UNRESPONSIVE` instance에 속한 활성 ActivityPub remote profile의 `posts` connection을 조회한다
- **THEN** 시스템은 remote actor outbox refresh를 시도하지 않는다
- **AND** 시스템은 이미 materialized된 노출 가능한 remote posts를 반환할 수 있다
- **AND** 저장된 materialized posts가 없으면 빈 connection을 반환한다

#### Scenario: 리모트 instance가 suspended인 게시글 목록 조회

- **WHEN** `SUSPENDED` instance에 속한 ActivityPub remote profile의 `posts` connection을 조회한다
- **THEN** 시스템은 remote actor outbox refresh를 시도하지 않는다
- **AND** 시스템은 이미 materialized된 remote posts도 반환하지 않는다
- **AND** 시스템은 빈 connection을 반환한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 게시글이 없는 local profile 또는 materialized post가 없는 remote profile의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 프로필 목록에서 숨겨지는 게시글

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 established `ProfileFollow`로 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 `FOLLOWERS`, `DIRECT` 공개 범위의 게시글을 반환하지 않는다

### Requirement: Home timeline connection

API는 현재 active profile 기준 홈 타임라인을 최신순 Relay connection `Query.homeTimeline`로 노출해야 한다(MUST). `Query.homeTimeline`은 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST). active profile이 없거나 인증되지 않은 조회에는 요청을 거부하지 않고 `null`을 반환해야 한다(MUST).

#### Scenario: 내 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 현재 active profile이 작성한 `ACTIVE` 게시글을 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 첫 페이지 조회에 사용할 수 있어야 한다

#### Scenario: established local followee 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 다른 활성 local profile을 established `ProfileFollow`로 팔로우한다
- **THEN** 시스템은 해당 followee가 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다

#### Scenario: established remote followee 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 활성 ActivityPub remote profile을 established `ProfileFollow`로 팔로우한다
- **THEN** 시스템은 해당 remote followee에서 inbox delivery로 materialized된 `PUBLIC`, `UNLISTED` 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다

#### Scenario: suspended remote followee 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 `SUSPENDED` instance에 속한 ActivityPub remote profile을 established `ProfileFollow`로 팔로우한다
- **THEN** 시스템은 해당 remote followee에서 이미 materialized된 게시글을 반환하지 않는다

#### Scenario: 비팔로우 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 작성자를 established `ProfileFollow`로 팔로우하지 않는다
- **THEN** 시스템은 해당 작성자의 게시글을 반환하지 않는다

#### Scenario: 역방향 팔로워 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 다른 프로필이 현재 active profile을 팔로우하지만 현재 active profile은 그 프로필을 팔로우하지 않는다
- **THEN** 시스템은 해당 팔로워의 게시글을 반환하지 않는다

#### Scenario: active profile 없는 홈 타임라인 조회

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 요청을 거부하지 않고 `homeTimeline` 필드로 `null`을 반환한다
- **AND** GraphQL 인증 오류를 발생시키지 않는다
