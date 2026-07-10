## Context

remote profile foundation은 ActivityPub actor를 kosmo `Profile`로 저장하고 읽을 수 있게 한다. remote follow change는 Fedify inbox listener와 follow graph를 연결한다. 이 change는 그 다음 단계로 inbox에 전달된 public Note activity를 kosmo `Post`로 materialize해 읽기 경험을 제공한다.

## Goals / Non-Goals

**Goals:**

- Fedify inbox listener가 검증해 전달한 `Create`의 단일 object를 Fedify vocabulary로 resolve하고 public top-level Note이면 처리한다.
- public top-level Note를 kosmo `Post`/`PostContent`로 materialize한다.
- inbound activity actor와 Note author가 materialization 대상 remote actor와 일치하는지 검증한다.
- ActivityPub object URI uniqueness로 중복 materialization을 막는다.
- remote `Profile.posts`와 home timeline에서 materialized remote posts를 반환한다.
- remote post visibility를 보수적으로 매핑한다.

**Non-Goals:**

- remote actor outbox traversal, outbox refresh, full outbox mirror, background worker 기반 deep backfill.
- mentions, replies, thread reconstruction.
- Announce/boost, Like/reaction, bookmark.
- followers-only/private/direct addressing.
- remote media file proxy, thumbnail, image cache.
- `Update(Note)`, `Delete(Note)` 또는 Tombstone 처리.
- `Profile.posts`와 `homeTimeline`의 기존 connection ordering/pagination primitive를 `Post.createdAt DESC, Post.id DESC`로 재정의하는 일.
- remote Note 본문 길이 제한, truncate, 또는 길이 초과 rejection 정책 확정.
- remote Note `summary` 또는 `sensitive`를 `PostContent.spoilerText`로 projection하는 content warning 정책.
- 복수 `Create.object`의 hydration과 materialization.
- 같은 object URI가 duplicate `Create`로 재전달될 때 기존 `Post.visibility`를 변경하는 정책.

## Decisions

