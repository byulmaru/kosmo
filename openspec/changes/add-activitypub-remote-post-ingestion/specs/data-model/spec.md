## ADDED Requirements

### Requirement: ActivityPub object mapping storage

시스템은 remote ActivityPub Note object URI와 kosmo Post identity를 하나의 mapping으로 저장해야 한다(MUST).

#### Scenario: Store a remote Note mapping

- **WHEN** remote Note가 최초로 materialize된다
- **THEN** 시스템은 `activitypub_object`에 PostgreSQL `uuidv7()` default로 생성한 `id`, unique `uri`, `type = NOTE`, `activityPubActorId`, unique `postId`, `receivedAt`과 nullable `publishedAt`을 저장한다
- **AND** `activityPubActorId`는 indexed non-unique foreign key이고 actor 삭제는 RESTRICT한다
- **AND** `postId` foreign key는 Post 삭제 시 mapping을 CASCADE 삭제한다
- **AND** actor URI를 mapping에 중복 저장하지 않고 object type 자체에는 unique constraint를 두지 않는다

#### Scenario: Assign object identity metadata

- **WHEN** ActivityPub object mapping schema를 추가한다
- **THEN** 시스템은 `ActivityPubObjectType.NOTE`와 PostgreSQL enum을 추가하고 `activitypub_object.id`는 table discriminator가 없는 PostgreSQL UUIDv7 default를 사용한다
- **AND** 같은 actor가 여러 NOTE mapping을 가질 수 있다

#### Scenario: Reject duplicate object identity

- **WHEN** 같은 object URI 또는 같은 Post mapping을 둘 이상 직접 저장한다
- **THEN** PostgreSQL unique constraint가 duplicate row를 거부한다
- **AND** 시스템은 별도 inbox activity receipt나 activity ID column을 요구하지 않는다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `notification`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `profile_follow_request`, `session`, `instance`, `activitypub_actor`, `activitypub_actor_key`, `activitypub_object` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 계정-프로필 역할, 미디어, 알림, 인스턴스, ActivityPub actor, ActivityPub actor key, ActivityPub object가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`, `NotificationKind`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyKind`, `ActivityPubObjectType`에 정의된 값으로 제한된다
