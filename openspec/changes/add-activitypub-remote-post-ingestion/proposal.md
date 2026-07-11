## Why

remote ActivityPub profile을 저장하고 remote follow 관계를 만들 수 있어도, remote actor가 inbox로 전달한 게시글 activity는 아직 kosmo `Post`로 읽을 수 없다. 이 변경은 Fedify inbox listener가 받은 지원 addressing의 top-level Note delivery를 materialize해 `Profile.posts`와 home timeline에서 기존 `Post` 모델로 보여주는 최소 read path를 연다.

## What Changes

- Fedify inbox listener가 전달한 `Create` activity의 단일 object를 Fedify vocabulary로 resolve하고, 지원하는 addressing의 top-level `Note`이면 kosmo `Post`/`PostContent`로 materialize한다.
- ActivityPub object URI를 unique identity로 저장해 같은 remote Note를 중복 `Post`로 만들지 않는다.
- 같은 object URI가 같은 remote actor에서 다시 전달되면 기존 `Post`를 재사용하고 content를 갱신하되 최초 visibility와 `Post.createdAt`은 수정하지 않는다.
- 같은 object URI의 동시 재전달은 object mapping 갱신을 직렬화해 동일 canonical content revision을 중복 생성하지 않는다.
- inbound activity actor가 저장되지 않았으면 object hydration 전에 remote-follow의 Fedify WebFinger/self-link 검증 경계로 actor를 materialize하고, inbound activity actor와 Note author가 그 remote profile과 일치할 때만 저장한다.
- 저장된 stale actor의 inbox Note ingestion은 부모 remote actor refresh 일반 규칙의 명시적 예외로 두고 profile refresh를 예약하거나 수행하지 않는다.
- Note `toIds`의 author followers collection과 mention actor URI를 사용해 `FOLLOWERS`/`DIRECT`를 포함한 visibility를 판정하고, mention actor는 best-effort WebFinger/materialization 뒤 공통 `post_mention` 관계로 저장한다.
- public/unlisted Note는 local recipient 없이 저장하고, followers/direct Note는 접근 가능한 active local follower 또는 mentioned Profile이 있을 때만 저장한다.
- shared inbox로 온 `Create`도 actor, attribution, addressing, local relevance와 top-level 검증을 통과하면 저장 대상이다.
- remote Note content를 media type에 따라 TipTap JSON과 plain text로 projection하고, Fedify `LanguageString`은 locale을 저장하지 않고 문자열 값만 사용한다. remote HTML 원본은 저장하지 않으며 content가 없는 Note도 빈 본문으로 저장한다.
- Note `published`가 미래이거나 없으면 최초 `Post.createdAt`에 수신 시각을 사용하고, 미래 원본 값은 object mapping에 보존하며 기존 connection ordering에는 영향을 주지 않는다.
- remote `Profile.posts`가 더 이상 빈 connection이 아니며 materialized remote posts를 기존 `Post.id` 기반 최신순 Relay connection으로 반환한다.
- home timeline은 established `ProfileFollow`로 팔로우 중인 remote followee에서 viewer가 볼 수 있는 materialized posts를 포함하되 non-followee mention만으로 후보를 확장하지 않는다.
- remote actor outbox traversal/backfill은 이번 change에서 다루지 않는다. durable/shared Fedify KV backend 교체나 activity ID의 별도 DB 저장, unknown actor/mention lookup 스팸 제한, 복수 `Create.object`, reply/thread reconstruction, `bto`/`bcc`와 임의 collection addressing, duplicate Create의 visibility/mention 변경, `Update(Note)`/`Delete(Note)`, attachment/media 저장 또는 proxy, boost/announce/like, mention notification, local compose mention, Note content warning projection은 후속 변경으로 남긴다.

## Capabilities

### New Capabilities

- `activitypub-remote-post-ingestion`: Fedify 기반 inbox Note delivery와 kosmo `Post` materialization 경계를 다룬다.

### Modified Capabilities

- `activitypub-actor-discovery`: actor-scoped inbox와 shared inbox가 verified `Create` delivery도 Fedify listener로 받아 post ingestion handler로 위임하도록 discovery 404 경계를 좁힌다.
- `activitypub-remote-profile-federation`: verified inbound actor URI의 WebFinger-backed materialization, actor followers collection URI projection과 stale actor refresh 예외를 추가한다.
- `data-model`: ActivityPub object URI와 kosmo `Post` row 연결, actor followers URI와 공통 `post_mention` 저장 요구사항을 추가한다.
- `post`: mention recipient를 포함한 공통 Post visibility와 remote profile의 `Profile.posts`/home timeline materialized remote post 반환 계약을 확장한다.

## Impact

- Depends on the merged `add-activitypub-remote-profile-federation` foundation and benefits from the merged `add-activitypub-remote-follow` inbox wiring and home timeline contract.
- `packages/fedify`: actor-scoped inbox와 shared inbox에서 Fedify inbox listener가 verified typed `Create`를 post materialization handler에 전달하고, handler는 `ctx.lookupWebFinger()`와 기존 actor materialization을 재사용하며 Fedify vocabulary hydration으로 embedded 또는 IRI-only 단일 object를 resolve한다. 별도 HTTP fetch/parsing 경계는 추가하지 않는다.
- `packages/core/db`: ActivityPub actor followers URI, object mapping, `post_mention`과 remote post materialization 저장 경계를 추가한다.
- `apps/api`: origin 공통 `Post` visibility 경계에 mention recipient와 suspended remote instance 조건을 추가하고 기존 `Profile.posts`와 `homeTimeline` resolver가 materialized remote posts를 그대로 읽는지 검증한다.
