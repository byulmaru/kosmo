## ADDED Requirements

### Requirement: Fedify inbox Note ingestion boundary

시스템은 inbox로 전달되는 remote Note activity 처리에서 Fedify가 제공하는 inbox, signature, key, WebFinger, lookup과 vocabulary 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for inbound Create delivery

- **WHEN** remote actor가 local actor inbox 또는 shared inbox로 `Create` activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed `Create` activity를 kosmo post materialization handler에 전달한다
- **AND** 시스템은 request parsing, HTTP signature verification, remote actor key verification, WebFinger, JSON-LD dereference 또는 typed ActivityPub object parsing을 직접 구현하지 않는다
- **AND** 같은 activity ID의 재전달 skip은 Fedify inbox idempotency에 맡긴다
- **AND** materialization handler는 `Create.actorIds`의 서로 다른 URL `.href`를 정확히 하나로 제한하고 해당 URI로 author Profile을 조회하거나 materialize한다
- **AND** author precondition이 통과한 뒤 서로 다른 `Create.objectIds`의 URL `.href`를 정확히 하나로 제한한다
- **AND** handler는 `Create.getObject({ documentLoader: ctx.documentLoader })`로 embedded 또는 IRI-only object를 같은 Fedify vocabulary 경계에서 resolve한다
- **AND** 시스템은 object dereference용 HTTP client나 ActivityPub parser를 직접 구현하지 않는다
- **AND** 시스템은 Fedify의 default `crossOrigin: "ignore"` 정책을 유지하고 `crossOrigin: "trust"`를 사용하지 않는다
- **AND** 시스템은 `Create.object` 외의 attribution, addressing, reply property를 추가 hydrate하지 않고 Fedify ID accessor로 검증한다

### Requirement: Remote inbox Note ingestion

시스템은 inbox로 전달된 지원 addressing의 top-level ActivityPub Note를 kosmo `Post`로 materialize해야 한다(MUST).

#### Scenario: Resolve remote author before object hydration

- **WHEN** Fedify inbox listener가 verified remote `Create` activity를 전달한다
- **THEN** 시스템은 `Create.actorIds`의 서로 다른 URL `.href` 문자열이 정확히 하나인지 검증한다
- **AND** actor URI가 저장된 active ActivityPub remote `Profile`로 조회되면 해당 Profile과 actor metadata를 사용한다
- **AND** actor URI가 저장된 ActivityPub actor로 조회되지 않으면 object hydration 전에 `activitypub-remote-profile-federation`의 verified inbound actor URI WebFinger/self-link 경계로 author를 materialize한다
- **AND** author lookup은 local recipient 또는 기존 follow 관계를 요구하지 않는다
- **AND** WebFinger 결과는 유효한 `acct:{handle}@{domain}` subject를 제공해야 하고, ActivityPub self link와 materialization 결과 actor URI는 inbound actor URI와 정확히 일치해야 한다
- **AND** lookup, self-link 검증 또는 materialization이 실패하면 시스템은 `Create.object`를 hydrate하거나 Post side effect를 만들지 않는다
- **AND** 성공적으로 materialize된 author Profile은 이후 Note 검증이 실패해도 유효한 remote Profile로 유지할 수 있다
- **AND** 최종 author `Profile.state`는 `ACTIVE`이고 instance kind는 `ACTIVITYPUB`이어야 한다

#### Scenario: Guard inbound author instance state

- **WHEN** verified inbound `Create`의 author가 속한 ActivityPub instance 상태를 확인한다
- **THEN** instance가 `SUSPENDED`이면 시스템은 author lookup, `Create.object` hydration, `Post`, `PostContent`, `post_mention`, ActivityPub object mapping 생성 또는 갱신을 수행하지 않는다
- **AND** instance가 `UNRESPONSIVE`이면 시스템은 verified inbound author activity를 reachability signal로 보고 instance를 `ACTIVE`로 갱신한 뒤 author materialization 또는 object hydration을 계속할 수 있다
- **AND** author가 아닌 mentioned actor의 instance는 이 reachability 전환을 적용하지 않는다

#### Scenario: Use stale stored author without profile refresh

- **WHEN** inbound `Create` author가 저장된 active ActivityPub remote `Profile`로 조회되지만 `ActivityPubActor.lastFetchedAt`이 없거나 7일을 초과했다
- **THEN** 시스템은 저장된 actor와 profile row를 그대로 사용하고 remote actor materialization service를 호출하지 않는다
- **AND** 시스템은 WebFinger lookup 또는 actor profile refresh를 예약하거나 수행하지 않는다
- **AND** stale 여부와 관계없이 accepted 단일 `Create.object`를 Fedify vocabulary로 hydrate할 수 있다
- **AND** Fedify inbox signature/key verification과 `Create.object` hydration은 actor profile refresh로 취급하지 않는다

