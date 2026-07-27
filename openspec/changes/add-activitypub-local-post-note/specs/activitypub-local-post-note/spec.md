## ADDED Requirements

### Requirement: Local Post ActivityPub identity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. 시스템은 Content가 있는 Local Post의 ActivityPub identity를 configured Local Instance의 canonical origin과 immutable Post DB UUID에서 파생한 `/ap/note/{postId}` 절대 URI로 제공해야 한다(MUST). Local Post identity를 위해 remote ActivityPub Post mapping row를 만들지 않아야 한다(MUST).

#### Scenario: Local Note identity 파생

- **WHEN** configured Local Instance에 속한 Author의 Content가 있는 Local Post를 ActivityPub object로 식별한다
- **THEN** 시스템은 `{canonicalOrigin}/ap/note/{postId}`를 Note identity로 사용한다
- **AND** `postId`에는 immutable Post DB UUID를 사용한다
- **AND** Author handle, GraphQL global ID, request origin과 API origin을 identity에 포함하지 않는다

#### Scenario: Local identity 안정성

- **WHEN** 같은 Local Post를 프로세스 재시작 뒤 또는 서로 다른 federation 요청 경로에서 다시 식별한다
- **THEN** 시스템은 항상 같은 Note URI를 반환한다
- **AND** identity를 만들기 위해 ActivityPub Post mapping row를 생성하거나 조회하지 않는다

#### Scenario: Remote Post identity 재사용

- **WHEN** Reply Parent 또는 후속 activity 대상이 materialized Remote Post다
- **THEN** 시스템은 기존 ActivityPub Post mapping에 저장된 remote object URI를 ActivityPub Post identity로 사용한다
- **AND** remote Post에 Local Note URI를 새로 부여하지 않는다

### Requirement: Local Note core serialization

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-341, PROD-494. 시스템은 제공 가능한 Local Post를 기존 canonical PostContent 계약을 재정의하지 않는 안전한 ActivityPub `Note`로 직렬화해야 한다(MUST).

#### Scenario: Local Note 기본 속성

- **WHEN** 제공 가능한 Content가 있는 Local Post를 Note로 직렬화한다
- **THEN** Note `id`는 Local Post의 ActivityPub identity다
- **AND** `attributedTo`는 Author Profile의 canonical ActivityPub actor URI다
- **AND** `published`는 immutable Post 생성 시각이다
- **AND** `url`은 configured Local Instance canonical origin에서 파생한 canonical Web Post 공유 참조다

#### Scenario: Existing canonical document HTML export

- **WHEN** PROD-341 validator가 수락한 canonical PostContent Document를 Note `content`로 직렬화한다
- **THEN** 시스템은 PROD-341 ProseMirror schema가 정의한 document 의미와 link 제약을 HTML로 export한다
- **AND** 이 capability는 node, mark, canonicalization, validation 또는 URL 허용 정책을 다시 정의하지 않는다
- **AND** canonical document 밖의 raw HTML을 export 입력으로 사용하지 않는다

#### Scenario: Content Warning projection

- **WHEN** canonical PostContent Document에 Content Warning summary가 있다
- **THEN** 시스템은 안전하게 escape한 summary를 Note `summary`로 제공한다
- **WHEN** Content Warning이 없다
- **THEN** 시스템은 의미 없는 빈 summary를 생성하지 않는다

#### Scenario: Deferred Note properties

- **WHEN** Local Post가 Media, Mention, custom emoji 또는 Quote Source 관계를 가진다
- **THEN** 시스템은 이번 Local Note 표현에 해당 속성이나 Quote 전용 federation 속성을 추가하지 않는다
- **AND** 지원되는 core Note identity, content, summary와 audience는 계속 제공한다

### Requirement: Local Note audience and dereference authorization

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. 시스템은 Post Visibility를 ActivityPub audience와 Note 역참조 권한으로 일관되게 투영해야 하며(MUST), 권한 있는 Followers Only 응답이 다른 requester에게 재사용되어 Post 존재나 내용을 노출하지 않게 해야 한다(MUST).

#### Scenario: Public Note audience

- **WHEN** Public Local Post를 Note로 직렬화한다
- **THEN** `to`는 ActivityStreams Public을 포함한다
- **AND** `cc`는 `/ap/actor/{authorProfileId}/followers` Author followers collection을 포함한다
- **AND** anonymous ActivityPub 역참조를 허용한다

#### Scenario: Unlisted Note audience

- **WHEN** Unlisted Local Post를 Note로 직렬화한다
- **THEN** `to`는 `/ap/actor/{authorProfileId}/followers` Author followers collection을 포함한다
- **AND** `cc`는 ActivityStreams Public을 포함한다
- **AND** anonymous ActivityPub 역참조를 허용한다

#### Scenario: Followers Only Note authorized fetch

