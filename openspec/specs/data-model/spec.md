## Purpose

kosmo의 현재 PostgreSQL/Drizzle 기반 도메인 저장 모델, ID 생성 규칙, 주요 관계, enum 상태 값을 기준선으로 문서화한다.

## Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고 신규 행의 ID를 PostgreSQL 18.4 내장 `uuidv7()` default로 생성해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** 주요 도메인 테이블의 신규 행이 생성된다
- **THEN** 시스템은 table discriminator가 없는 표준 UUIDv7 문자열을 기본 키로 생성한다
- **AND** ID는 PostgreSQL `uuid` column에 저장된다
- **AND** 애플리케이션은 UUID bit layout을 직접 생성하지 않는다

#### Scenario: 기존 UUIDv8 행 유지

- **WHEN** 기존 table discriminator 포함 UUIDv8 primary key 또는 이를 참조하는 foreign key가 존재한다
- **THEN** 시스템은 해당 ID 값을 삭제, backfill 또는 재작성하지 않는다
- **AND** 기존 UUIDv8 row는 신규 UUIDv7 row와 같은 query, relation 및 loader 경로에서 계속 조회될 수 있다

#### Scenario: ID 전환 배포

- **WHEN** 신규 UUID 생성 규칙을 배포한다
- **THEN** 시스템은 PostgreSQL UUID column, primary key 또는 foreign key schema를 변경하지 않는다
- **AND** column `DEFAULT`를 `uuidv7()`로 바꾸는 schema migration만 실행한다
- **AND** 기존 ID 값을 UUIDv7으로 통일하는 data migration을 실행하지 않는다

#### Scenario: 시간 기반 ID 동작

- **WHEN** 시스템이 같은 millisecond에 여러 UUIDv7 ID를 생성한다
- **THEN** 시스템은 ID 값만으로 생성 순서가 단조 증가한다고 보장하지 않는다
- **AND** 저장 시각 순서가 필요한 query는 immutable timestamp와 ID tie-breaker를 사용한다

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

### Requirement: Instance storage

시스템은 local 및 ActivityPub federation instance를 `instance` 행으로 저장해야 한다(MUST).

#### Scenario: Store local instance

- **WHEN** local instance가 초기화된다
- **THEN** 시스템은 정규화 domain, instance kind, 생성 시각, 수정 시각을 저장한다
- **AND** local instance는 canonical origin을 저장한다
- **AND** configured local instance의 canonical origin과 domain은 federation identity의 source of truth이다
- **AND** canonical origin은 actor URI, WebFinger self link, profile-page link, key ID 같은 local absolute URL 생성에 사용된다
- **AND** domain은 WebFinger subject와 `Profile.relativeHandle`에 사용된다
- **AND** `PUBLIC_ORIGIN`은 local instance row를 만들거나 현재 deployment가 사용할 local instance row를 검증하는 입력으로만 사용된다

#### Scenario: Resolve canonical local origin

- **WHEN** 시스템이 ActivityPub actor URI, WebFinger subject, local profile 생성의 instance ID를 결정한다
- **THEN** 시스템은 `PUBLIC_ORIGIN`과 일치하는 configured local instance row의 canonical origin을 `localOrigin`으로 사용한다
- **AND** 시스템은 configured local instance row의 정규화 domain을 `localDomain`으로 사용한다
- **AND** request URL origin, Host header, `PUBLIC_API_ORIGIN`을 federation identity의 source of truth로 사용하지 않는다

#### Scenario: Missing or mismatched local instance configuration

- **WHEN** `PUBLIC_ORIGIN`과 일치하는 configured local instance row가 없다
- **THEN** 시스템은 ActivityPub discovery와 local profile 생성에 필요한 설정 오류로 처리한다

#### Scenario: Runtime local instance resolution does not bootstrap

- **WHEN** ActivityPub discovery 또는 local profile 생성 요청 처리 중 configured local instance를 해석한다
- **THEN** 시스템은 setup/migration bootstrap 없이 새 local instance row를 자동 생성하지 않는다
- **AND** 시스템은 `PUBLIC_ORIGIN`과 일치하는 existing row를 읽어 검증하고, 없거나 일치하지 않으면 설정 오류로 처리한다

#### Scenario: Store ActivityPub instance shell