#### Scenario: Resolve and validate a single top-level Note

- **WHEN** author/profile/instance precondition이 통과한다
- **THEN** 시스템은 서로 다른 `Create.objectIds`의 URL `.href`가 정확히 하나인지 검증하고 해당 object를 Fedify vocabulary로 resolve한다
- **AND** resolved object는 object URI가 있는 `Note`여야 한다
- **AND** Note `attributionIds`의 서로 다른 URL `.href`는 정확히 하나이고 `Create.actorIds`의 단일 URI 및 materialized author URI와 일치해야 한다
- **AND** Note `replyTargetIds`는 비어 있어야 한다
- **AND** 서로 다른 `Create.objectIds`가 복수이면 시스템은 어느 object도 hydrate하거나 materialize하지 않는다
- **AND** hydration 실패, non-Note object, missing object URI, mismatched attribution 또는 reply Note는 Post side effect 없이 skip한다

#### Scenario: Resolve Note mentions with best-effort actor lookup

- **WHEN** resolved Note의 기본 type, object URI, attribution과 top-level precondition이 통과한다
- **THEN** 시스템은 Note `toIds`에서 `as:Public`, author `followersUri`와 author URI를 제외한 서로 다른 actor URI를 mention 후보로 처리한다
- **AND** local actor URI는 해당 active local `Profile`, 저장된 remote actor URI는 해당 active ActivityPub remote `Profile`로 resolve한다
- **AND** 저장되지 않은 remote mention actor URI는 author와 같은 Fedify `ctx.lookupWebFinger(mentionActorUri)` URL-resource lookup, `acct:` subject와 ActivityPub self-link 검증을 거쳐 best-effort로 materialize한다
- **AND** 성공적으로 resolve된 local/remote Profile은 최초 Post materialization의 `post_mention` 관계로 저장한다
- **AND** 개별 mention의 lookup 실패, self-link 불일치, 비지원 actor 또는 `SUSPENDED`/`UNRESPONSIVE` instance는 해당 mention만 제외하고 Note 전체를 실패시키지 않는다
- **AND** 시스템은 `ccIds` actor URI를 이번 capability의 mention으로 저장하지 않는다
- **AND** 시스템은 unresolved mention raw URI를 별도 저장하지 않는다

#### Scenario: Classify supported Note visibility

- **WHEN** 시스템이 top-level Note의 visibility를 판정한다
- **THEN** `toIds`에 `as:Public`이 있으면 `Post.visibility = PUBLIC`이다
- **AND** `toIds`에 Public이 없고 `ccIds`에 `as:Public`이 있으면 `Post.visibility = UNLISTED`이다
- **AND** Public marker가 없고 author의 non-null `followersUri`가 `toIds`에 정확히 일치하면 `Post.visibility = FOLLOWERS`이다
- **AND** Public marker와 matching followers URI가 없고 Public/followers/author를 제외한 `toIds` mention 후보 URI가 하나 이상 있으면 `Post.visibility = DIRECT`이다
- **AND** `DIRECT` 판정은 개별 mention actor lookup 성공 여부와 분리하며 실제 `post_mention`에는 Profile로 resolve된 후보만 저장한다
- **AND** 이 판정은 `PUBLIC`, `UNLISTED`, `FOLLOWERS`, `DIRECT` 순서로 우선하며 mention actor URI가 함께 있어도 앞선 marker의 visibility를 덮어쓰지 않는다
- **AND** actor `followersUri`가 없거나 exact match하지 않으면 시스템은 actor URI path에서 followers collection을 추론하지 않는다

#### Scenario: Require local relevance for first followers and direct Note materialization

- **WHEN** 저장되지 않은 Note의 visibility가 `FOLLOWERS` 또는 `DIRECT`로 판정된다
- **THEN** `FOLLOWERS` Note는 author를 established `ProfileFollow`로 팔로우하는 active local Profile 또는 active local mentioned Profile이 하나 이상일 때만 최초 materialize한다
- **AND** `DIRECT` Note는 active local mentioned Profile이 하나 이상일 때만 최초 materialize한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 해당 recipient identifier를 active local Profile로 resolve하고 그 Profile이 해당 Note의 follower 또는 mention 접근 대상이어야 한다
- **AND** shared inbox에서는 `ctx.recipient`를 요구하지 않고 Note `toIds`와 DB의 established follow 관계로 같은 local relevance를 판정한다
- **AND** 접근 가능한 active local Profile이 하나도 없는 followers/direct Note는 materialize하지 않는다
- **AND** `PUBLIC`/`UNLISTED` Note는 local recipient 또는 follow 관계를 요구하지 않는다
- **AND** 이미 materialize된 같은 visibility의 Note가 재전달되면 새 addressing에 active local relevance가 남지 않았더라도 기존 local mention의 stale 접근을 제거하기 위한 `post_mention` 동기화를 수행할 수 있다

