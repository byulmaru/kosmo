## ADDED Requirements

### Requirement: Fedify inbox Create boundary

시스템은 actor-scoped inbox와 shared inbox의 verified typed `Create`를 Fedify listener에서 받아 global activity identity와 delivery 시각을 materialization 경계에 전달해야 한다(MUST).

#### Scenario: Accept a globally identified Create delivery

- **WHEN** Fedify listener가 non-null URL `Create.id`를 가진 verified typed `Create`를 handler에 전달한다
- **THEN** 시스템은 `Create.id.href`를 actor, object, inbox route, recipient와 worker scope가 없는 global `activityId`로 사용한다
- **AND** handler 진입 시 `receivedAt`을 한 번 캡처해 같은 materialization input에 전달한다
- **AND** personal inbox와 shared inbox의 같은 `Create.id.href`는 같은 global key를 사용한다

#### Scenario: Reject Create without a usable identity

- **WHEN** verified typed `Create`의 `id`가 없거나 URL identity로 사용할 수 없다
- **THEN** 시스템은 object hydration, instance 상태 변경, receipt와 Post side effect 전에 delivery를 skip한다

#### Scenario: Use Fedify idempotency only as an early filter

- **WHEN** listener에 Fedify `withIdempotency("global")`이 설정된다
- **THEN** 시스템은 이를 같은 activity의 조기 중복 제거에 사용할 수 있다
- **AND** domain side effect 중복 방지의 source of truth는 PostgreSQL global receipt다
- **AND** 시스템은 Fedify KV 확인과 Post transaction 사이의 원자성을 요구하지 않는다

### Requirement: Known remote actor eligibility

시스템은 저장된 active ActivityPub actor와 Profile만 remote Note ingestion author로 허용해야 한다(MUST).

#### Scenario: Use a stored active actor without profile refresh

- **WHEN** `Create.actorIds`의 서로 다른 URL `.href`가 정확히 하나다
- **AND** 해당 URI가 저장된 `ActivityPubActor`, ACTIVE Profile과 ACTIVITYPUB Instance에 연결되어 있다
- **AND** Instance 상태가 ACTIVE 또는 UNRESPONSIVE다
- **THEN** 시스템은 저장된 identity를 author로 사용한다
- **AND** 시스템은 WebFinger, actor materialization 또는 actor profile refresh를 수행하지 않는다

#### Scenario: Reject an ineligible actor before hydration

- **WHEN** activity actor가 저장되지 않았거나 non-ActivityPub, inactive Profile 또는 SUSPENDED Instance에 속한다
- **OR** 서로 다른 actor URI가 없거나 둘 이상이다
- **THEN** 시스템은 object hydration과 remote profile network/write 없이 delivery를 skip한다

#### Scenario: Recover a verified unresponsive instance with compare-and-set

- **WHEN** 저장된 UNRESPONSIVE actor가 hydration과 attribution 검증을 통과한 지원 Note를 전달한다
- **THEN** 시스템은 `WHERE state = UNRESPONSIVE` 조건으로만 Instance를 ACTIVE로 복구할 수 있다
- **AND** concurrent SUSPENDED 전환을 덮어쓰지 않는다

### Requirement: Public top-level Note validation

시스템은 actor와 attribution이 일치하는 PUBLIC 또는 UNLISTED top-level `Note`만 materialization input으로 허용해야 한다(MUST).

#### Scenario: Hydrate a supported Note with Fedify vocabulary

- **WHEN** author eligibility가 통과하고 `Create.objectIds`의 서로 다른 URL `.href`가 정확히 하나다
- **THEN** 시스템은 `Create.getObject({ documentLoader })`로 embedded 또는 IRI-only object를 resolve한다
- **AND** custom HTTP fetch/parser를 만들지 않고 Fedify cross-origin 기본값을 유지한다
- **AND** resolved object는 object URI가 있는 `Note`이고 `Note.id.href`가 사전 검증한 object URI와 정확히 같아야 한다
- **AND** 서로 다른 attribution URI가 정확히 하나이고 activity actor URI와 같아야 한다
- **AND** reply target은 없어야 한다

#### Scenario: Project public addressing

- **WHEN** verified top-level Note의 `to`에 ActivityStreams Public URI가 있다
- **THEN** materialization visibility는 PUBLIC이다
- **WHEN** `to`에는 Public URI가 없고 `cc`에 Public URI가 있다
- **THEN** materialization visibility는 UNLISTED다
- **AND** shared inbox delivery는 local recipient 또는 follow relation을 추가 조건으로 요구하지 않는다

#### Scenario: Reject unsupported or ambiguous Note delivery

- **WHEN** object hydration이 실패하거나 object가 Note가 아니다
- **OR** hydrated Note ID, attribution 또는 top-level 조건이 맞지 않는다
- **OR** public marker가 없거나 addressing이 ambiguous하다
- **THEN** 시스템은 receipt, Profile, Post와 content side effect 없이 delivery를 skip한다

### Requirement: Canonical remote Note content projection

시스템은 remote Note content와 summary를 PROD-341의 versioned canonical PostContent document와 Plain Text Content Warning으로 projection해야 한다(MUST).

#### Scenario: Adapt Fedify content to primitive input

- **WHEN** Note `content` 또는 `summary`가 `LanguageString`이다
- **THEN** Fedify adapter는 `.toString()`으로 문자열 값만 전달한다
- **AND** locale 또는 Fedify vocabulary type을 core projection에 전달하지 않는다
- **AND** media type과 published 값은 검증 가능한 primitive input으로 전달한다

#### Scenario: Produce a canonical document

