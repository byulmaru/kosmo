## ADDED Requirements

### Requirement: Fedify inbox Note ingestion boundary

시스템은 inbox로 전달되는 remote Note activity 처리에서 Fedify가 제공하는 inbox, signature, key, vocabulary 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for inbound Create delivery

- **WHEN** remote actor가 local actor inbox 또는 shared inbox로 `Create` activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed `Create` activity를 kosmo post materialization handler에 전달한다
- **AND** 시스템은 request parsing, HTTP signature verification, remote actor key verification, typed ActivityPub object parsing을 직접 구현하지 않는다
- **AND** 같은 activity ID의 재전달 skip은 Fedify inbox idempotency에 맡긴다
- **AND** materialization handler는 `Create.actorIds`와 `Create.objectIds`를 사용해 actor/profile/instance와 단일 object ID precondition을 추가 hydration 없이 검증한다
- **AND** precondition이 통과하면 handler는 `Create.getObject({ documentLoader: ctx.documentLoader })`로 embedded 또는 IRI-only object를 resolve한다
- **AND** embedded object와 IRI-only object는 같은 Fedify vocabulary hydration 경계를 사용하며, 시스템은 object dereference용 HTTP client나 ActivityPub parser를 직접 구현하지 않는다
- **AND** 시스템은 Fedify의 default `crossOrigin: "ignore"` 정책을 유지하고 `crossOrigin: "trust"`를 사용하지 않는다
- **AND** 시스템은 `Create.object` 외의 actor, attribution, addressing, reply property를 추가 hydrate하지 않고 Fedify ID accessor로 검증한다

### Requirement: Remote inbox Note ingestion

시스템은 inbox로 전달된 public top-level ActivityPub Note를 kosmo `Post`로 materialize해야 한다(MUST).

#### Scenario: Materialize public inbound remote notes

- **WHEN** Fedify inbox listener가 verified remote `Create` activity를 전달한다
- **THEN** 시스템은 `Create.actorIds`의 서로 다른 URL `.href`를 정규화해 정확히 하나인지 검증하고 해당 URI로 `activitypub_actor`를 조회한다
- **AND** 조회된 actor가 가리키는 remote `Profile.state`는 `ACTIVE`이고 해당 profile의 instance kind는 `ACTIVITYPUB`이어야 한다
- **AND** actor/profile/instance precondition이 통과한 뒤 시스템은 서로 다른 `Create.objectIds`의 URL `.href`가 정확히 하나인지 검증하고 해당 object를 Fedify vocabulary로 resolve한다
- **AND** resolved object는 object URI가 있는 `Note`여야 한다
- **AND** Note `attributionIds`의 서로 다른 URL `.href`를 정규화한 결과는 정확히 하나이고 `Create.actorIds`의 단일 URI와 일치해야 한다
- **AND** 시스템은 Note `toIds`에 `as:Public`이 있거나 `ccIds`에만 `as:Public`이 있으며 `replyTargetIds`가 비어 있는 top-level Note를 찾는다
- **AND** `toIds`에 `as:Public`이 있으면 `Post.visibility`를 `PUBLIC`으로 저장한다
- **AND** `toIds`에는 `as:Public`이 없고 `ccIds`에만 `as:Public`이 있으면 `Post.visibility`를 `UNLISTED`로 저장한다
- **AND** 시스템은 각 Note의 ActivityPub object URI를 unique identity로 저장한다
- **AND** 시스템은 Note `id.href`를 object URI로 저장하고 actor/object identity에 handle/domain 기반 별도 equality를 적용하지 않는다
- **AND** 시스템은 중복 object URI가 기존 object mapping의 작성 actor와 같은 remote actor에서 재전달된 경우 새 `Post`를 만들지 않고 기존 `Post`를 재사용한다
- **AND** canonical `bodyJson`의 구조가 변경되었으면 새 `PostContent` revision을 생성하고 `Post.currentContentId`를 교체하며, canonical `bodyJson`이 같으면 기존 `PostContent`를 재사용한다
- **AND** 중복 object URI 재전달은 기존 `Post.visibility`를 수정하지 않는다
- **AND** 중복 object URI 재전달은 최초 ActivityPub object mapping의 수신 시각과 원본 published 시각을 수정하지 않는다
- **AND** 중복 object URI 재전달은 기존 `Post.createdAt`을 수정하지 않는다
- **AND** 시스템은 materialized remote posts를 `Profile.posts` connection에서 반환할 수 있게 한다
- **AND** 시스템은 remote actor outbox를 조회하지 않는다