#### Scenario: Skip unsupported addressing or object type

- **WHEN** Note가 지원 visibility 중 하나로 판정되지 않거나 지원하지 않는 addressing/object 형태를 사용한다
- **THEN** 시스템은 해당 object를 `Post`로 materialize하지 않는다
- **AND** 시스템은 `bto`/`bcc`, author followers collection 이외의 임의 collection, `ccIds` actor mention, reply/thread, `Update`, `Delete`, `Announce`, `Like` 처리를 후속 변경으로 남긴다
- **AND** 시스템은 unsupported addressing을 Public 또는 followers collection으로 추정하지 않는다

#### Scenario: Materialize supported shared inbox Create Note

- **WHEN** Fedify shared inbox listener가 verified remote `Create`를 전달하고 단일 object가 지원 addressing의 top-level `Note`로 resolve된다
- **THEN** 새 `PUBLIC`/`UNLISTED` Note는 local recipient 검증 없이 최초 materialize할 수 있다
- **AND** 새 `FOLLOWERS`/`DIRECT` Note는 actor attribution, addressing과 local relevance 검증이 통과한 경우에만 최초 materialize한다
- **AND** 기존 same-visibility Note의 duplicate 처리에는 stale mention 접근 제거 계약을 적용한다

#### Scenario: Store a new materialized remote Note

- **WHEN** author, object, attribution, top-level, visibility, mention, local relevance와 content projection 검증이 모두 통과한다
- **THEN** 시스템은 Note author를 remote profile로 연결하고 새 `Post.state = ACTIVE`로 저장한다
- **AND** Note `id.href`를 unique ActivityPub object URI로 저장하고 actor/object identity에 handle/domain 기반 별도 equality를 적용하지 않는다
- **AND** 최초 `Post`, `PostContent`, `post_mention`, ActivityPub object mapping은 하나의 transaction으로 생성한다
- **AND** 시스템은 materialized remote Post를 공통 `Post` Node, `Profile.posts`와 home timeline read path에서 사용할 수 있게 한다
- **AND** 시스템은 remote actor outbox를 조회하지 않는다

#### Scenario: Reuse a duplicate Note from the same author

- **WHEN** 같은 remote actor의 기존 object URI가 서로 다른 activity ID의 `Create`에서 다시 전달된다
- **AND** incoming Note를 다시 판정한 visibility가 기존 `Post.visibility`와 같다
- **THEN** 시스템은 새 `Post`를 만들지 않고 기존 `Post`를 재사용한다
- **AND** canonical `bodyJson` 구조가 변경되었으면 새 `PostContent` revision을 생성하고 `Post.currentContentId`를 교체한다
- **AND** canonical `bodyJson`이 같으면 기존 `PostContent` revision을 재사용한다
- **AND** 시스템은 새 `toIds`에서 resolve된 Profile 집합과 일치하도록 `post_mention`을 추가 및 제거한다
- **AND** 새 Direct recipient 후보가 모두 resolve되지 않더라도 incoming resolved mention 집합이 비어 있으면 기존 `post_mention`을 모두 제거한다
- **AND** canonical `bodyJson`이 같고 resolved mention 집합만 달라졌으면 새 `PostContent` revision 없이 `post_mention`만 갱신한다
- **AND** 기존 `Post.visibility`, 최초 object mapping의 수신 시각과 원본 published 시각 및 기존 `Post.createdAt`을 수정하지 않는다

#### Scenario: Reject duplicate Note visibility changes

- **WHEN** 같은 remote actor의 기존 object URI가 서로 다른 activity ID의 `Create`에서 다시 전달된다
- **AND** incoming Note를 다시 판정한 visibility가 기존 `Post.visibility`와 다르다
- **THEN** 시스템은 기존 `Post.visibility`를 변경하지 않는다
- **AND** 시스템은 새 content를 기존 audience에 노출하지 않도록 `PostContent`, `Post.currentContentId`와 `post_mention`을 갱신하지 않는다
- **AND** 기존 ActivityPub object mapping의 수신 시각과 원본 published 시각 및 기존 `Post.createdAt`도 갱신하지 않는다

#### Scenario: Serialize duplicate Note content and mention updates

