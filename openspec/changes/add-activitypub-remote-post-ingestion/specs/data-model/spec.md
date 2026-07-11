## ADDED Requirements

### Requirement: ActivityPub actor addressing metadata

시스템은 remote Note addressing을 판정하는 데 필요한 nullable author followers collection URI를 ActivityPub actor metadata에 저장해야 한다(MUST).

#### Scenario: Store remote actor followers collection URI

- **WHEN** remote ActivityPub actor가 최초 materialize되거나 refresh된다
- **THEN** 시스템은 Fedify actor의 `followersId?.href`를 nullable `activitypub_actor.followers_uri`에 저장한다
- **AND** actor가 `followersId`를 제공하지 않으면 `followers_uri`는 `null`이다
- **AND** 시스템은 actor URI에 `/followers` 같은 path를 붙여 followers collection URI를 추론하지 않는다

### Requirement: ActivityPub object materialization storage

시스템은 inbound remote ActivityPub object URI와 kosmo `Post` row의 연결을 저장해야 한다(MUST).

#### Scenario: Store remote Note object mapping

- **WHEN** remote ActivityPub Note가 kosmo `Post`로 materialize된다
- **THEN** 시스템은 `activitypub_object`에 `id`, Note `id.href`인 object `uri`, `type`, `activityPubActorId`, `postId`, `receivedAt`, nullable `publishedAt`을 저장한다
- **AND** `type`은 non-unique `ActivityPubObjectType` enum이고 이번 capability에서 materialized한 Note에는 `NOTE`를 저장한다
- **AND** `activityPubActorId`는 작성 actor의 `activitypub_actor.id`를 참조하는 non-unique foreign key이고 actor URI를 중복 저장하지 않는다
- **AND** `postId`는 materialized `post.id`를 참조하는 foreign key이다
- **AND** Note `published`가 없으면 `publishedAt`은 `null`이어야 한다
- **AND** `uri`에는 unique constraint가 있어야 한다
- **AND** `postId`에는 unique constraint가 있어야 한다
- **AND** `activityPubActorId`에는 non-unique index가 있어야 하고 `type`에는 unique constraint를 두지 않는다
- **AND** 최초 `Post`, `PostContent`, resolved `post_mention`, ActivityPub object mapping 생성은 하나의 transaction으로 수행된다

#### Scenario: Handle concurrent duplicate remote object materialization

- **WHEN** 같은 remote actor의 동일 ActivityPub object URI가 최초 materialization 중 동시에 전달된다
- **THEN** 시스템은 최대 하나의 ActivityPub object mapping과 연결된 `Post`만 생성한다
- **AND** object URI unique conflict가 발생한 transaction은 부분 생성된 `Post`, `PostContent` 또는 `post_mention`을 남기지 않는다

#### Scenario: Reuse existing remote object mapping from duplicate delivery

- **WHEN** 이미 저장된 ActivityPub object URI가 다시 inbox delivery에서 발견된다
- **AND** 기존 object mapping의 `activityPubActorId`가 이번 delivery actor URI로 조회한 `activitypub_actor.id`와 같다
- **THEN** 시스템은 새 `Post`를 만들지 않고 기존 object mapping과 연결된 `Post`를 재사용한다
- **AND** 재전달된 Note에서 저장될 canonical `bodyJson`의 구조가 변경되었으면 시스템은 새 `PostContent` revision을 생성하고 기존 `Post.currentContentId`를 새 revision으로 교체한다
- **AND** 재전달된 Note에서 저장될 canonical `bodyJson`이 같으면 시스템은 기존 `PostContent` revision을 재사용한다
- **AND** 시스템은 재전달된 Note의 visibility와 관계없이 최초 `Post.visibility`를 갱신하지 않는다
- **AND** 시스템은 최초 object mapping의 수신 시각과 원본 published 시각을 갱신하지 않는다
- **AND** 시스템은 기존 `Post.createdAt`을 갱신하지 않는다

#### Scenario: Serialize existing remote object revision updates

- **WHEN** 같은 remote actor의 기존 ActivityPub object URI가 서로 다른 `Create` delivery에서 동시에 갱신된다
- **THEN** 시스템은 기존 object mapping 갱신을 transaction에서 수행하고 해당 `activitypub_object` row를 잠근 뒤 canonical `bodyJson`을 비교한다
- **AND** 같은 canonical `bodyJson`의 동시 재전달은 동일 `PostContent` revision을 중복 생성하지 않는다
- **AND** 시스템은 비교 결과에 따라 최대 하나의 새 revision을 생성하고 `Post.currentContentId`를 해당 revision으로 교체하거나 기존 revision을 재사용한다

#### Scenario: Reject duplicate remote object mapping from different actor

