## ADDED Requirements

### Requirement: ActivityPub object materialization storage

시스템은 remote ActivityPub object URI와 kosmo `Post` row의 연결을 저장해야 한다(MUST).

#### Scenario: Store remote Note object mapping

- **WHEN** remote ActivityPub Note가 kosmo `Post`로 materialize된다
- **THEN** 시스템은 ActivityPub object URI, object type, 작성 actor, 연결된 post, fetch 시각, published 시각을 저장한다
- **AND** ActivityPub object URI는 중복될 수 없다
- **AND** 하나의 ActivityPub object는 최대 하나의 kosmo `Post`에 연결된다
- **AND** 하나의 remote materialized `Post`는 최대 하나의 ActivityPub object identity에 연결된다

#### Scenario: Reuse existing remote object mapping

- **WHEN** 이미 저장된 ActivityPub object URI가 다시 outbox ingestion에서 발견된다
- **THEN** 시스템은 새 `Post`를 만들지 않고 기존 object mapping과 연결된 `Post`를 갱신할 수 있다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `session`, `instance`, `activitypub_actor`, `activitypub_actor_key`, ActivityPub object mapping 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 게시물과 콘텐츠 저장

시스템은 local 게시물과 remote ActivityPub Note에서 materialized된 게시물의 메타데이터와 본문 콘텐츠를 분리하여 저장해야 한다(MUST).

#### Scenario: 로컬 게시물 저장

- **WHEN** local profile이 게시물을 생성한다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 리모트 게시물 저장

- **WHEN** remote ActivityPub Note가 게시물로 materialize된다
- **THEN** 시스템은 remote 작성 profile, 공개 범위, 게시물 상태, 현재 콘텐츠, Note published 시각을 저장한다
- **AND** remote 작성 profile은 `profile.id`를 참조해야 한다
- **AND** ActivityPub object URI mapping은 materialized remote post와 연결되어야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, 텍스트 본문, TipTap JSON 본문, 선택적 HTML 본문, 선택적 스포일러 텍스트, 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다

#### Scenario: 리모트 게시물 콘텐츠 projection 저장

- **WHEN** remote ActivityPub Note content가 `PostContent`로 materialize된다
- **THEN** 시스템은 HTML content를 `bodyHtml`에 저장할 수 있다
- **AND** 시스템은 HTML 또는 source content에서 plain text projection을 만들어 `bodyText`에 저장한다
- **AND** 시스템은 plain text projection에서 단순 TipTap JSON 문서를 만들어 `bodyJson`에 저장한다
