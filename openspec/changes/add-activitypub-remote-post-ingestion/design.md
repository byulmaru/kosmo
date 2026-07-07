## Context

remote profile foundation은 ActivityPub actor를 kosmo `Profile`로 저장하고 읽을 수 있게 한다. remote follow change는 Fedify inbox listener와 follow graph를 연결한다. 이 change는 그 다음 단계로 inbox에 전달된 public Note activity를 kosmo `Post`로 materialize해 읽기 경험을 제공한다.

## Goals / Non-Goals

**Goals:**

- Fedify inbox listener가 검증해 전달한 public top-level `Create(Note)`를 처리한다.
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

## Decisions

- **Fedify inbox listener를 사용한다.** HTTP signature verification, actor key verification, request parsing, typed ActivityPub object handling은 Fedify에 맡긴다. kosmo는 verified typed `Create(Note)`를 `Post`로 projection한다.
- **actor-scoped inbox와 shared inbox가 같은 Note ingestion 경계다.** `activitypub-actor-discovery`의 unsupported endpoint 경계는 verified `Create(Note)` delivery를 Fedify listener로 통과시키고, post ingestion handler가 public top-level Note만 materialize한다.
- **ActivityPub object URI가 remote post identity다.** object URI를 unique로 저장하고, 같은 remote actor에서 다시 발견하면 기존 `Post`를 재사용하면서 content와 visibility를 갱신한다. 이미 저장된 object mapping의 actor가 이번 delivery actor와 다르면 기존 `Post`, `PostContent`, object mapping을 갱신하지 않는다. kosmo `Post.id`는 내부 GraphQL/DB identity로 유지한다.
- **actor attribution을 검증한다.** `Create.actor`가 있으면 activity를 보낸 remote actor URI와 일치해야 하며, Note `attributedTo`도 같은 remote actor URI를 가리켜야 한다. actor, attributedTo, Note object URI가 검증되지 않으면 저장하지 않는다.
- **unknown actor delivery는 저장하지 않는다.** public `Create(Note)`의 actor가 저장된 ActivityPub remote `Profile`로 조회되지 않으면 WebFinger lookup이나 actor materialization을 시도하지 않고 skip한다.
- **public top-level Note만 materialize한다.** `as:Public` 대상이 명확하고 `inReplyTo`가 없는 Note만 저장한다. `to`에 `as:Public`이 있으면 `PUBLIC`, `to`에는 없고 `cc`에만 `as:Public`이 있으면 `UNLISTED`로 저장한다. followers-only, private, direct, reply, addressing이 불분명한 Note는 저장하지 않는다.
- **shared inbox delivery도 public이면 저장한다.** shared inbox로 들어온 `Create(Note)`는 local follow 관계나 personal recipient 검증을 요구하지 않고, 저장된 remote actor, attribution, public top-level 검증이 통과하면 materialize한다.
- **published fallback은 최초 `Post.createdAt` projection에만 적용한다.** Note `published`가 있고 수신 시각보다 5분을 초과해 미래가 아니면 최초 materialization의 `Post.createdAt`으로 저장하고 ActivityPub object mapping에도 원본 published 시각을 저장한다. 새 remote post 최초 저장 시 `published`가 없거나 5분을 초과해 미래이면 수신 시각을 `Post.createdAt` fallback으로 사용하되, `published`가 없을 때 ActivityPub object mapping의 원본 published 시각은 `null`로 둔다. `published`가 과도하게 미래인 경우에도 원본 published 시각은 ActivityPub object mapping에 보존한다. 이후 같은 object URI가 재전달되면 `published` 유무와 값에 관계없이 기존 `Post.createdAt`을 유지한다.
- **PostContent는 projection이다.** remote HTML content는 `bodyHtml`에 둘 수 있고, plain text projection을 `bodyText`로 저장한다. `bodyJson`은 plain text 기반 단순 TipTap document로 채운다.
- **GraphQL 요청 중 remote fetch를 하지 않는다.** `Profile.posts` 요청은 이미 inbox에서 materialized된 posts만 반환한다. 저장된 materialized posts가 없으면 빈 connection을 반환한다.
- **기존 connection ordering/pagination 계약을 바꾸지 않는다.** remote `published`는 `Post.createdAt` projection에 반영하지만, 이번 PR은 `Profile.posts`와 `homeTimeline`의 정렬 primitive 또는 cursor tie-breaker를 새로 고정하지 않는다.
- **local compose 500자 제한을 remote inbox content에 그대로 재사용하지 않는다.** remote federation content는 저장, 렌더링, UX 정책을 별도로 결정해야 하므로 이번 PR에서는 content projection만 정의하고 길이 초과 처리 정책은 확정하지 않는다.
- **blocked instance의 inbound side effect를 제한한다.** `SUSPENDED` instance의 Note delivery는 저장하지 않는다. `UNRESPONSIVE` instance는 outbound federation 억제 상태이지만 inbound Note delivery 자체는 outbound response를 필요로 하지 않으므로, 저장된 active remote profile과 actor/object validation이 모두 통과하면 materialize할 수 있다.
- **SUSPENDED instance의 기존 materialized posts도 read path에서 숨긴다.** instance가 나중에 `SUSPENDED`로 바뀌면 새 delivery가 없어도 `Post` Node, remote `Profile.posts`, `homeTimeline`에서 해당 remote post를 반환하지 않는다.
- **home timeline은 materialized posts만 사용한다.** remote followee의 outbox를 home timeline 요청에서 깊게 fetch하지 않고, 이미 materialized된 posts를 local posts와 같은 visibility 규칙으로 섞는다.

## Risks / Trade-offs

- **전달되지 않은 과거 게시글 누락** → inbox로 전달된 Note만 materialize하고, outbox backfill로 보완하지 않는다.
- **remote private post 공개 위험** → public 판정이 명확한 Note만 저장하고 불분명한 addressing은 skip한다.
- **content projection 품질 한계** → HTML/plain text/단순 TipTap projection으로 시작하고 rich content fidelity는 후속 rendering 정책에서 확장한다.
- **home timeline completeness 한계** → materialized된 remote posts만 포함하고 outbox traversal은 범위 밖으로 둔다.

## Migration Plan

1. ActivityPub object mapping 저장 경계를 추가한다.
2. Fedify inbox Note delivery handler와 remote Note materialization service를 추가한다.
3. `Profile.posts` resolver를 remote profile에서 materialized posts를 반환하도록 확장한다.
4. `homeTimeline` resolver가 established `ProfileFollow`로 팔로우 중인 remote followee의 materialized posts를 포함하도록 정렬한다.
