## ADDED Requirements

### Requirement: Home timeline connection

API는 현재 active profile 기준 홈 타임라인을 최신순 Relay connection `Query.homeTimeline`로 노출해야 한다(MUST).

#### Scenario: 내 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 현재 active profile이 작성한 `ACTIVE` 게시글을 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 첫 페이지 조회에 사용할 수 있어야 한다

#### Scenario: accepted followee 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 다른 활성 프로필을 `ACCEPTED` 상태로 팔로우한다
- **THEN** 시스템은 해당 followee가 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 `ACTIVE` 게시글을 반환한다
- **AND** `DIRECT` 공개 범위의 게시글은 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다

#### Scenario: 비팔로우 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 작성자를 `ACCEPTED` 상태로 팔로우하지 않는다
- **THEN** 시스템은 해당 작성자의 게시글을 반환하지 않는다

#### Scenario: 역방향 팔로워 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 다른 프로필이 현재 active profile을 팔로우하지만 현재 active profile은 그 프로필을 팔로우하지 않는다
- **THEN** 시스템은 해당 팔로워의 게시글을 반환하지 않는다

#### Scenario: active profile 없는 홈 타임라인 조회

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 GraphQL active profile 인증 scope로 요청을 거부한다