- **WHEN** 이미 저장된 ActivityPub object URI가 다시 inbox delivery에서 발견된다
- **AND** 기존 object mapping의 `activityPubActorId`가 이번 delivery actor URI로 조회한 `activitypub_actor.id`와 다르다
- **THEN** 시스템은 새 `Post`를 만들지 않는다
- **AND** 기존 object mapping과 연결된 `Post`, `PostContent`, `post_mention`, ActivityPub object mapping을 갱신하지 않는다

### Requirement: Post mention relation storage

시스템은 Post에서 mention된 local 또는 ActivityPub remote Profile을 origin 공통 `post_mention` 관계로 저장해야 한다(MUST).

#### Scenario: Store materialized remote Post mentions

- **WHEN** remote ActivityPub Note가 최초 `Post`로 materialize되고 Note `toIds`의 mention actor URI가 active local 또는 remote `Profile`로 resolve된다
- **THEN** 시스템은 `post_mention`에 `id`, `postId`, `profileId`, `createdAt`을 저장한다
- **AND** `postId`는 `post.id`, `profileId`는 `profile.id`를 참조한다
- **AND** 같은 Post와 Profile 조합은 중복될 수 없다
- **AND** `postId`와 `profileId`에는 각각 조회용 index가 있어야 한다
- **AND** Post 또는 mentioned Profile이 삭제되면 연결된 mention 관계도 함께 삭제된다
- **AND** 최초 Post와 mention 관계 생성은 `Post`, `PostContent`, ActivityPub object mapping과 같은 transaction에서 수행된다

#### Scenario: Do not store unresolved raw mention URI

- **WHEN** Note `toIds`의 mention actor URI가 local 또는 materialized ActivityPub remote `Profile`로 resolve되지 않는다
- **THEN** 시스템은 raw actor URI만 가진 `post_mention` row를 저장하지 않는다
- **AND** 이번 capability는 nullable `profileId` 또는 별도 raw recipient URI 저장소를 추가하지 않는다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `post_mention`, `profile`, `profile_follow`, `profile_follow_request`, `session`, `instance`, `activitypub_actor`, `activitypub_actor_key`, `activitypub_object` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** `activitypub_object`는 `TableDiscriminator.ActivityPubObjects`를 사용한다
- **AND** `post_mention`은 `TableDiscriminator.PostMentions`를 사용한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 열거형 상태 값

시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** 계정, 프로필, 세션, OAuth token, 애플리케이션, 게시물, 게시물 mention, 계정-프로필 역할, 미디어, 인스턴스, ActivityPub actor, ActivityPub actor key, ActivityPub object가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `AccountState`, `ProfileState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyKind`, `ActivityPubObjectType`에 정의된 값으로 제한된다

### Requirement: 게시물과 콘텐츠 저장

시스템은 local 게시물과 remote ActivityPub Note에서 materialized된 게시물의 메타데이터와 본문 콘텐츠를 분리하여 저장해야 한다(MUST).

#### Scenario: 로컬 게시물 저장

- **WHEN** local profile이 게시물을 생성한다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 리모트 게시물 저장

- **WHEN** remote ActivityPub Note가 게시물로 materialize된다
- **THEN** 시스템은 remote 작성 profile, 공개 범위, `ACTIVE` 게시물 상태, 현재 콘텐츠, Note published 시각 또는 최초 수신 시각 fallback을 저장한다
- **AND** Note published 시각이 수신 시각보다 미래이면 `Post.createdAt`에는 원본 published 시각 대신 수신 시각 fallback을 저장한다
- **AND** remote 작성 profile은 `profile.id`를 참조해야 한다
- **AND** ActivityPub object URI mapping은 materialized remote post와 연결되어야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, 텍스트 본문, TipTap JSON 본문, 선택적 HTML 본문, 선택적 스포일러 텍스트, 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다

#### Scenario: 리모트 게시물 콘텐츠 projection 저장

- **WHEN** remote ActivityPub Note content가 `PostContent`로 materialize된다
- **THEN** 시스템은 remote Note HTML 원본을 저장하지 않고 `bodyHtml`을 `null`로 둔다
- **AND** Fedify의 단일 `Note.content`가 `LanguageString`이면 locale은 저장하지 않고 `.toString()` 문자열 값만 projection 입력으로 사용한다
- **AND** 시스템은 Note media type에 따라 server-side TipTap HTML parsing 또는 plain-text helper로 canonical `bodyJson`을 만들고 여기서 trim된 `bodyText`를 추출해 저장한다
- **AND** Note content가 없으면 빈 `bodyText`와 빈 TipTap document를 저장할 수 있다
- **AND** 최초 또는 변경 revision의 `createdAt`은 해당 delivery 수신 시각이다