#### Scenario: Materialize public shared inbox Create Note

- **WHEN** Fedify shared inbox listener가 verified remote `Create` activity를 전달하고 Fedify가 단일 object를 `Note`로 resolve한다
- **THEN** 시스템은 local follow 관계, personal inbox recipient, 또는 local recipient 검증을 요구하지 않는다
- **AND** 저장된 ActivityPub remote profile 조회, actor attribution, public top-level Note 검증이 통과하면 해당 Note를 `Post`로 materialize한다

#### Scenario: Skip non-public or unsupported remote objects

- **WHEN** inbound object가 public top-level Note로 판정되지 않거나 Fedify object hydration이 실패하거나 resolved object가 Note가 아니다
- **THEN** 시스템은 해당 object를 `Post`로 materialize하지 않는다
- **AND** followers-only, private, direct addressing은 이번 capability에서 materialize하지 않는다
- **AND** 시스템은 reply/thread, update, delete, announce, like 처리를 후속 변경으로 남긴다
- **AND** 서로 다른 `Create.objectIds`가 복수이면 시스템은 어느 object도 hydrate하거나 materialize하지 않는다

#### Scenario: Skip Note with mismatched attribution

- **WHEN** inbound `Create.actorIds` 또는 resolved Note `attributionIds`의 서로 다른 URI가 정확히 하나가 아니거나, 두 URI와 materialized remote actor URI가 서로 일치하지 않는다
- **THEN** 시스템은 해당 Note를 `Post`로 materialize하지 않는다
- **AND** 기존 materialized `Post` 또는 ActivityPub object mapping을 갱신하지 않는다

#### Scenario: Skip duplicate Note URI from different actor

- **WHEN** inbound `Create`에서 resolved Note object URI가 이미 ActivityPub object mapping에 저장되어 있다
- **AND** 기존 object mapping의 `activityPubActorId`가 이번 delivery actor URI로 조회한 `activitypub_actor.id`와 다르다
- **THEN** 시스템은 해당 Note를 새 `Post`로 materialize하지 않는다
- **AND** 기존 `Post`, `PostContent`, ActivityPub object mapping을 갱신하지 않는다

#### Scenario: Guard inbound Note from blocked instance

- **WHEN** Fedify inbox listener가 verified remote `Create`를 전달하고 activity actor가 저장된 active ActivityPub remote `Profile`로 조회된다
- **THEN** 시스템은 remote actor의 instance 상태를 확인한다
- **AND** remote actor instance가 `SUSPENDED`이면 `Create.object`를 hydrate하지 않고 `Post`, `PostContent`, ActivityPub object mapping을 생성하거나 갱신하지 않는다
- **AND** remote actor instance가 `UNRESPONSIVE`이면 시스템은 accepted `Create.object`를 Fedify protocol boundary에서 hydrate할 수 있다
- **AND** known actor의 verified `Create` object가 `Note`로 resolve되면 시스템은 materialization eligibility와 관계없이 이를 inbound reachability signal로 보고 instance를 `ACTIVE`로 갱신한다
- **AND** 시스템은 attribution, public top-level, content projection 검증까지 통과한 Note만 `Post`로 materialize한다

#### Scenario: Skip Note from unknown actor

- **WHEN** inbound `Create`의 activity actor가 저장된 `ACTIVE` ActivityPub remote `Profile`로 조회되지 않거나 해당 profile의 instance kind가 `ACTIVITYPUB`이 아니다
- **THEN** 시스템은 해당 Note를 `Post`로 materialize하지 않는다
- **AND** 시스템은 추가 WebFinger discovery 또는 actor profile materialization을 시도하지 않는다
- **AND** 시스템은 `Create.object` hydration을 시도하지 않는다
- **AND** 이 조건은 Fedify가 inbox verification 과정에서 수행하는 actor key verification을 금지하지 않는다

#### Scenario: Use stale stored actor without profile refresh

