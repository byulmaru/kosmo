## MODIFIED Requirements

### Requirement: 프로필 게시글 목록 connection

API는 노출 가능한 활성 profile이 작성한 저장된 활성 게시글을 최신순 Relay connection `Profile.posts`로 노출해야 하며, profile의 instance kind와 무관하게 viewer와 작성자의 관계에 따라 공개 범위를 제한해야 한다(MUST).

#### Scenario: 공개 프로필 게시글 목록 조회

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 활성 profile을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC` 또는 `UNLISTED` 공개 범위의 `ACTIVE` 게시글만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 작성자 본인의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 활성 profile이고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 모든 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: follower의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 활성 profile을 팔로우하고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 저장된 게시글이 없는 활성 profile의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 저장된 remote profile 게시글 조회

- **WHEN** 클라이언트가 저장된 active remote profile의 `posts` connection을 조회한다
- **THEN** 시스템은 kosmo DB에 저장된 해당 profile의 `ACTIVE` Post에 일반 게시글 공개 범위를 적용해 반환한다
- **AND** 저장된 Post가 없거나 viewer에게 보이는 Post가 없으면 빈 connection을 반환한다
- **AND** 시스템은 remote actor fetch, remote post fetch, outbox/ActivityPub collection fetch, Post materialization을 시도하지 않는다

#### Scenario: 프로필 목록에서 숨겨지는 게시글

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 활성 profile을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 `FOLLOWERS`, `DIRECT` 공개 범위의 게시글을 반환하지 않는다