- **WHEN** PROD-259가 HTML, Plain Text 또는 absent content를 projection한다
- **THEN** 결과 body는 PROD-341의 versioned paragraph/text/hard_break/link ProseMirror schema로 검증·canonicalize된다
- **AND** Note summary는 nullable Plain Text Content Warning으로 projection된다
- **AND** raw HTML, executable markup/URL, image 또는 파생 Plain Text를 독립 canonical 값으로 저장하지 않는다
- **AND** content가 없거나 attachment-only인 Note는 canonical empty document를 사용할 수 있다

#### Scenario: Preserve safe general links without assigning Mention identity

- **WHEN** remote HTML에 검증된 absolute HTTP(S) anchor가 있다
- **THEN** 시스템은 표시 text와 목적지를 canonical link mark로 보존할 수 있다
- **AND** anchor만으로 Profile Mention identity 또는 relation을 만들지 않는다

### Requirement: Durable atomic remote Post materialization

시스템은 global receipt와 ActivityPub object mapping, Post와 PostContent side effect를 하나의 PostgreSQL transaction에서 처리해야 한다(MUST).

#### Scenario: Materialize the first delivery atomically

- **WHEN** valid materialization input의 global receipt claim이 `ON CONFLICT DO NOTHING ... RETURNING`으로 성공한다
- **THEN** 시스템은 receipt, ActivityPub object mapping, ACTIVE Post, first PostContent와 `Post.currentContentId`를 같은 transaction에서 생성한다
- **AND** 하나의 write라도 실패하면 모든 row를 rollback해 같은 activity를 재시도할 수 있게 한다

#### Scenario: Skip a duplicate global activity

- **WHEN** transaction 시작의 global receipt claim이 existing `activityId` 때문에 row를 반환하지 않는다
- **THEN** 시스템은 mapping, Post 또는 PostContent side effect 없이 duplicate 처리를 완료한다

#### Scenario: Recover an object URI race in a new transaction

- **WHEN** receipt claim 뒤 object URI insert가 해당 unique target conflict로 row를 반환하지 않는다
- **THEN** 시스템은 sentinel error로 현재 transaction 전체를 rollback한다
- **AND** aborted transaction 안에서 recovery query를 실행하지 않는다
- **AND** 새 transaction에서 receipt를 다시 claim하고 existing mapping을 `FOR UPDATE`로 잠가 actor와 revision을 검증한다
- **AND** 다른 unique violation을 object URI race로 정규화하지 않는다

#### Scenario: Preserve existing mapping ownership

- **WHEN** existing object URI mapping의 actor가 incoming actor와 다르거나 stored visibility와 incoming visibility가 다르다
- **THEN** 시스템은 기존 mapping, Post, PostContent와 visibility를 변경하지 않는다
- **AND** valid global activity receipt는 처리 완료로 남길 수 있다

### Requirement: Canonical revision and timestamp projection

시스템은 canonical document와 Content Warning의 의미 변화만 새 PostContent revision으로 저장하고 delivery/original timestamp 역할을 구분해야 한다(MUST).

#### Scenario: Create or reuse a content revision

- **WHEN** same actor existing mapping에 다른 global activity가 전달된다
- **THEN** 시스템은 같은 schema version의 canonical document structural equality와 nullable Content Warning equality를 비교한다
- **AND** 둘이 모두 같으면 기존 revision을 재사용한다
- **AND** 하나라도 다르면 새 PostContent를 만들고 `Post.currentContentId`를 같은 transaction에서 교체한다
- **AND** formatting-only HTML 또는 raw serialized JSON 문자열 차이만으로 revision을 만들지 않는다

#### Scenario: Project delivery and published timestamps

- **WHEN** Note published가 있고 `receivedAt + 5분` 이내다
- **THEN** 최초 `Post.createdAt`에 published를 사용할 수 있다
- **WHEN** published가 없거나 허용된 미래 범위를 넘는다
- **THEN** 최초 `Post.createdAt`은 receivedAt을 사용한다
- **AND** mapping receivedAt과 새 PostContent createdAt은 해당 delivery receivedAt을 사용한다
- **AND** 원본 published는 nullable mapping metadata로 보존하고 duplicate delivery가 최초 Post createdAt/visibility를 덮어쓰지 않는다

### Requirement: DB-only GraphQL read compatibility

시스템은 materialized remote Post를 기존 GraphQL Post authorization과 connection 계약으로만 조회해야 한다(MUST).

#### Scenario: Read stored remote Posts without federation fetch

- **WHEN** client가 remote `Post` Node, current/historical `PostContent`, `Profile.posts` 또는 `homeTimeline`을 조회한다
- **THEN** 시스템은 저장된 Profile/Post/PostContent만 사용한다
- **AND** remote actor outbox, object refresh 또는 backfill network 호출을 수행하지 않는다
- **AND** ActivityPub object mapping 존재를 read authorization prerequisite로 요구하지 않는다
- **AND** connection ordering/cursor는 기존 `Post.id DESC` 계약을 유지한다

#### Scenario: Reuse existing parent authorization

- **WHEN** 저장된 remote Post 또는 PostContent가 GraphQL에서 조회된다
- **THEN** 시스템은 기존 Post state/visibility와 author Profile/Instance authorization을 적용한다
- **AND** ACTIVE/UNRESPONSIVE author의 PUBLIC/UNLISTED stale read를 허용할 수 있다
- **AND** SUSPENDED Instance, inactive author Profile 또는 inactive Post의 current/historical content를 노출하지 않는다
- **AND** 공개 GraphQL schema나 별도 production read 구현을 추가하지 않는다
