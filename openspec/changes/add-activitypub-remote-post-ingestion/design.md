## Context

remote profile foundation은 ActivityPub actor를 kosmo `Profile`로 저장하고 읽을 수 있게 한다. remote follow change는 local active profile이 remote profile을 follow할 수 있게 한다. 이 change는 그 다음 단계로 remote actor outbox의 public Note를 kosmo `Post`로 materialize해 읽기 경험을 제공한다.

## Goals / Non-Goals

**Goals:**

- remote profile의 outbox를 Fedify dereference/vocabulary API로 읽는다.
- public Note 또는 Create(Note)를 kosmo `Post`/`PostContent`로 materialize한다.
- ActivityPub object URI uniqueness로 중복 materialization을 막는다.
- remote `Profile.posts`와 home timeline에서 materialized remote posts를 반환한다.
- remote post visibility를 보수적으로 매핑한다.

**Non-Goals:**

- remote inbox post delivery, mentions, replies, thread reconstruction.
- Announce/boost, Like/reaction, bookmark.
- private/direct addressing의 완전한 해석.
- remote media file proxy, thumbnail, image cache.
- full outbox mirror 또는 background worker 기반 deep backfill.

## Decisions

- **Fedify dereference/vocabulary API를 사용한다.** outbox collection traversal, object dereference, typed ActivityPub object handling은 Fedify에 맡긴다. kosmo는 typed Note/Create(Note)를 `Post`로 projection한다.
- **ActivityPub object URI가 remote post identity다.** object URI를 unique로 저장하고, 다시 발견하면 기존 `Post`를 갱신한다. kosmo `Post.id`는 내부 GraphQL/DB identity로 유지한다.
- **public Note부터 materialize한다.** `as:Public` 대상이 명확한 Note는 `PUBLIC`으로 저장한다. follower collection 대상만 있고 public이 아니면 `FOLLOWERS`로 저장할 수 있다. addressing이 불분명하거나 private/direct 성격이면 저장하지 않는다.
- **PostContent는 projection이다.** remote HTML content는 `bodyHtml`에 둘 수 있고, plain text projection을 `bodyText`로 저장한다. `bodyJson`은 plain text 기반 단순 TipTap document로 채운다.
- **GraphQL 요청 중 shallow refresh를 허용한다.** `Profile.posts` 요청 시 materialized posts가 없거나 stale이면 outbox refresh를 시도할 수 있다. 실패하면 기존 materialized posts만 반환한다. deep pagination/backfill은 후속 worker 설계로 남긴다.
- **unresponsive instance에서는 outbox refresh를 하지 않는다.** `UNRESPONSIVE` instance는 outbound federation을 억제하므로 `Profile.posts`는 저장된 materialized posts만 stale-read로 반환하고 Fedify dereference를 시도하지 않는다.
- **home timeline은 materialized posts만 사용한다.** remote followee의 outbox를 home timeline 요청에서 깊게 fetch하지 않고, 이미 materialized된 posts를 local posts와 같은 visibility 규칙으로 섞는다.

## Risks / Trade-offs

- **GraphQL 요청 latency 증가** → `Profile.posts`에서만 shallow outbox refresh를 허용하고, 실패 시 기존 materialized posts로 응답한다.
- **remote private post 공개 위험** → public 판정이 명확한 Note만 저장하고 불분명한 addressing은 skip한다.
- **content projection 품질 한계** → HTML/plain text/단순 TipTap projection으로 시작하고 rich content fidelity는 후속 rendering 정책에서 확장한다.
- **home timeline completeness 한계** → materialized된 remote posts만 포함하고 outbox deep backfill은 후속 worker 설계로 남긴다.

## Migration Plan

1. ActivityPub object mapping 저장 경계를 추가한다.
2. remote Note materialization service를 추가한다.
3. `Profile.posts` resolver를 remote profile에서 materialized posts를 반환하도록 확장한다.
4. `homeTimeline` resolver가 accepted remote followee의 materialized posts를 포함할 수 있게 정렬한다.