- **WHEN** 시스템이 ActivityPub profile 저장을 위해 ActivityPub instance를 기록한다
- **THEN** 시스템은 ActivityPub instance의 정규화 domain, `ACTIVITYPUB` instance kind, 생성 시각, 수정 시각을 저장한다
- **AND** ActivityPub instance의 canonical origin은 선택적으로 저장할 수 있다
- **AND** ActivityPub actor fetch/cache 동작은 이 저장 요구사항에 포함되지 않는다

#### Scenario: Prevent duplicate instance domain

- **WHEN** 같은 domain의 instance가 이미 저장되어 있다
- **THEN** 시스템은 같은 정규화 domain을 가진 instance를 중복 저장하지 않는다

#### Scenario: Allow multiple local instance domains

- **WHEN** 서로 다른 domain의 local instance rows가 저장된다
- **THEN** 시스템은 instance kind가 `LOCAL`이라는 이유만으로 중복으로 처리하지 않는다
- **AND** 현재 deployment의 federation identity는 `PUBLIC_ORIGIN`과 일치하는 configured local instance row에서 결정한다

### Requirement: ActivityPub actor storage

시스템은 profile에 연결되는 ActivityPub actor metadata를 별도 행으로 저장하고, actor key material은 actor에 연결된 별도 행으로 저장해야 한다(MUST).

#### Scenario: Store local actor metadata

- **WHEN** local profile이 ActivityPub actor로 공개된다
- **THEN** 시스템은 profile, actor URI, actor type, 생성 시각, 수정 시각을 ActivityPub actor metadata로 저장한다
- **AND** actor URI는 `{localOrigin}/ap/actor/{profile.id}` 형식이다
- **AND** actor URI는 중복될 수 없다
- **AND** local profile은 local ActivityPub actor metadata row를 최대 1개만 가질 수 있다

#### Scenario: Store local actor keys

- **WHEN** local actor key pair가 생성된다
- **THEN** 시스템은 ActivityPub actor, key kind, public key JWK, private key JWK, 생성 시각을 저장한다
- **AND** key kind는 RSA-PKCS#1-v1.5와 Ed25519를 구분한다
- **AND** 같은 ActivityPub actor와 key kind의 key row는 중복될 수 없다

#### Scenario: Store remote actor shell

- **WHEN** 시스템이 remote profile의 ActivityPub actor 저장 경계를 마련한다
- **THEN** 시스템은 remote profile, actor URI, actor type을 ActivityPub actor metadata로 저장한다
- **AND** remote actor의 public key metadata가 주어지는 경우 private key 없이 actor key 저장 경계에 둘 수 있어야 한다
- **AND** actor URI는 중복될 수 없다
- **AND** remote profile은 remote ActivityPub actor metadata row를 최대 1개만 가질 수 있다
- **AND** remote actor fetch/cache, key refresh, signature verification 동작은 이번 요구사항에 포함되지 않는다

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

#### Scenario: 리모트 프로필 저장 전 인스턴스 보장

- **WHEN** remote profile shell을 새로 저장해야 한다
- **THEN** 시스템은 normalized domain에 해당하는 ActivityPub instance를 먼저 찾거나 생성한다
- **AND** 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 remote profile shell을 저장하지 않는다

#### Scenario: 계정-프로필 역할 저장

- **WHEN** 계정이 프로필에 연결된다
- **THEN** 시스템은 계정, 프로필, 역할, 생성 시각을 `account_profile`에 저장한다
- **AND** 동일한 계정과 프로필 조합은 중복될 수 없다
- **AND** 계정 또는 프로필이 삭제되면 관계도 함께 삭제된다

### Requirement: 팔로우 관계 저장

시스템은 팔로워와 팔로위 방향을 명시하는 성립된 프로필 간 팔로우 관계를 저장해야 하며, local profile과 ActivityPub remote profile이 같은 관계 모델에 참여할 수 있어야 한다(MUST).

#### Scenario: 팔로우 관계 생성

