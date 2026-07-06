## ADDED Requirements

### Requirement: 팔로우 요청 저장

시스템은 승인 기반 팔로우 흐름을 위해 팔로워와 팔로위 방향을 명시하는 대기 중인 프로필 간 팔로우 요청을 팔로우 관계와 별도 테이블에 저장해야 한다(MUST).

#### Scenario: 팔로우 요청 생성

- **WHEN** 한 프로필이 승인 필요한 다른 프로필에게 팔로우 요청을 보낸다
- **THEN** 시스템은 `profile_follow_request`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow_request` 행의 존재 자체가 대기 중인 요청을 의미한다
- **AND** 동일한 팔로워와 팔로위 조합의 요청은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 요청도 함께 삭제된다

#### Scenario: 팔로우 요청 승인

- **WHEN** 팔로우 요청이 승인된다
- **THEN** 시스템은 `ProfileFollow` 관계를 생성한다
- **AND** 해당 `profile_follow_request` 행을 삭제한다
- **AND** 승인 상태 값을 저장하지 않는다

#### Scenario: 팔로우 요청 거절

- **WHEN** 팔로우 요청이 거절된다
- **THEN** 시스템은 해당 `profile_follow_request` 행을 삭제한다
- **AND** 거절 상태 값을 저장하지 않는다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `profile_follow_request`, `session` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 팔로우 관계 저장

시스템은 팔로워와 팔로위 방향을 명시하는 성립된 프로필 간 팔로우 관계를 저장해야 한다(MUST).

#### Scenario: 팔로우 관계 생성

- **WHEN** 한 프로필이 다른 프로필을 팔로우한다
- **THEN** 시스템은 `profile_follow`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow` 행의 존재 자체가 성립된 팔로우 관계를 의미한다
- **AND** 동일한 팔로워와 팔로위 조합은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 관계도 함께 삭제된다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 계정-프로필 역할, 미디어가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`에 정의된 값으로 제한된다
