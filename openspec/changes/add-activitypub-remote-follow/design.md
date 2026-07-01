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

- **`ProfileFollow`는 established follow source of truth다.** local/remote 여부와 관계없이 성립된 follower/followee 방향은 `ProfileFollow`에 저장한다. Pending follow request는 #190의 `ProfileFollowRequest`에 저장하며, ActivityPub activity id는 후속 Accept/Reject/Undo를 연결하기 위한 correlation metadata로만 둔다.
- **outbound delivery는 Fedify `sendActivity`를 사용한다.** kosmo는 `Follow`, `Undo(Follow)`, `Accept(Follow)` 또는 후속 승인 UX의 `Reject(Follow)` activity를 만들고 Fedify에 전달한다. retry/queue/signature는 Fedify 설정에 맡긴다. 빠른 follow/unfollow에서도 순서가 보존되도록 같은 follow 관계의 Follow와 Undo(Follow)는 같은 Fedify `orderingKey`로 발송한다.
- **inbound activity는 Fedify inbox listener에서 받는다.** HTTP signature verification, actor key fetch, request parsing은 Fedify에 맡기고, kosmo handler는 verified typed Follow/Undo/Accept/Reject만 처리한다.
- **unknown remote actor는 lookup 후 저장한다.** inbound follow protocol activity가 저장되지 않은 remote actor를 참조하면 actor URI만으로 `Profile`을 만들지 않고, Fedify가 해석한 actor의 `preferredUsername`과 actor URI host로 candidate federated handle을 만든 뒤 #182의 Fedify/WebFinger lookup 기반 materialization 경로를 먼저 거친다. lookup 결과의 canonical actor URI가 inbound activity actor URI와 다르면 follow graph/request를 갱신하지 않는다.
- **remote target follow는 local stored `followPolicy`를 기준으로 낙관적으로 처리한다.** remote target의 stored `followPolicy`가 `OPEN`이면 kosmo DB에는 established `ProfileFollow`를 만들고 Follow를 발송한다. 이후 Accept는 idempotent하게 처리하고, Reject는 해당 projection을 제거한다. `APPROVAL_REQUIRED` local/remote target에 대한 request 생성은 후속 request flow로 남기며 이번 change에서는 conflict로 거부한다.
- **unresponsive instance에는 outbound follow delivery를 하지 않는다.** `UNRESPONSIVE` instance는 저장된 stale profile 조회만 허용하고 outbound federation을 억제하므로 remote follow mutation은 차단한다. 이미 존재하는 remote follow를 unfollow할 때는 local `ProfileFollow`를 제거하되 `Undo(Follow)`는 발송하지 않는다.
- **remote followers/following collection은 mirror하지 않는다.** remote profile의 full collection을 가져오지 않고, kosmo DB에 저장된 local/remote `ProfileFollow` 관계만 GraphQL follow graph에 반영한다.
- **remote follow graph count는 known graph 기준이다.** remote profile의 followers/following/count 필드는 nullable unsupported가 아니라 kosmo DB에 저장된 `ProfileFollow` 관계를 기준으로 반환하며, fediverse 전체 collection count로 해석하지 않는다.
- **unsupported inbox activity는 무시한다.** Follow graph에 필요한 activity 외에는 이번 change에서 listener를 두지 않거나 처리하지 않는다.

## Risks / Trade-offs

- **remote server별 follow handshake 차이** → `OPEN` remote target은 known graph UX를 위해 낙관적으로 established follow로 저장하고, Reject 수신 시 제거한다. 승인 필요 remote target의 outbound request UX는 후속 request flow로 남긴다.
- **delivery 성공과 local projection 불일치** → activity correlation metadata와 idempotent mutation 처리로 재시도를 안전하게 만든다.
- **follow request approval UX 부재** → `APPROVAL_REQUIRED` local profile에 대한 inbound Follow는 `ProfileFollowRequest`로 저장하고 Accept/Reject를 자동 발송하지 않는다. 승인/거절 UX와 그 결과 activity delivery는 후속 change로 남긴다.
- **remote collection 미러링 없음** → followers/following count는 kosmo가 아는 관계 기준이며 fediverse 전체 count가 아니다.

## Migration Plan

1. remote follow activity correlation metadata를 추가한다.
2. outbound follow/unfollow mutation이 remote target을 허용하도록 확장한다.
3. Fedify inbox listener를 Follow/Undo/Accept/Reject handler에 연결한다.
4. GraphQL follow graph resolver를 local/remote profile이 참여하는 관계로 확장한다.
