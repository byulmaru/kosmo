## ADDED Requirements

### Requirement: Fedify inbox Create boundary

시스템은 actor-scoped inbox와 shared inbox의 verified typed `Create`를 Fedify listener에서 받아 delivery 시각과 Note materialization 입력을 만들어야 한다(MUST).

#### Scenario: Receive a Create delivery

- **WHEN** Fedify listener가 verified typed `Create`를 handler에 전달한다
- **THEN** 시스템은 handler 진입 시 `receivedAt`을 한 번 캡처한다
- **AND** `Create.id`가 있으면 Fedify global idempotency가 personal/shared inbox 간 조기 중복 제거에 사용할 수 있다
- **AND** 이 경우 같은 activity ID의 후속 delivery는 object URI와 무관하게 handler 전에 제거될 수 있다
- **AND** 시스템은 activity ID를 materialization input이나 PostgreSQL domain row로 저장하지 않는다

#### Scenario: Process a Create without an activity ID

- **WHEN** verified typed `Create`에 activity ID가 없지만 지원되는 단일 Note object URI가 있다
- **THEN** 시스템은 missing activity ID만으로 delivery를 거부하지 않는다
- **AND** durable duplicate 판정은 hydrated Note object URI의 unique mapping이 담당한다

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
- **THEN** 시스템은 Profile, object mapping, Post와 content side effect 없이 delivery를 skip한다

### Requirement: Remote Note projection handoff

시스템은 remote Note의 primitive content 입력을 PROD-259 projection에 전달하고 PROD-341 canonical PostContent 계약을 통과한 결과만 materialization에 사용해야 한다(MUST).

#### Scenario: Adapt Fedify content to projection input

- **WHEN** Note `content` 또는 `summary`가 `LanguageString`이다
- **THEN** Fedify adapter는 `.toString()`으로 문자열 값만 전달한다
- **AND** locale 또는 Fedify vocabulary type을 core projection에 전달하지 않는다
- **AND** content, media type과 summary를 검증 가능한 primitive input으로 전달한다

#### Scenario: Accept a canonical projection result

- **WHEN** PROD-259가 remote content를 projection한다
- **THEN** 시스템은 PROD-341 canonical PostContent validator가 수락한 document만 저장 입력으로 사용한다
- **AND** 이 capability는 document node schema, canonicalization, equality 또는 renderer를 다시 정의하지 않는다
- **AND** 일반 anchor만으로 Profile Mention identity나 relation을 만들지 않는다

### Requirement: Atomic first remote Post materialization

시스템은 최초 ActivityPub object mapping, Post와 PostContent side effect를 하나의 PostgreSQL transaction에서 처리해야 한다(MUST).

#### Scenario: Materialize the first object atomically

- **WHEN** valid materialization input의 Note object URI가 아직 저장되지 않았다
- **THEN** 시스템은 ActivityPub object mapping, ACTIVE Post, first PostContent와 `Post.currentContentId`를 같은 transaction에서 생성한다
- **AND** 하나의 write라도 실패하면 모든 row를 rollback해 같은 object를 재시도할 수 있게 한다

#### Scenario: Resolve a concurrent duplicate with the unique mapping

- **WHEN** 같은 object URI의 delivery가 동시에 최초 materialization을 시도한다
- **THEN** PostgreSQL unique object URI constraint가 하나의 transaction만 성공시킨다
- **AND** conflict loser는 자신이 만든 Post와 PostContent를 모두 rollback하고 duplicate no-op으로 종료한다
- **AND** 시스템은 recovery transaction이나 `FOR UPDATE` mapping lock을 만들지 않는다

#### Scenario: Keep duplicate Create first-write-wins

- **WHEN** 이미 mapping된 object URI의 `Create`가 다시 전달된다
- **THEN** 시스템은 기존 mapping, Post, PostContent, visibility와 timestamp를 변경하지 않는다
- **AND** duplicate `Create`로 새 revision을 만들지 않는다
- **AND** remote content 변경은 후속 `Update(Note)` 계약에 남긴다

### Requirement: Initial timestamp projection

시스템은 최초 materialization에서 delivery 시각과 remote published 시각의 역할을 구분해야 한다(MUST).

#### Scenario: Project initial delivery and published timestamps

- **WHEN** 유효한 Note published가 있다
- **THEN** 최초 `Post.createdAt`은 published와 receivedAt 중 이른 시각을 사용한다
- **WHEN** published가 없거나 유효하지 않다
- **THEN** 최초 `Post.createdAt`은 receivedAt을 사용한다
- **AND** mapping `receivedAt`과 first PostContent `createdAt`은 delivery receivedAt을 사용한다
- **AND** 미래 시각을 포함한 원본 published는 nullable mapping metadata로 보존한다
- **AND** duplicate delivery는 최초 timestamp를 덮어쓰지 않는다

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