- **WHEN** inbound `Create`의 activity actor가 저장된 active ActivityPub remote `Profile`로 조회되지만 `ActivityPubActor.lastFetchedAt`이 없거나 7일을 초과했다
- **THEN** 시스템은 저장된 actor와 profile row를 그대로 사용하고 remote actor materialization service를 호출하지 않는다
- **AND** 시스템은 WebFinger lookup 또는 actor profile refresh를 예약하거나 수행하지 않는다
- **AND** actor/profile/instance precondition이 통과하면 시스템은 stale 여부와 관계없이 accepted 단일 `Create.object`를 Fedify vocabulary로 hydrate할 수 있다
- **AND** Fedify inbox signature/key verification과 `Create.object` hydration은 actor profile refresh로 취급하지 않는다

#### Scenario: Project remote Note content

- **WHEN** 시스템이 remote Note를 `Post`로 materialize한다
- **THEN** 시스템은 Note 작성자를 remote profile로 저장한다
- **AND** 시스템은 새 `Post.state`를 `ACTIVE`로 저장한다
- **AND** Note `published`가 있고 해당 시각이 수신 시각보다 5분을 초과해 미래가 아니면 시스템은 해당 시각을 `Post.createdAt`으로 저장한다
- **AND** Note `published`가 있으면 시스템은 ActivityPub object mapping의 원본 published 시각으로도 저장한다
- **AND** 새 remote post 최초 저장 시 Note `published`가 없으면 시스템은 수신 시각을 `Post.createdAt` fallback으로 사용한다
- **AND** 새 remote post 최초 저장 시 Note `published`가 수신 시각보다 5분을 초과해 미래이면 시스템은 수신 시각을 `Post.createdAt` fallback으로 사용한다
- **AND** 새 remote post 최초 저장 시 Note `published`가 없으면 시스템은 ActivityPub object mapping의 원본 published 시각을 `null`로 저장한다
- **AND** 기존 object URI가 재전달되면 Note `published` 유무와 값에 관계없이 시스템은 기존 `Post.createdAt`을 유지한다
- **AND** 시스템은 최초 또는 변경 content revision의 `PostContent.createdAt`을 해당 delivery의 수신 시각으로 저장한다
- **AND** 시스템은 remote Note HTML 원본을 저장하지 않고 `PostContent.bodyHtml`을 `null`로 둔다
- **AND** Fedify가 제공한 primary Note `content`가 없으면 시스템은 빈 canonical TipTap document를 `bodyJson`으로 만들고 여기서 빈 `bodyText`를 추출해 저장한다
- **AND** content가 있으면 시스템은 Note `mediaType`의 parameter를 제외하고 type/subtype의 ASCII case를 정규화한 MIME essence로 판정한다
- **AND** content가 있고 Note `mediaType`이 없으면 시스템은 MIME essence를 ActivityStreams 기본인 `text/html`로 취급한다
- **AND** content의 MIME essence가 `text/html`이면 시스템은 `@kosmo/core/tiptap`의 server-side helper에서 `@tiptap/html` `generateJSON()`과 기존 `Document`/`Paragraph`/`Text` extensions로 TipTap document를 만든 뒤 정규화하고 trim된 `bodyText`를 추출한다
- **AND** content의 MIME essence가 `text/plain`이면 시스템은 기존 plain-text-to-TipTap helper로 canonical `bodyJson`을 만든 뒤 core TipTap helper로 trim된 `bodyText`를 추출한다
- **AND** content가 있고 Note `mediaType`이 malformed이거나 MIME essence가 그 외 값이면 시스템은 해당 Note를 materialize하지 않는다
- **AND** TipTap HTML 변환 또는 core document 정규화가 실패하면 시스템은 해당 Note를 materialize하지 않고 부분 row를 남기지 않는다
- **AND** Note attachment는 이번 capability에서 저장하지 않으며, content 없이 attachment만 있는 Note도 빈 본문의 `PostContent`로 materialize한다
- **AND** duplicate delivery의 revision 변경 여부는 canonical `bodyJson`의 structural equality로 결정하고 파생 `bodyText`는 별도로 비교하지 않는다

#### Scenario: Return only materialized posts

- **WHEN** remote profile의 posts materialization이 없거나 저장된 materialized posts만 있다
- **THEN** 시스템은 GraphQL `Profile.posts` 요청 중 remote actor outbox refresh를 시도하지 않는다
- **AND** 시스템은 이미 materialized된 remote posts만 반환한다
- **AND** 저장된 materialized posts가 없으면 빈 connection을 반환한다
