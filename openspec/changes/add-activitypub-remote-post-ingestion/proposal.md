## Why

remote ActivityPub profile을 저장하고 remote follow 관계를 만들 수 있어도, remote actor가 inbox로 전달한 게시글 activity는 아직 kosmo `Post`로 읽을 수 없다. 이 변경은 Fedify inbox listener가 받은 public Note delivery를 materialize해 `Profile.posts`와 home timeline에서 기존 `Post` 모델로 보여주는 최소 read path를 연다.

## What Changes

- Fedify inbox listener가 전달한 public top-level `Create(Note)`를 kosmo `Post`/`PostContent`로 materialize한다.
- ActivityPub object URI를 unique identity로 저장해 같은 remote Note를 중복 `Post`로 만들지 않는다.
- inbound activity actor와 Note author가 materialization 대상 remote profile과 일치할 때만 저장한다.
- remote Note content를 HTML, plain text projection, 단순 TipTap JSON projection으로 저장한다.
- remote `Profile.posts`가 더 이상 빈 connection이 아니며 materialized remote posts를 최신순 Relay connection으로 반환한다.
- home timeline은 established `ProfileFollow`로 팔로우 중인 remote followee에서 materialized된 public posts를 포함한다.
- remote actor outbox traversal/backfill은 이번 stack에서 다루지 않는다. reply/thread reconstruction, private/followers-only/direct addressing, media proxy, boost/announce/like는 후속 변경으로 남긴다.

## Capabilities

### New Capabilities

- `activitypub-remote-post-ingestion`: Fedify 기반 inbox Note delivery와 kosmo `Post` materialization 경계를 다룬다.

### Modified Capabilities

- `data-model`: ActivityPub object URI와 kosmo `Post` row 연결 저장 요구사항을 추가한다.
- `post`: remote profile의 `Profile.posts`와 home timeline materialized remote post 반환 계약을 확장한다.

## Impact

- Depends on `add-activitypub-remote-profile-federation` and benefits from `add-activitypub-remote-follow` for inbox wiring and home timeline inclusion.
- `packages/fedify`: Fedify inbox listener가 verified typed `Create(Note)`를 post materialization handler에 전달한다.
- `packages/core/db`: ActivityPub object mapping과 remote post materialization 저장 경계를 추가한다.
- `apps/api`: `Profile.posts`, `Post` visibility, `homeTimeline` resolver를 materialized remote posts와 정렬한다.
