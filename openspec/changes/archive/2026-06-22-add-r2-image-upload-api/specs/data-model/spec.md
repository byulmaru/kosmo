## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `session` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 팔로우 관계, 계정-프로필 역할, 미디어가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `ProfileFollowState`, `AccountProfileRole`, `MediaSource`에 정의된 값으로 제한된다

## ADDED Requirements

### Requirement: 파일과 미디어 메타데이터 저장

시스템은 R2에 저장된 물리 파일 메타데이터를 `file` 테이블에 저장하고, 로컬/리모트 논리 미디어 메타데이터를 `media` 테이블에 저장해야 한다(MUST).

#### Scenario: 로컬 업로드 media 저장

- **WHEN** 인증된 사용자가 이미지 업로드에 성공한다
- **THEN** 시스템은 업로드된 R2 객체에 대해 `file` 행을 저장한다
- **AND** `file` 행은 R2 storage key, MIME 타입, byte size, 생성 시각을 저장한다
- **AND** 공개 URL은 R2 storage key와 런타임 public base URL에서 계산하고 `file` 행에 저장하지 않는다
- **AND** `file` 행의 이미지 너비, 이미지 높이, SHA-256은 후속 이미지 처리/계측 전까지 비어 있을 수 있다
- **AND** 시스템은 `source = LOCAL`인 `media` 행을 저장한다
- **AND** `media` 행은 업로드 계정, 필수 actor 프로필, 원본 file ID, 생성 시각을 저장한다
- **AND** 로컬 업로드의 업로드 계정은 `account.id`를 참조해야 한다
- **AND** actor 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 후속 이미지 처리 metadata 저장

- **WHEN** 후속 워커가 업로드된 이미지를 변환하거나 썸네일을 생성한다
- **THEN** 시스템은 추가 R2 객체를 `file` 행으로 저장할 수 있다
- **AND** `media` 행은 썸네일 file ID와 base64 thumbhash를 저장할 수 있다
- **AND** `file` 행은 width, height, SHA-256을 저장할 수 있다

#### Scenario: 리모트 media 메타데이터 저장

- **WHEN** 시스템이 ActivityPub 리모트 이미지 메타데이터를 기록한다
- **THEN** 시스템은 `source = REMOTE`인 `media` 행을 저장할 수 있다
- **AND** 리모트 media 행은 `profile.id`, remote URL, remote fetched timestamp를 저장할 수 있다
- **AND** 리모트 media 행은 lazy image proxy 처리 전까지 file ID와 thumbhash를 비워둘 수 있다
