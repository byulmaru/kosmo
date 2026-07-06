## Context

`add-activitypub-remote-profile-federation`은 remote actor를 kosmo `Profile`로 materialize하고 DB-only 조회를 제공한다. 이 change는 그 foundation 위에서 local/remote profile 사이의 follow graph를 ActivityPub Follow protocol과 연결한다.

## Goals / Non-Goals

**Goals:**

- local profile이 remote profile을 follow/unfollow할 수 있게 한다.
- remote actor가 local actor를 Follow/Undo할 수 있게 한다.
- inbound Accept/Reject를 받아 outbound follow projection을 정리한다.
- `ProfileFollow`를 established follow graph의 source of truth로 유지하고 pending request는 `ProfileFollowRequest`에 둔다.
- Fedify inbox listener, signature/key verification, `sendActivity`, delivery queue/retry를 재사용한다.

**Non-Goals:**

- remote followers/following collection full mirror.
- remote post ingestion, timeline federation, mention/reply delivery.
- moderation/block/mute/domain allowlist 정책.
- user-facing follow request approval UI.

## Decisions

- **`ProfileFollow`는 established follow source of truth다.** local/remote 여부와 관계없이 성립된 follower/followee 방향은 `ProfileFollow`에 저장한다. Pending follow request는 #190의 `ProfileFollowRequest`에 저장하며, 원본 Follow activity id와 actor/object URI는 후속 Accept/Reject/Undo를 연결하기 위한 correlation metadata로만 둔다. Accept/Reject/Undo activity id의 durable history는 이번 도메인 테이블 범위가 아니다.
- **outbound delivery는 Fedify `sendActivity`를 사용한다.** kosmo는 `Follow`, `Undo(Follow)`, `Accept(Follow)` 또는 후속 승인 UX의 `Reject(Follow)` activity를 만들고 Fedify에 전달한다. retry/queue/signature는 Fedify 설정에 맡긴다. Follow activity id는 생성된 `ProfileFollow.id`에서 파생한 kosmo outbound Follow URI로 고정해 logical Follow마다 고유하게 만들고, Fedify `orderingKey`는 local follower actor URI와 remote followee actor URI pair에서 안정적으로 파생해 같은 pair의 모든 Follow/Undo(Follow)에 재사용한다.
- **inbound activity는 Fedify inbox listener에서 받는다.** HTTP signature verification, actor key fetch, request parsing은 Fedify에 맡기고, kosmo handler는 verified typed Follow/Undo/Accept/Reject만 처리한다.
- **Accept/Reject correlation은 actor/object 기준이다.** 저장된 outbound Follow id는 Undo(Follow) 구성과 transport retry에 사용하지만, inbound Accept/Reject가 반드시 같은 Follow id를 참조해야 하는 것은 아니다. `Accept.object` 또는 `Reject.object`가 embedded Follow이거나 Fedify가 안전하게 typed Follow로 제공한 object이면 그 actor/object를 검증한다. IRI-only object가 kosmo outbound Follow URI이면 `ProfileFollow.id`로 저장된 outbound Follow actor/object metadata를 조회해 검증한다. 두 경로 모두 actor/object를 확인할 수 없으면 follow graph/request side effect를 만들지 않는다.
- **unknown remote actor는 lookup 후 저장한다.** inbound follow protocol activity가 저장되지 않은 remote actor를 참조하면 actor URI만으로 `Profile`을 만들지 않고, actor URI host를 `acct:` domain으로 신뢰하지 않는다. Fedify WebFinger URL-resource lookup 또는 동등한 lookup으로 반환된 `acct:{handle}@{domain}` identity와 ActivityPub self link가 inbound activity actor URI를 검증할 때만 해당 `acct:` identity를 #182의 materialization 입력으로 사용한다. materialization write 전에는 해당 `acct:` domain의 existing instance 상태를 확인해 `SUSPENDED` 또는 `UNRESPONSIVE`이면 follow graph/request side effect를 만들지 않는다.
- **personal inbox recipient는 canonical actor URI로 해석한다.** Fedify `ctx.recipient`는 actor URI가 아니라 actor identifier이므로, personal inbox에서 제공되면 먼저 local actor/profile로 resolve하고 그 canonical actor URI를 activity object 또는 저장된 outbound Follow의 local follower actor URI와 비교한다. `ctx.recipient`가 없으면 shared inbox로 간주하고 actor/object correlation만으로 recipient를 검증한다.
- **remote target follow는 local stored `followPolicy`를 기준으로 낙관적으로 처리한다.** remote target의 stored `followPolicy`가 `OPEN`이면 kosmo DB에는 established `ProfileFollow`를 만들고 Follow를 발송한다. 이후 Accept는 idempotent하게 처리하고, Reject는 해당 projection을 제거한다. `APPROVAL_REQUIRED` local/remote target에 대한 request 생성은 후속 request flow로 남기며 이번 change에서는 conflict로 거부한다.
- **blocked remote instance에는 inbound side effect를 제한한다.** `SUSPENDED` remote actor의 inbound follow protocol activity는 follow graph/request를 갱신하지 않는다. `UNRESPONSIVE` remote actor의 inbound Follow처럼 outbound response가 필요한 처리는 graph/request 생성과 response delivery를 하지 않고, actor/object가 검증된 Accept/Reject/Undo(Follow)처럼 outbound delivery가 필요 없는 정리만 허용한다.
- **duplicate inbound Follow 응답은 현재 수신 Follow를 사용한다.** pending request 또는 established follow에 저장된 inbound Follow response metadata는 first-wins로 유지하지만, duplicate Follow에 대한 `Accept(Follow)`를 발송할 때의 object는 현재 검증을 통과한 수신 Follow object를 사용한다.
- **unresponsive instance에는 outbound follow delivery를 하지 않는다.** `UNRESPONSIVE` instance는 저장된 stale profile 조회만 허용하고 outbound federation을 억제하므로 remote follow mutation은 차단한다. 이미 존재하는 remote follow를 unfollow할 때는 local `ProfileFollow`를 제거하되 `Undo(Follow)`는 발송하지 않는다.
- **remote followers/following collection은 mirror하지 않는다.** remote profile의 full collection을 가져오지 않고, kosmo DB에 저장된 local/remote `ProfileFollow` 관계만 GraphQL follow graph에 반영한다.
- **remote follow graph count는 known graph 기준이다.** remote profile의 followers/following/count 필드는 nullable unsupported가 아니라 kosmo DB에 저장된 `ProfileFollow` 관계를 기준으로 반환하며, fediverse 전체 collection count로 해석하지 않는다.
- **unsupported inbox activity는 무시한다.** Follow graph에 필요한 activity 외에는 이번 change에서 listener를 두지 않거나 처리하지 않는다.

## Risks / Trade-offs

- **remote server별 follow handshake 차이** → `OPEN` remote target은 known graph UX를 위해 낙관적으로 established follow로 저장하고, Reject 수신 시 제거한다. 승인 필요 remote target의 outbound request UX는 후속 request flow로 남긴다.
- **delivery 성공과 local projection 불일치** → 원본 Follow correlation metadata, stable `orderingKey`, idempotent mutation 처리로 재시도를 안전하게 만든다.
- **follow request approval UX 부재** → `APPROVAL_REQUIRED` local profile에 대한 inbound Follow는 `ProfileFollowRequest`로 저장하고 Accept/Reject를 자동 발송하지 않는다. 승인/거절 UX와 그 결과 activity delivery는 후속 change로 남긴다.
- **remote collection 미러링 없음** → followers/following count는 kosmo가 아는 관계 기준이며 fediverse 전체 count가 아니다.

## Migration Plan

1. remote follow activity correlation metadata를 추가한다.
2. outbound follow/unfollow mutation이 remote target을 허용하도록 확장한다.
3. Fedify inbox listener를 Follow/Undo/Accept/Reject handler에 연결한다.
4. GraphQL follow graph resolver를 local/remote profile이 참여하는 관계로 확장한다.
