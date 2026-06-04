## Purpose

kosmo의 현재 PostgreSQL/Drizzle 기반 도메인 저장 모델, ID 생성 규칙, 주요 관계, enum 상태 값을 기준선으로 문서화한다.

## Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `session` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 계정과 세션 저장

시스템은 OIDC 계정, 애플리케이션, 세션을 별도 테이블로 저장해야 한다(MUST).

#### Scenario: OIDC 계정 저장

- **WHEN** 사용자가 OIDC subject로 로그인한다
- **THEN** 시스템은 `account.oidc_subject`를 고유한 외부 계정 식별자로 저장한다
- **AND** 계정 표시 이름과 계정 상태를 저장한다
- **AND** `oidc_subject`는 중복될 수 없다

#### Scenario: 세션 저장

- **WHEN** 로그인 세션이 생성된다
- **THEN** 시스템은 `session.account_id`, 선택적 `session.application_id`, 선택적 `session.active_profile_id`, 선택적 `session.oidc_session_key`, 고유한 `session.token`, 세션 상태, 발급 시각, 마지막 사용 시각을 저장한다
- **AND** `session.account_id`는 `account.id`를 참조해야 한다

### Requirement: OAuth 애플리케이션 저장

시스템은 OAuth 클라이언트, 계정별 권한 부여, authorization code, token을 별도 테이블로 저장해야 한다(MUST).

#### Scenario: 애플리케이션 등록 정보 저장

- **WHEN** 애플리케이션이 저장된다
- **THEN** 시스템은 고유한 `client_id`, 선택적 `client_secret_hash`, 이름, redirect URI 목록, scope 목록, 애플리케이션 타입, 애플리케이션 상태를 저장한다
- **AND** 소유 계정은 선택적으로 연결될 수 있다

#### Scenario: 애플리케이션 권한 부여 저장

- **WHEN** 계정이 애플리케이션에 scope를 허용한다
- **THEN** 시스템은 애플리케이션, 계정, 선택적 프로필, scope 목록, 생성 시각, 선택적 철회 시각을 저장한다
- **AND** 프로필이 연결된 권한 부여는 동일한 애플리케이션, 계정, 프로필 조합으로 중복될 수 없다

#### Scenario: OAuth authorization code 저장

- **WHEN** authorization code가 발급된다
- **THEN** 시스템은 고유한 code hash, 애플리케이션, 계정, 선택적 프로필, redirect URI, scope 목록, PKCE challenge, challenge method, 생성 시각, 만료 시각, 선택적 소비 시각을 저장한다

#### Scenario: OAuth token 저장

- **WHEN** OAuth token이 발급된다
- **THEN** 시스템은 고유한 access token hash, 선택적 refresh token hash, 애플리케이션, 계정, 선택적 프로필, scope 목록, 토큰 상태, 발급 시각, 마지막 사용 시각, 만료 시각, 선택적 철회 시각을 저장한다

### Requirement: 프로필과 계정-프로필 관계 저장

시스템은 소셜 프로필을 계정과 분리하여 저장하고, 계정과 프로필의 다대다 관계를 역할과 함께 저장해야 한다(MUST).

#### Scenario: 프로필 저장

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 상태, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 생성 시각을 저장한다
- **AND** 정규화된 handle은 중복될 수 없다
- **AND** 프로필 상태 기본값은 `ACTIVE`이다

#### Scenario: 계정-프로필 역할 저장

- **WHEN** 계정이 프로필에 연결된다
- **THEN** 시스템은 계정, 프로필, 역할, 생성 시각을 `account_profile`에 저장한다
- **AND** 동일한 계정과 프로필 조합은 중복될 수 없다
- **AND** 계정 또는 프로필이 삭제되면 관계도 함께 삭제된다

### Requirement: 팔로우 관계 저장

시스템은 팔로워와 팔로위 방향을 명시하는 프로필 간 팔로우 관계를 저장해야 한다(MUST).

#### Scenario: 팔로우 관계 생성

- **WHEN** 한 프로필이 다른 프로필을 팔로우한다
- **THEN** 시스템은 `follower_profile_id`, `followee_profile_id`, 팔로우 상태, 생성 시각, 선택적 응답 시각을 저장한다
- **AND** 동일한 팔로워와 팔로위 조합은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 관계도 함께 삭제된다

### Requirement: 게시물과 콘텐츠 저장

시스템은 게시물 메타데이터와 게시물 본문 콘텐츠를 분리하여 저장해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, 텍스트 본문, TipTap JSON 본문, 선택적 HTML 본문, 선택적 스포일러 텍스트, 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 팔로우 관계, 계정-프로필 역할이 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `ProfileFollowState`, `AccountProfileRole`에 정의된 값으로 제한된다