- **WHEN** 한 프로필이 다른 프로필을 팔로우한다
- **THEN** 시스템은 `profile_follow`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow` 행의 존재 자체가 성립된 팔로우 관계를 의미한다
- **AND** follower 또는 followee는 local profile 또는 ActivityPub remote profile일 수 있다
- **AND** 동일한 팔로워와 팔로위 조합은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 관계도 함께 삭제된다

#### Scenario: 원격 팔로우 activity projection 추적

- **WHEN** 팔로우 관계가 ActivityPub remote profile을 포함한다
- **THEN** inbound Follow는 별도 activity identity나 actor/object metadata 없이 actor pair의 `ProfileFollow` 관계 또는 inbound `ProfileFollowRequest` 요청으로 투영해야 한다
- **AND** outbound Follow identity, actor/object URI와 generation은 established `ProfileFollow`와 저장된 actor identity에서 안정적으로 파생할 수 있어야 한다
- **AND** Accept, Reject, Undo activity identity의 durable history와 delivery ordering, retry, queue metadata는 이번 domain table 요구사항이 아니다

### Requirement: 팔로우 요청 저장

시스템은 승인 기반 팔로우 흐름을 위해 팔로워와 팔로위 방향을 명시하는 대기 중인 프로필 간 팔로우 요청을 팔로우 관계와 별도 테이블에 저장해야 한다(MUST).

#### Scenario: 팔로우 요청 생성

- **WHEN** 한 프로필이 승인 필요한 다른 프로필에게 팔로우 요청을 보낸다
- **THEN** 시스템은 `profile_follow_request`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow_request` 행의 존재 자체가 대기 중인 요청을 의미한다
- **AND** 동일한 팔로워와 팔로위 조합의 요청은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 요청도 함께 삭제된다
- **AND** pending request 생성은 저장된 followers/following count를 변경하지 않는다

#### Scenario: 팔로우 요청을 중복 생성

- **WHEN** 같은 follower/followee pair에 pending request가 이미 있고 동일한 팔로우 요청을 다시 생성한다
- **THEN** 시스템은 기존 `profile_follow_request`를 반환한다
- **AND** 새 request를 만들거나 저장 count를 변경하지 않는다

#### Scenario: 기존 팔로우 관계가 있는 요청 생성

- **WHEN** 같은 follower/followee pair에 성립된 `ProfileFollow` 관계가 이미 있고 팔로우 요청을 생성한다
- **THEN** 시스템은 기존 `ProfileFollow` 관계를 반환한다
- **AND** 같은 pair의 pending `profile_follow_request`가 남아 있으면 같은 transaction 안에서 삭제한다
- **AND** 저장 count를 중복 증가시키지 않는다

#### Scenario: 팔로우 요청 승인

- **WHEN** followee가 pending 팔로우 요청을 승인한다
- **THEN** 시스템은 `ProfileFollow` 관계를 생성하거나 이미 존재하는 관계를 반환한다
- **AND** 해당 `profile_follow_request` 행을 삭제한다
- **AND** 새 관계가 생성된 경우에만 같은 transaction에서 follower의 following count와 followee의 followers count를 1씩 증가시킨다
- **AND** 승인 상태 값이나 처리 이력을 저장하지 않는다

#### Scenario: 팔로우 요청 승인 transaction rollback

- **WHEN** 팔로우 요청 승인이 caller transaction 안에서 실행되고 caller가 transaction을 rollback한다
- **THEN** request 삭제, relation 생성과 저장 count 변경도 모두 rollback된다
- **AND** transaction 밖에서 관찰 가능한 부분 변경이 남지 않는다

#### Scenario: 팔로우 요청 동시 승인

- **WHEN** 같은 pending request를 둘 이상의 실행이 동시에 승인한다
- **THEN** 시스템은 같은 follower/followee pair에 최대 하나의 `ProfileFollow` 관계만 유지한다
- **AND** 저장 count는 관계가 실제로 생성된 한 번만 증가한다
- **AND** 완료 뒤 pending request는 남지 않는다

#### Scenario: 팔로우 요청 거절

- **WHEN** followee가 pending 팔로우 요청을 거절한다
- **THEN** 시스템은 해당 `profile_follow_request` 행을 삭제한다
- **AND** 거절 상태 값이나 처리 이력을 저장하지 않는다
- **AND** 저장 count를 변경하지 않는다

#### Scenario: 팔로우 요청 취소

- **WHEN** follower가 자신이 만든 pending 팔로우 요청을 취소한다
- **THEN** 시스템은 해당 `profile_follow_request` 행을 삭제한다
- **AND** 취소 상태 값이나 처리 이력을 저장하지 않는다
- **AND** 저장 count를 변경하지 않는다

### Requirement: 게시물과 콘텐츠 저장

