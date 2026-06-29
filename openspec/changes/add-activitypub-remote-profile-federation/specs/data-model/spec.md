## ADDED Requirements

### Requirement: Remote actor refresh metadata

시스템은 ActivityPub actor metadata에 remote actor materialization과 refresh에 필요한 정보를 저장해야 한다(MUST).

#### Scenario: Store remote actor metadata

- **WHEN** remote ActivityPub actor가 성공적으로 materialize된다
- **THEN** 시스템은 actor URI, actor type, profile, 생성 시각, 수정 시각과 함께 마지막 fetch 시각을 저장한다
- **AND** actor URI는 중복될 수 없다
- **AND** remote profile은 ActivityPub actor metadata row를 최대 1개만 가질 수 있다

#### Scenario: Store remote actor source metadata

- **WHEN** remote actor가 inbox, outbox, followers, following, shared inbox URI를 제공한다
- **THEN** 시스템은 후속 follow/post changes가 사용할 수 있도록 endpoint URI를 actor metadata 또는 관련 저장 경계에 저장할 수 있다
- **AND** endpoint URI 저장은 follow delivery, collection fetch, post ingestion을 이번 change에서 제공한다는 의미가 아니다

#### Scenario: Mark stale remote actor

- **WHEN** remote actor의 마지막 fetch 시각이 7일을 초과했다
- **THEN** 시스템은 해당 actor를 federation 내부 materialization 경로에서 refresh 대상 stale actor로 판단할 수 있어야 한다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `session`, `instance`, `activitypub_actor`, `activitypub_actor_key` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 프로필과 계정-프로필 관계 저장

시스템은 소셜 프로필을 계정과 분리하여 저장하고, 계정과 프로필의 다대다 관계를 역할과 함께 저장해야 한다(MUST).

#### Scenario: 프로필 저장

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 상태, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 프로필 상태 기본값은 `ACTIVE`이다

#### Scenario: 로컬 프로필 저장

- **WHEN** local profile이 생성된다
- **THEN** 시스템은 configured local instance ID를 profile의 소속 instance로 저장한다
- **AND** local profile의 ActivityPub actor URI는 profile ID 기반 `/ap/actor/{profile.id}`로 파생될 수 있다

#### Scenario: 리모트 프로필 저장

- **WHEN** remote profile shell이 저장된다
- **THEN** 시스템은 remote instance ID를 profile의 소속 instance로 저장한다
- **AND** remote profile 저장은 remote follow, inbox activity 처리, remote post ingestion을 의미하지 않는다

#### Scenario: 계정-프로필 역할 저장

- **WHEN** 계정이 프로필에 연결된다
- **THEN** 시스템은 계정, 프로필, 역할, 생성 시각을 `account_profile`에 저장한다
- **AND** 동일한 계정과 프로필 조합은 중복될 수 없다
- **AND** 계정 또는 프로필이 삭제되면 관계도 함께 삭제된다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 팔로우 관계, 계정-프로필 역할, 미디어, 인스턴스, ActivityPub actor, ActivityPub actor key가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `ProfileFollowState`, `AccountProfileRole`, `MediaSource`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyType`에 정의된 값으로 제한된다