- **Fedify inbox listener와 vocabulary hydration을 사용한다.** HTTP signature verification, actor key verification, request parsing, typed ActivityPub object handling과 activity ID 기반 inbox idempotency는 Fedify에 맡긴다. kosmo는 `actorIds`/`objectIds`로 actor/profile/instance와 단일 object ID precondition을 먼저 검증한 뒤 `Create.getObject({ documentLoader: ctx.documentLoader })`로 embedded 또는 IRI-only object를 resolve한다. Fedify의 default `crossOrigin: "ignore"` 정책을 유지해 신뢰할 수 없는 cross-origin embedded object는 authoritative URI에서 다시 가져오며 `crossOrigin: "trust"`를 사용하지 않는다. object dereference용 HTTP client나 ActivityPub parser를 별도로 구현하지 않고 hydration 실패 또는 `Note`가 아닌 결과는 skip한다. 이 change가 명시적으로 hydrate하는 property는 `Create.object` 하나뿐이며 attribution, addressing, reply 판정은 `attributionIds`, `toIds`, `ccIds`, `replyTargetIds`를 사용한다.
- **actor-scoped inbox와 shared inbox가 같은 Note ingestion 경계다.** `activitypub-actor-discovery`의 unsupported endpoint 경계는 verified `Create` delivery를 Fedify listener로 통과시키고, post ingestion handler가 Fedify로 resolve한 단일 public top-level Note만 materialize한다.
- **ActivityPub object URI가 remote post identity다.** Fedify URL의 `.href` 문자열을 actor/object URI 저장과 exact equality 비교에 사용하고 handle/domain 기반 별도 동일성 추론은 하지 않는다. object URI를 unique로 저장하고, 서로 다른 activity ID의 `Create`에서 같은 remote actor와 object URI가 다시 발견되면 기존 `Post`를 재사용하면서 content만 갱신한다. 최초 visibility, object mapping metadata와 `Post.createdAt`은 유지한다. 최초 `Post`, `PostContent`, object mapping 생성은 하나의 transaction으로 수행하고 object URI unique conflict가 발생하면 부분 생성 row를 남기지 않는다. 이미 저장된 object mapping의 `activityPubActorId`가 이번 delivery에서 URI로 조회한 `activitypub_actor.id`와 다르면 기존 `Post`, `PostContent`, object mapping을 갱신하지 않는다. kosmo `Post.id`는 내부 GraphQL/DB identity로 유지한다.
- **`activitypub_object`는 좁은 identity mapping이다.** `id`, object `uri`, `type`, `activityPubActorId`, `postId`, `receivedAt`, nullable `publishedAt`만 저장한다. ID에는 `TableDiscriminator.ActivityPubObjects`를 사용하고 Note에는 non-unique `ActivityPubObjectType.NOTE`를 저장한다. `uri`와 `postId`는 각각 unique이고, `activityPubActorId`는 `activitypub_actor.id`를 참조하는 non-unique indexed foreign key이다. actor URI를 mapping에 중복 저장하지 않는다.
- **actor attribution을 단일 URI로 검증한다.** Fedify는 missing activity actor와 signature/key owner 불일치를 listener 진입 전에 거부한다. kosmo handler는 `Create.actorIds`의 서로 다른 URI를 정규화해 정확히 하나만 허용하고, Note `attributionIds`의 서로 다른 URI도 정확히 하나만 허용한다. 두 URI는 서로 같아야 하며, 해당 URI의 `activitypub_actor`가 가리키는 remote `Profile.state`는 `ACTIVE`이고 그 instance kind는 `ACTIVITYPUB`이어야 한다. 이 조건이나 Note object URI가 검증되지 않으면 저장하지 않는다.
- **unknown actor delivery는 저장하지 않는다.** public `Create`의 actor가 저장된 active ActivityPub remote `Profile`로 조회되지 않으면 object hydration 전에 skip하고 WebFinger lookup이나 actor materialization을 시도하지 않는다. 저장된 actor가 stale이어도 Note ingestion은 DB row를 그대로 사용하고 remote actor materialization service나 profile refresh를 예약/수행하지 않는다. Fedify가 inbox signature와 actor key 검증 및 accepted `Create.object` hydration에 필요한 protocol fetch를 수행하는 것은 actor profile refresh와 구분해 허용한다.
- **public top-level Note만 materialize한다.** Note `toIds` 또는 `ccIds`에 `as:Public` 대상이 명확하고 `replyTargetIds`가 비어 있는 Note만 저장한다. `toIds`에 `as:Public`이 있으면 `PUBLIC`, `toIds`에는 없고 `ccIds`에만 `as:Public`이 있으면 `UNLISTED`로 저장한다. followers-only, private, direct, reply, addressing이 불분명한 Note는 저장하지 않는다.
- **shared inbox delivery도 public이면 저장한다.** shared inbox로 들어온 `Create`에서 Fedify가 resolve한 단일 Note는 local follow 관계나 personal recipient 검증을 요구하지 않고, 저장된 remote actor, attribution, public top-level 검증이 통과하면 materialize한다.
- **published fallback은 최초 `Post.createdAt` projection에만 적용한다.** Note `published`가 있고 수신 시각보다 5분을 초과해 미래가 아니면 최초 materialization의 `Post.createdAt`으로 저장하고 ActivityPub object mapping에도 원본 published 시각을 저장한다. 새 remote post 최초 저장 시 `published`가 없거나 5분을 초과해 미래이면 수신 시각을 `Post.createdAt` fallback으로 사용하되, `published`가 없을 때 ActivityPub object mapping의 원본 published 시각은 `null`로 둔다. `published`가 과도하게 미래인 경우에도 원본 published 시각은 ActivityPub object mapping에 보존한다. 이후 같은 object URI가 재전달되면 `published` 유무와 값에 관계없이 기존 `Post.createdAt`을 유지한다.
- **PostContent는 canonical TipTap revision projection이다.** 새 remote `Post`는 `ACTIVE`로 만들고, 최초 및 변경 revision의 `PostContent.createdAt`은 해당 delivery 수신 시각으로 둔다. primary Note `content`가 없으면 빈 TipTap document를 canonical `bodyJson`으로 만들고 여기서 빈 `bodyText`를 추출한다. content가 있으면 `mediaType`의 parameter와 ASCII case를 제외한 MIME essence를 판정하고, absent `mediaType`은 ActivityStreams 기본인 `text/html`로 취급한다. essence가 `text/html`이면 `@kosmo/core/tiptap`의 server-side HTML helper가 `@tiptap/html` `generateJSON()`과 기존 `Document`/`Paragraph`/`Text` extensions로 canonical `bodyJson`을 만든 뒤 `bodyText`를 추출한다. `text/plain`이면 기존 plain-text-to-TipTap helper로 canonical `bodyJson`을 만든 뒤 같은 core helper로 `bodyText`를 추출한다. malformed 또는 그 외 MIME essence, TipTap 변환 실패이면 Note를 skip한다. attachment는 이번 change에서 저장하지 않으므로 attachment-only Note도 빈 본문으로 materialize한다. remote HTML 원본은 저장하지 않고 `bodyHtml`은 `null`로 둔다. 같은 actor의 동일 object URI가 재전달되면 canonical `bodyJson`의 구조가 달라진 경우에만 새 `PostContent` revision을 만들고 `Post.currentContentId`를 교체한다. canonical `bodyJson`이 같으면 기존 revision을 재사용하며, 파생 `bodyText`는 독립적인 revision identity로 사용하지 않는다. current와 historical revision은 모두 GraphQL `PostContent` Node로 직접 조회할 수 있다. 직접 조회는 parent `Post.state = ACTIVE`와 parent visibility 및 작성자 profile/instance visibility를 요구하되, historical revision에는 `Post.currentContentId` 일치를 요구하지 않는다. 최초 object mapping의 수신 시각, 원본 published 시각, visibility와 기존 `Post.createdAt`은 재전달로 갱신하지 않는다.
- **GraphQL 요청 중 remote fetch를 하지 않는다.** `Profile.posts` 요청은 이미 inbox에서 materialized된 posts만 반환한다. 저장된 materialized posts가 없으면 빈 connection을 반환한다.
- **GraphQL post read path는 origin 공통 경계를 유지한다.** materialized remote post도 기존 `Post`, `Profile.posts`, `homeTimeline` resolver와 공통 visibility predicate를 사용한다. remote 전용 resolver 분기를 추가하지 않고 공통 visibility 경계에 remote instance 상태 조건만 추가한다.
- **기존 connection ordering/pagination 계약을 바꾸지 않는다.** remote `published`는 `Post.createdAt` projection에 반영하지만, 이번 PR은 `Profile.posts`와 `homeTimeline`의 정렬 primitive 또는 cursor tie-breaker를 새로 고정하지 않는다.
- **local compose 500자 제한을 remote inbox content에 그대로 재사용하지 않는다.** remote federation content는 저장, 렌더링, UX 정책을 별도로 결정해야 하므로 이번 PR에서는 content projection만 정의하고 길이 초과 처리 정책은 확정하지 않는다.
- **blocked instance의 inbound side effect를 제한한다.** `SUSPENDED` instance의 delivery는 `Create.object`를 hydrate하거나 저장하지 않는다. `UNRESPONSIVE` instance의 accepted `Create.object` protocol hydration은 허용하고, known actor의 verified `Create` object가 `Note`로 resolve되면 materialization eligibility와 별개인 reachability signal로 보고 instance를 `ACTIVE`로 갱신한다. `Post` materialization은 그 뒤 actor/object attribution, public top-level, content projection 검증을 모두 통과한 Note에만 수행한다.
- **SUSPENDED instance의 기존 materialized posts도 read path에서 숨긴다.** instance가 나중에 `SUSPENDED`로 바뀌면 새 delivery가 없어도 `Post` Node, `PostContent` Node 직접 조회, remote `Profile.posts`, `homeTimeline`에서 해당 remote post를 반환하지 않는다.
- **home timeline은 materialized posts만 사용한다.** remote followee의 outbox를 home timeline 요청에서 깊게 fetch하지 않고, 이미 materialized된 posts를 local posts와 같은 visibility 규칙으로 섞는다.

## Risks / Trade-offs

- **전달되지 않은 과거 게시글 누락** → inbox로 전달된 Note만 materialize하고, outbox backfill로 보완하지 않는다.
- **remote private post 공개 위험** → public 판정이 명확한 Note만 저장하고 불분명한 addressing은 skip한다.
- **content projection 품질 한계** → server-side TipTap parser가 지원하는 `Document`/`Paragraph`/`Text` 범위만 저장하고 remote HTML 원본과 attachment는 보존하지 않는다. rich content fidelity와 media 저장은 후속 정책에서 확장한다.
- **home timeline completeness 한계** → materialized된 remote posts만 포함하고 outbox traversal은 범위 밖으로 둔다.

## Migration Plan

1. ActivityPub object mapping 저장 경계를 추가한다.
2. Fedify inbox Note delivery handler와 remote Note materialization service를 추가한다.
3. origin 공통 Post visibility 경계에 remote instance 상태 필터를 추가하고 기존 `Profile.posts`가 materialized posts를 반환하는지 검증한다.
4. 기존 origin 공통 `homeTimeline`이 established `ProfileFollow`의 remote followee materialized posts를 별도 remote 분기 없이 포함하는지 검증한다.
