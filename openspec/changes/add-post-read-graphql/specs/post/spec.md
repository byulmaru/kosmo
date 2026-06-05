## ADDED Requirements

### Requirement: Post 단건 조회 query

API는 ID로 단일 활성 게시글을 조회하는 `post` query를 제공해야 하며, 조회 가능한 게시글이 없으면 `null`을 반환해야 한다(MUST).

#### Scenario: 활성 게시글 단건 조회

- **WHEN** 클라이언트가 활성 게시글의 ID로 `post` query를 호출한다
- **THEN** 시스템은 해당 `Post` object를 반환한다

#### Scenario: 없는 게시글 단건 조회

- **WHEN** 클라이언트가 존재하지 않는 ID로 `post` query를 호출한다
- **THEN** 시스템은 `null`을 반환한다

#### Scenario: 비활성 게시글 단건 조회

- **WHEN** 클라이언트가 상태가 `ACTIVE`가 아니거나 작성자 프로필이 비활성인 게시글의 ID로 `post` query를 호출한다
- **THEN** 시스템은 `null`을 반환한다

### Requirement: 프로필 게시글 목록 connection

API는 프로필이 작성한 활성 게시글을 최신순 Relay connection `Profile.posts`로 노출해야 한다(MUST).

#### Scenario: 프로필 게시글 목록 조회

- **WHEN** 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `state`가 `ACTIVE`인 게시글만 반환한다
- **AND** 게시글은 생성 시각 기준 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 게시글이 없는 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 공개 범위 필터 미적용

- **WHEN** 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 게시글 공개 범위(`visibility`)와 무관하게 `state`가 `ACTIVE`인 게시글을 노출한다
- **AND** viewer 기준 공개 범위 접근 제어는 이 변경에서 적용하지 않는다