- **WHEN** 같은 remote actor와 object URI의 서로 다른 `Create` delivery가 동시에 처리된다
- **THEN** 시스템은 기존 object mapping 갱신을 transaction에서 수행하고 해당 `activitypub_object` row를 잠근 뒤 visibility, canonical `bodyJson`과 resolved mention 집합을 비교한다
- **AND** canonical `bodyJson`이 기존 revision과 같으면 시스템은 새 `PostContent`를 만들지 않고 기존 revision을 재사용한다
- **AND** 같은 canonical `bodyJson`으로 동시에 들어온 delivery는 동일한 revision을 중복 생성하거나 `Post.currentContentId`를 불필요하게 교체하지 않는다
- **AND** 각 accepted delivery의 content와 resolved mention 집합은 같은 transaction에서 함께 반영되어 서로 다른 delivery의 content와 mention이 섞이지 않는다
- **AND** transaction 실패 또는 object URI unique conflict는 부분 `Post`, `PostContent`, `post_mention`, ActivityPub object mapping row를 남기거나 기존 content/mention 집합을 부분 갱신하지 않는다

#### Scenario: Reject duplicate Note URI from different author

- **WHEN** resolved Note object URI가 이미 ActivityPub object mapping에 저장되어 있다
- **AND** 기존 mapping의 `activityPubActorId`가 이번 delivery author URI로 조회한 `activitypub_actor.id`와 다르다
- **THEN** 시스템은 새 `Post`를 만들거나 기존 `Post`, `PostContent`, `post_mention`, ActivityPub object mapping을 갱신하지 않는다

#### Scenario: Project remote Note timestamps and content

- **WHEN** 시스템이 remote Note를 `Post`로 최초 materialize한다
- **THEN** Note `published`가 있고 해당 시각이 수신 시각보다 미래가 아니면 시스템은 해당 시각을 `Post.createdAt`으로 저장한다
- **AND** Note `published`가 있으면 ActivityPub object mapping의 원본 `publishedAt`으로 저장한다
- **AND** Note `published`가 없거나 수신 시각보다 미래이면 시스템은 수신 시각을 `Post.createdAt` fallback으로 사용한다
- **AND** Note `published`가 없으면 ActivityPub object mapping의 `publishedAt`은 `null`이다
- **AND** Note `published`가 미래이면 원본 값은 ActivityPub object mapping의 `publishedAt`에 보존한다
- **AND** 기존 object URI 재전달에서는 Note `published` 유무와 값에 관계없이 기존 `Post.createdAt`을 유지한다
- **AND** 최초 또는 변경 content revision의 `PostContent.createdAt`은 해당 delivery 수신 시각이다
- **AND** remote Note HTML 원본은 저장하지 않고 `PostContent.bodyHtml = null`로 둔다
- **AND** Fedify의 primary `Note.content`가 없으면 빈 canonical TipTap document와 여기서 추출한 빈 `bodyText`를 저장한다
- **AND** 단일 `Note.content`가 `LanguageString`이면 `.toString()` 문자열 값만 projection하고 `LanguageString.locale`은 저장하거나 선호 언어 선택에 사용하지 않는다
- **AND** content가 있고 Note `mediaType`이 없으면 ActivityStreams 기본인 `text/html`로 취급한다
- **AND** content가 있으면 media type parameter를 제외하고 type/subtype의 ASCII case를 정규화한 MIME essence를 판정한다
- **AND** `text/html`은 `@kosmo/core/tiptap`의 server-side `@tiptap/html` `generateJSON()` helper와 기존 `Document`/`Paragraph`/`Text` extensions로 canonical `bodyJson`을 만든 뒤 trim된 `bodyText`를 추출한다
- **AND** `text/plain`은 기존 plain-text-to-TipTap helper로 canonical `bodyJson`을 만든 뒤 같은 core helper로 trim된 `bodyText`를 추출한다
- **AND** malformed/unsupported MIME essence 또는 TipTap 변환/정규화 실패는 Note를 materialize하지 않고 부분 row를 남기지 않는다
- **AND** attachment는 저장하지 않으며 content 없이 attachment만 있는 Note도 빈 본문으로 materialize한다
- **AND** duplicate delivery의 revision identity는 canonical `bodyJson` structural equality이고 파생 `bodyText`는 별도로 비교하지 않는다

#### Scenario: Return only materialized posts

- **WHEN** GraphQL client가 remote Profile의 posts 또는 home timeline을 조회한다
- **THEN** 시스템은 이미 inbox에서 materialized된 remote Posts만 반환한다
- **AND** GraphQL 요청 중 remote actor outbox 또는 remote Post를 fetch하지 않는다
- **AND** 저장된 materialized Post가 없으면 빈 connection을 반환한다