시스템은 게시물 메타데이터와 게시물 콘텐츠 revision을 분리하여 저장하고, version, nullable Plain Text summary와 canonical ProseMirror body를 포함한 PostContent document JSON을 revision의 canonical 표현으로 사용해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, canonical versioned PostContent document JSON과 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다
- **AND** document는 nullable일 수 없고 V1은 exact `{ version: 1, summary: string | null, body: ProseMirrorDoc }` shape다
- **AND** V1 summary는 nullable Plain Text Content Warning이고 body와 같은 revision의 authored content다
- **AND** 시스템은 summary, 파생 Plain Text나 실행 가능한 HTML 본문을 별도 canonical 값으로 저장하지 않는다
- **AND** JSON 안의 entity reference는 DB foreign key를 대체하지 않으며 필요한 relation projection은 같은 transaction에서 저장되고 canonical document로부터 재구축 가능해야 한다

#### Scenario: 비프로덕션 기존 게시물 migration

- **WHEN** Plain Text 저장 계약의 기존 `post`와 `post_content`가 있는 비프로덕션 DB에 V1 document migration을 적용한다
- **THEN** 시스템은 기존 `post`와 `post_content` 행을 모두 삭제한다
- **AND** `post.current_content_id` 참조 순서 때문에 migration이 실패하지 않는다
- **AND** `body_text`와 `content_warning` 컬럼을 제거하고 non-null `document` JSONB 컬럼을 추가한다
- **AND** migration 후 기존 게시물 또는 고아 콘텐츠가 남지 않는다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 계정-프로필 역할, 미디어, 인스턴스, ActivityPub actor, ActivityPub actor key가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyKind`에 정의된 값으로 제한된다

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

### Requirement: Remote actor refresh metadata

시스템은 ActivityPub actor metadata에 remote actor materialization과 refresh에 필요한 정보를 저장해야 한다(MUST).

#### Scenario: Store remote actor metadata

- **WHEN** remote ActivityPub actor가 성공적으로 materialize된다
- **THEN** 시스템은 actor URI, actor type, profile, 생성 시각, 수정 시각과 함께 마지막 fetch 시각을 저장한다
- **AND** actor URI는 중복될 수 없다
- **AND** remote profile은 ActivityPub actor metadata row를 최대 1개만 가질 수 있다

#### Scenario: Store remote actor source metadata

- **WHEN** remote actor가 inbox, outbox, followers, following, shared inbox URI를 제공한다
- **THEN** 시스템은 후속 follow/post changes가 사용할 수 있도록 제공된 endpoint URI를 actor metadata 또는 관련 저장 경계에 저장한다
- **AND** endpoint URI 저장은 follow delivery, collection fetch, post ingestion을 이번 change에서 제공한다는 의미가 아니다

#### Scenario: Mark stale remote actor

- **WHEN** remote actor의 마지막 fetch 시각이 없거나 7일을 초과했다
- **THEN** 시스템은 해당 actor를 federation 내부 materialization 경로에서 비동기 refresh 대상 stale actor로 판단할 수 있어야 한다
- **AND** stale 판단은 저장된 active profile 참조를 차단하지 않는다

### Requirement: ActivityPub Post mapping storage

시스템은 materialize된 remote ActivityPub Post URI와 kosmo Post identity를 하나의 최소 mapping으로 저장해야 한다(MUST).

#### Scenario: Store a remote Note mapping

- **WHEN** remote Note가 최초로 materialize된다
- **THEN** 시스템은 `activitypub_post`에 PostgreSQL `uuidv7()` default로 생성한 `id`, unique `uri`, unique `postId`, `receivedAt`과 nullable `publishedAt`만 저장한다
- **AND** `postId` foreign key는 Post 삭제 시 mapping을 CASCADE 삭제한다
- **AND** 일반 Post soft delete는 mapping을 보존한다

#### Scenario: Keep protocol validation outside the mapping

- **WHEN** 지원되는 remote Note가 Post로 materialize된다
- **THEN** mapping은 raw ActivityPub object type을 저장하지 않는다
- **AND** mapping은 `activityPubActorId`를 저장하지 않고 작성자 identity를 `Post.profileId`와 unique `ActivityPubActor.profileId` 관계에서 도출한다
- **AND** `activitypub_post.id`는 table discriminator가 없는 PostgreSQL UUIDv7 default를 사용한다

#### Scenario: Reject duplicate object identity

- **WHEN** 같은 object URI 또는 같은 Post mapping을 둘 이상 직접 저장한다
- **THEN** PostgreSQL unique constraint가 duplicate row를 거부한다
- **AND** 시스템은 별도 inbox activity receipt나 activity ID column을 요구하지 않는다

### Requirement: Stored profile follow counts

시스템은 local profile과 ActivityPub remote profile 모두에 대해 followers/following count를 `profile` row에 저장해야 한다(MUST).

#### Scenario: Initialize stored profile counts

- **WHEN** local profile 또는 ActivityPub remote profile이 생성된다
- **THEN** 시스템은 `profile` row에 followers count와 following count를 저장한다
- **AND** 저장 count는 음수가 될 수 없다
- **AND** 새 local profile의 followers count와 following count는 0으로 초기화한다
- **AND** 새 remote profile의 followers count와 following count는 actor materialization에서 확인한 remote followers/following collection count로 초기화한다
- **AND** remote collection count를 확인할 수 없으면 GraphQL non-null count 계약을 유지할 수 있도록 0으로 초기화할 수 있다

#### Scenario: Backfill stored profile counts

- **WHEN** followers/following 저장 count column을 기존 DB에 추가한다
- **THEN** migration은 기존 established `ProfileFollow` row를 기준으로 각 profile의 followers count와 following count를 채운다
- **AND** backfill은 기존 established relation 전체를 사용하며 profile/instance 가시성 상태를 이유로 relation을 삭제하거나 제외하지 않는다
- **AND** 이 one-time snapshot은 migration 전에 이미 비활성화된 profile 관계를 별도로 reconciliation하지 않으며 visible connection edge 수와의 상시 일치를 보장하지 않는다

#### Scenario: Update stored counts for established follow changes

- **WHEN** established `ProfileFollow` 관계가 새로 생성된다
- **THEN** 시스템은 같은 transaction에서 follower profile의 following count와 followee profile의 followers count를 1씩 증가시킨다
- **AND** follower 또는 followee가 local profile인지 ActivityPub remote profile인지는 count 갱신 조건을 바꾸지 않는다
- **AND** idempotent follow 요청처럼 기존 `ProfileFollow` 관계를 반환하는 경우에는 저장 count를 중복 증가시키지 않는다
- **AND** pending `ProfileFollowRequest` 생성 또는 삭제는 저장 count를 변경하지 않는다

#### Scenario: Update stored counts when established follow is removed

- **WHEN** established `ProfileFollow` 관계가 삭제된다
- **THEN** 시스템은 같은 transaction에서 follower profile의 following count와 followee profile의 followers count를 1씩 감소시킨다
- **AND** 저장 count는 0보다 작아질 수 없다
- **AND** follow 관계가 없어 idempotent unfollow로 처리되는 경우에는 저장 count를 변경하지 않는다
- **AND** 조건부 삭제가 expected row 불일치로 적용되지 않으면 저장 count도 변경하지 않는다

#### Scenario: Preserve stored relation and counts when a remote instance is suspended

- **WHEN** ActivityPub remote instance 상태가 `SUSPENDED`로 전환된다
- **THEN** 시스템은 해당 instance의 remote profile이 참여하는 established `ProfileFollow` row를 삭제하지 않는다
- **AND** suspension만으로 양쪽 profile의 저장 followers/following count를 변경하지 않는다
- **AND** suspension 중 GraphQL follow/unfollow action은 해당 remote profile을 NotFound로 숨긴다

#### Scenario: Refresh remote stored counts

- **WHEN** remote ActivityPub actor refresh가 followers/following collection count를 확인한다
- **THEN** 시스템은 해당 remote `Profile`의 저장 followers count와 following count를 확인한 값으로 갱신한다
- **AND** remote collection item 또는 page content는 이번 capability에서 mirror하지 않는다
- **AND** 이번 capability는 remote baseline count와 local optimistic delta를 별도 column으로 분리하지 않는다
- **AND** 저장 count는 best-effort 값이며, remote refresh와 이후 follow side effect가 마지막으로 반영한 값으로 간주한다
- **AND** remote collection count가 kosmo가 저장한 known `ProfileFollow` edge를 이미 포함하더라도 이번 capability는 해당 edge를 deduplicate하는 별도 count reconciliation model을 두지 않는다
- **AND** refresh에서 collection count를 확인할 수 없으면 기존 저장 count를 임의로 0으로 덮어쓰지 않는다

### Requirement: Remote follow activity projection

시스템은 ActivityPub remote Follow activity를 established `ProfileFollow` 관계 또는 inbound pending `ProfileFollowRequest` 요청으로 투영하고, 별도 inbound correlation 저장 없이 actor pair와 현재 저장 identity로 후속 처리를 검증할 수 있어야 한다(MUST).

#### Scenario: Derive outbound remote Follow correlation

- **WHEN** local profile이 remote ActivityPub profile을 follow하고 outbound Follow activity를 보낸다
- **THEN** 시스템은 outbound Follow activity identity를 configured canonical origin과 `ProfileFollow` 또는 `ProfileFollowRequest` id에서 파생해야 한다
- **AND** actor/object URI는 저장된 follower/followee actor identity에서, generation timestamp는 해당 row의 immutable createdAt에서 파생해야 한다
- **AND** outbound Follow activity identity는 생성된 request 또는 relation id에서 파생한 kosmo outbound Follow URI여야 한다
- **AND** outbound Follow activity identity는 follower actor URI와 followee actor URI만으로 파생하지 않고 새 logical outbound Follow activity마다 고유해야 한다
- **AND** outbound Follow activity identity는 kosmo가 발송하는 Follow/Undo transport identity로 안정적이어야 하지만, remote server가 후속 Accept/Reject object에서 이 identity를 보존한다는 것을 필수 전제로 삼지 않는다
- **AND** 후속 transport retry가 필요해도 같은 request 또는 relation row에서 같은 Follow activity identity를 다시 파생할 수 있어야 한다
- **AND** PROD-244 outbound mutation은 APPROVAL_REQUIRED remote `ProfileFollowRequest`를 만들며, inbound remote request 생성은 PROD-243이, local request 생성과 local/remote 공통 처리 lifecycle은 PROD-272가 별도 경계에서 다룬다
- **AND** delivery ordering, retry, queue와 history 같은 transport metadata는 도메인 테이블에 중복 저장하지 않는다

#### Scenario: Project inbound remote Follow without correlation storage

- **WHEN** remote ActivityPub profile이 local profile을 follow한다
- **THEN** 시스템은 local follow policy에 따라 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest` 요청을 저장한다
- **AND** inbound Follow activity id, actor URI와 object URI를 `ProfileFollow` 또는 `ProfileFollowRequest`에 별도 저장하지 않아야 한다
- **AND** 같은 remote follower와 local followee pair의 pending `ProfileFollowRequest`가 이미 있으면 새 duplicate Follow metadata를 저장하지 않고 기존 request를 유지한다
- **AND** 같은 remote follower와 local followee pair의 established `ProfileFollow`가 이미 있으면 같은 id의 재전달 또는 새 Follow id를 가진 duplicate Follow에서도 기존 관계를 유지한다
- **AND** duplicate inbound Follow에 대한 `Accept(Follow)` response object는 현재 검증을 통과한 수신 Follow object를 사용해야 한다
- **AND** inbound `Undo(Follow)`는 Follow id를 저장하거나 비교하지 않고 verified same actor/object이면 현재 관계 또는 request를 취소하는 의사로 처리할 수 있어야 한다
- **AND** relation/request 삭제는 처리 중 확인한 exact row가 일치할 때만 적용되고, established relation을 실제 삭제한 transaction만 저장 count를 감소시켜야 한다
- **AND** IRI-only `Undo.object`는 이번 capability에서 relation/request로 역조회하지 않고 follow graph/request side effect 없이 무시할 수 있어야 하며, 저장된 actor instance의 reachability 복구는 이 제한에 포함하지 않는다
- **AND** transport의 조기 중복 제거와 무관하게 durable relation/request side effect는 PostgreSQL unique 제약과 exact-row 조건이 source of truth여야 한다

#### Scenario: Remove rejected remote follow projection

- **WHEN** remote actor가 저장된 outbound Follow의 actor/object와 일치하는 Follow를 object로 하는 Reject를 보낸다
- **THEN** 시스템은 embedded Follow가 현재 outbound Follow generation과 일치하고 transaction에서 expected row가 여전히 현재 projection이면 pending request 또는 optimistic established relation의 exact row를 제거해야 한다
- **AND** remote `Reject.published`와 local 수신 시각은 이 판정에 사용하지 않는다
- **AND** 시스템은 거절 상태 값을 저장하지 않는다