- **WHEN** Followers Only Local Post의 Author 또는 Author와 established Follow 관계인 remote actor가 검증된 signed fetch를 수행한다
- **THEN** 시스템은 `to`에 `/ap/actor/{authorProfileId}/followers` Author followers collection만 포함한 Note를 반환한다
- **AND** `cc`에 ActivityStreams Public을 포함하지 않는다

#### Scenario: Followers Only Note unauthorized fetch

- **WHEN** anonymous, unknown actor 또는 Author의 established Follower가 아닌 actor가 Followers Only Local Post를 역참조한다
- **THEN** 시스템은 Post가 없는 것처럼 응답한다
- **AND** 응답 또는 shared cache를 통해 Post 존재, audience와 Content를 다른 requester에게 노출하지 않는다

#### Scenario: Mentioned Profiles Note 제외

- **WHEN** Mentioned Profiles Visibility의 Local Post를 역참조한다
- **THEN** 시스템은 Local Note를 제공하지 않는다
- **AND** recipient identity나 임의의 ActivityPub audience를 추정하지 않는다

### Requirement: Stable Reply inReplyTo identity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. 시스템은 Reply Parent 관계가 있는 Local Note에 Parent의 ActivityPub Post identity를 requester별 Parent 조회 가능성과 무관한 `inReplyTo`로 제공해야 한다(MUST). Parent의 실제 표현은 Parent 자체의 역참조 권한으로 보호해야 한다(MUST).

#### Scenario: Local Reply Parent identity

- **WHEN** Local Post를 직접 Parent로 참조하는 Reply Note를 직렬화한다
- **THEN** `inReplyTo`는 같은 `/ap/note/{parentPostId}` identity 규칙을 사용한다

#### Scenario: Remote Reply Parent identity

- **WHEN** materialized Remote Post를 직접 Parent로 참조하는 Reply Note를 직렬화한다
- **THEN** `inReplyTo`는 기존 ActivityPub Post mapping에 저장된 remote object URI를 사용한다

#### Scenario: Parent 접근 권한과 독립적인 identity

- **WHEN** requester가 Reply Note는 역참조할 수 있지만 Reply Parent의 실제 Note 표현은 역참조할 수 없다
- **THEN** Reply Note는 저장된 Parent identity를 `inReplyTo`로 계속 제공한다
- **AND** 시스템은 Parent Content 또는 audience를 Reply Note에 포함하지 않는다

#### Scenario: Tombstone Parent identity 유지

- **WHEN** Reply Parent가 Tombstone으로 전이됐지만 Reply Parent 관계가 저장되어 있다
- **THEN** Reply Note는 저장된 Parent identity를 `inReplyTo`로 계속 제공한다
- **AND** Parent URI의 실제 역참조 결과는 Parent lifecycle 계약에 따라 unavailable하다

#### Scenario: Reply Parent 관계 없음

- **WHEN** Reply Parent 관계가 없거나 Parent row의 물리 삭제로 관계가 `null`이다
- **THEN** Note는 `inReplyTo`를 제공하지 않는다
- **AND** Reply Note 자체의 제공 가능성은 Reply의 Visibility와 lifecycle로 독립 판정한다

### Requirement: Local Note unavailable lifecycle

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. 시스템은 Local Note 계약이 지원하지 않거나 unavailable한 Post를 존재를 노출하지 않는 결과로 처리해야 한다(MUST).

#### Scenario: Missing or non-local Post

- **WHEN** `/ap/note/{postId}`가 missing Post 또는 configured Local Instance에 속하지 않은 Author의 Post를 가리킨다
- **THEN** 시스템은 Note를 제공하지 않는다
- **AND** remote object를 이 Local Note URI로 대신 반환하지 않는다

#### Scenario: Lifecycle or structure unavailable Post

- **WHEN** 대상 Post가 Tombstone이거나 current Content가 없는 contentless Repost다
- **THEN** 시스템은 Note를 제공하지 않는다
- **AND** Post 존재나 내부 구조를 구분해 노출하지 않는다

#### Scenario: Author or Instance unavailable Post

- **WHEN** Author Profile 또는 configured Local Instance가 canonical Post Eligibility를 충족하지 않는다
- **THEN** 시스템은 Note를 제공하지 않는다
- **AND** unavailable 원인을 federation 응답으로 구분해 노출하지 않는다

### Requirement: Local Note scope boundary

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. Local Note capability는 Post object identity와 역참조 표현만 제공하고 activity delivery lifecycle을 새로 열지 않아야 한다(MUST).

#### Scenario: Object dereference without activity delivery

- **WHEN** Local Note dispatcher와 공통 Post identity resolver가 제공된다
- **THEN** 시스템은 Reply `Create`/`Delete`, Repost `Announce`/`Undo`, Reaction `Like`/`EmojiReact`/`Undo` delivery를 이 변경에서 추가하지 않는다
- **AND** ActivityPub Tombstone과 Delete delivery를 이 변경에서 추가하지 않는다
- **AND** 후속 capability가 같은 Local/Remote Post identity를 재사용할 수 있게 한다
