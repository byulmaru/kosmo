## Context

`add-activitypub-remote-profile-federation`은 remote actor를 kosmo `Profile`로 materialize하고 DB-only 조회를 제공한다. 이 change는 그 foundation 위에서 local/remote profile 사이의 follow graph를 ActivityPub Follow protocol과 연결한다.

## Goals / Non-Goals

**Goals:**

- local profile이 remote profile을 follow/unfollow할 수 있게 한다.
- remote actor가 local actor를 Follow/Undo할 수 있게 한다.
- inbound Accept/Reject를 받아 outbound follow projection을 정리한다.
- `ProfileFollow`를 established follow graph의 source of truth로 유지하고 pending request는 `ProfileFollowRequest`에 둔다.
- Fedify inbox listener, signature/key verification, `sendActivity`를 재사용한다.

**Non-Goals:**

- remote followers/following collection full mirror.
- remote post ingestion, timeline federation, mention/reply delivery.
- moderation/block/mute/domain allowlist 정책.
- user-facing follow request approval UI.
- Fedify delivery queue/retry 설정과 운영 검증.

## Decisions

- **`ProfileFollow`는 established follow source of truth다.** local/remote 여부와 관계없이 성립된 follower/followee 방향은 `ProfileFollow`에 저장한다. Pending follow request는 #198로 archive된 `split-profile-follow-requests`의 `ProfileFollowRequest`에 저장하며, 원본 Follow activity id와 actor/object URI는 후속 Accept/Reject/Undo를 연결하기 위한 correlation metadata로만 둔다. Accept/Reject/Undo activity id의 durable history는 이번 도메인 테이블 범위가 아니다.
- **outbound delivery는 Fedify `sendActivity`를 사용한다.** kosmo는 `Follow`, `Undo(Follow)`, `Accept(Follow)` 또는 후속 승인 UX의 `Reject(Follow)` activity를 만들고 Fedify에 전달한다. Signature는 Fedify에 맡기며, delivery queue/retry 설정과 운영 검증은 후속 capability 범위로 둔다. Follow/Undo(Follow) delivery 실패는 이미 반영된 local `ProfileFollow` projection과 저장 count를 rollback하지 않는다. Follow activity id는 생성된 `ProfileFollow.id`에서 파생한 kosmo outbound Follow URI로 고정해 logical Follow마다 고유하게 만들고, Fedify `orderingKey`는 local follower actor URI와 remote followee actor URI pair에서 안정적으로 파생해 같은 pair의 모든 Follow/Undo(Follow)에 재사용한다.
- **inbound activity는 Fedify inbox listener에서 받는다.** HTTP signature verification, actor key fetch, request parsing은 Fedify에 맡기고, kosmo handler는 verified typed Follow/Undo/Accept/Reject만 처리한다.
- **follow protocol inbox endpoint는 discovery-only 404 경계를 대체한다.** actor document가 광고하는 actor-scoped inbox와 Fedify가 처리하는 shared inbox는 Follow/Undo/Accept/Reject delivery를 Fedify inbox listener로 받는다. `outbox`, followers/following collection, post delivery 같은 non-follow endpoint는 이 change에서 열지 않는다.
- **local actor key wire shape는 고정하되 직렬화는 Fedify에 맡긴다.** actor document의 RSA key는 Fedify `CryptographicKey`로 노출하고 ID는 `{actorUri}#main-key`, owner는 `{actorUri}`로 고정한다. Ed25519 key는 Fedify `Multikey`로 노출하고 ID는 `{actorUri}#ed25519-key`, controller는 `{actorUri}`로 고정한다. kosmo는 저장된 JWK를 `CryptoKey`로 import해 Fedify actor key-pairs dispatcher에 제공하고, PEM/Multibase/Multicodec/JSON-LD 표현과 signature key 사용은 Fedify vocabulary와 federation runtime에 맡긴다.
- **remote Follow id는 advisory이며 actor/object fallback을 유지한다.** kosmo가 발송하는 outbound Follow id는 Undo(Follow) 구성과 후속 Fedify transport retry에 사용하기 위해 `ProfileFollow.id`에서 안정적으로 파생하지만, 많은 ActivityPub 서버가 Follow id를 누락하거나 재사용하거나 embedded object에서 보존하지 않는다. 따라서 inbound `Accept`/`Reject`와 inbound `Undo(Follow)`는 id가 없거나 non-kosmo id이거나 저장된 remote Follow id와 달라도 actor/object 검증으로 대응시킬 수 있다. 다만 activity `published`가 현재 저장된 follow generation timestamp보다 오래된 것이 확인되면 stale activity로 보고 destructive side effect를 만들지 않는다. `published`가 없으면 수신 시각을 사용해 compatibility를 우선한다.
- **unknown remote actor는 local recipient 확인 후 lookup한다.** inbound `Follow`가 저장되지 않은 remote actor를 참조하더라도 `Follow.object`와 personal inbox recipient가 active local actor로 먼저 검증되어야 WebFinger/materialization을 시작한다. Actor URI만으로 `Profile`을 만들지 않고, actor URI host를 `acct:` domain으로 신뢰하지 않는다. Fedify WebFinger URL-resource lookup 또는 기존 Fedify-backed materialization lookup으로 반환된 `acct:{handle}@{domain}` identity와 ActivityPub self link가 inbound activity actor URI를 검증할 때만 해당 `acct:` identity를 #182의 materialization 입력으로 사용한다. materialization write 전에는 해당 `acct:` domain의 existing instance 상태를 확인해 `SUSPENDED`이면 follow graph/request side effect를 만들지 않는다. `UNRESPONSIVE` instance가 먼저 inbound follow protocol activity를 보내면 해당 instance를 `ACTIVE`로 되돌린 뒤 materialization과 follow 처리를 계속할 수 있다.
- **personal inbox recipient는 canonical actor URI로 해석한다.** Fedify `ctx.recipient`는 actor URI가 아니라 actor identifier이므로, personal inbox에서 제공되면 먼저 local actor/profile로 resolve하고 그 canonical actor URI를 activity object 또는 저장된 outbound Follow의 local follower actor URI와 비교한다. `ctx.recipient`가 없으면 shared inbox로 간주하고 actor/object correlation만으로 recipient를 검증한다.
- **remote target follow는 local stored `followPolicy`를 기준으로 낙관적으로 처리한다.** remote target의 stored `followPolicy`가 `OPEN`이면 kosmo DB에는 established `ProfileFollow`를 만들고 Follow를 발송한다. 이후 Accept는 idempotent하게 처리하고, Reject는 해당 projection을 제거한다. `APPROVAL_REQUIRED` local/remote target에 대한 request 생성은 후속 request flow로 남기며 이번 change에서는 conflict로 거부한다.
- **blocked remote instance에는 inbound side effect를 제한한다.** `SUSPENDED` remote actor의 inbound follow protocol activity는 follow graph/request를 갱신하지 않는다. `UNRESPONSIVE` remote actor가 inbound follow protocol activity를 보내면 해당 instance를 `ACTIVE`로 되돌린 뒤 `ACTIVE` instance와 같은 follow 처리를 적용한다.
- **duplicate inbound Follow 응답은 현재 수신 Follow를 사용하되 freshness timestamp는 단조 갱신한다.** pending request 또는 established follow에 저장된 inbound Follow response metadata는 first-wins로 유지하지만, duplicate Follow에 대한 `Accept(Follow)`를 발송할 때의 object는 현재 검증을 통과한 수신 Follow object를 사용한다. 또한 remote Follow id가 unreliable하므로, duplicate Follow를 검증하면 Undo freshness guard에만 쓰는 inbound follow generation timestamp는 수신 시각 또는 `published` 기반 timestamp가 현재 저장된 값보다 최신일 때만 갱신할 수 있다.
- **inbound Undo(Follow)는 actor/object와 freshness guard로 삭제한다.** remote actor가 Follow/Undo/Follow를 반복하면 늦게 도착한 이전 `Undo(Follow)`가 새 관계를 지울 수 있다. 하지만 Follow id를 strict하게 요구하면 id를 보존하지 않는 서버와 호환되지 않는다. 따라서 embedded/typed `Undo.object`의 actor/object와 recipient가 현재 관계/request와 일치하면 삭제할 수 있으며, `Undo.published`가 현재 inbound follow generation timestamp보다 오래된 것이 확인될 때만 side effect 없이 무시한다. IRI-only object는 이번 change에서 actor/object를 안전하게 확인하지 못하므로 계속 side effect 없이 무시한다.
- **SUSPENDED remote target의 기존 outbound follow는 local 삭제만 허용한다.** `SUSPENDED` instance의 remote profile은 GraphQL `Profile`로 노출하지 않고 신규 follow/idempotent lookup 대상에서도 숨기지만, active local profile이 이미 가진 `ProfileFollow`를 unfollow하면 row를 삭제할 수 있어야 한다. 이 경우 ActivityPub `Undo(Follow)`는 발송하지 않고, 대상 profile payload는 `null`일 수 있다.
- **`UNRESPONSIVE`는 follow API action을 차단하지 않는다.** `UNRESPONSIVE`는 ActivityPub outbound lookup/refresh/delivery를 억제하는 내부 federation 상태이며, GraphQL `followProfile`/`unfollowProfile` 대상 eligibility는 이 상태로 분기하지 않는다. API mutation은 local follow graph를 갱신하되, 대상 instance가 여전히 `UNRESPONSIVE`이면 outbound `Follow` 또는 `Undo(Follow)` delivery를 발송하지 않는다.
- **`UNRESPONSIVE` 중 suppressed outbound Follow의 재전송은 후속 범위다.** 이번 change는 durable delivery queue나 pending resend state를 도메인 테이블에 만들지 않는다. 따라서 `UNRESPONSIVE` 중 생성된 remote follow projection은 local-only일 수 있고, instance가 `ACTIVE`로 회복된 뒤 같은 follow mutation이 idempotent하게 재시도되어도 `Follow`를 재발송하지 않는다.
- **profile count는 저장 카운터다.** local/remote 여부와 관계없이 `Profile`은 followers/following count를 저장한다. GraphQL `followersCount`/`followingCount` resolver는 정상 조회 경로에서 `ProfileFollow` aggregate query를 수행하지 않고 저장된 profile count를 반환한다. Migration은 기존 established follow 관계에서 count를 backfill한다.
- **remote followers/following collection edge는 mirror하지 않는다.** remote profile의 full collection item/page는 저장하지 않고, GraphQL followers/following connection에는 kosmo DB에 저장된 local/remote `ProfileFollow` 관계만 반영한다. 다만 remote collection `totalItems` 성격의 count는 actor materialization/refresh 때 remote `Profile`의 저장 count로 반영한다.
- **count update source는 단순 best-effort다.** established `ProfileFollow`가 생성/삭제되면 follower profile의 following count와 followee profile의 followers count를 같은 transaction에서 증감한다. Remote actor materialization/refresh가 remote collection count를 확인하면 해당 remote `Profile`의 저장 count를 그 값으로 덮어쓸 수 있다. Baseline/delta 분리나 known edge deduplication 없이 마지막 side effect가 반영한 값을 사용한다.
- **follow mutation payload는 양쪽 최신 Profile을 방향이 드러나는 이름으로 반환한다.** `followProfile`과 `unfollowProfile`은 transaction이 끝난 뒤의 follower를 `followerProfile`, followee를 `followeeProfile`로 반환한다. 클라이언트는 두 node의 저장 count를 선택해 Relay normalized cache를 갱신하며, 모호한 `profile` alias나 별도 cache updater를 두지 않는다.
- **노출 불가 전환은 follow row를 보존하고 count만 조정한다.** profile을 `DISABLED`로 바꾸거나 remote instance를 `SUSPENDED`로 바꿀 때 관련 `ProfileFollow` row를 삭제하지 않고, 남은 active/visible 상대 profile의 저장 count에서 노출 불가 profile과의 관계를 제외한다. Remote instance가 `SUSPENDED`에서 `ACTIVE`로 돌아오면 preserved `ProfileFollow` row를 기준으로 count를 다시 증가시키거나 같은 결과가 되도록 재계산한다. Suspension 중 local unfollow로 삭제된 row는 복구 대상이 아니며 이미 count에서 제외된 관계를 다시 감산하지 않는다.
- **unsupported inbox activity는 무시한다.** Follow graph에 필요한 activity 외에는 이번 change에서 listener를 두지 않거나 처리하지 않는다.

## Risks / Trade-offs

- **remote server별 follow handshake 차이** → `OPEN` remote target은 known graph UX를 위해 낙관적으로 established follow로 저장하고, Reject 수신 시 제거한다. 승인 필요 remote target의 outbound request UX는 후속 request flow로 남긴다.
- **remote Follow id 비호환성** → Follow id가 누락/재사용되는 서버와의 호환성을 위해 actor/object fallback을 유지한다. `published`가 제공되는 stale Reject/Undo는 막을 수 있지만, `published` 없이 늦게 도착한 destructive activity는 현재 generation과 구분할 수 없으므로 compatibility를 우선해 처리할 수 있다.
- **delivery 성공과 local projection 불일치** → 원본 Follow correlation metadata, stable `orderingKey`, idempotent mutation 처리로 재시도를 안전하게 만든다.
- **follow request approval UX 부재** → `APPROVAL_REQUIRED` local profile에 대한 inbound Follow는 `ProfileFollowRequest`로 저장하고 Accept/Reject를 자동 발송하지 않는다. 승인/거절 UX와 그 결과 activity delivery는 후속 change로 남긴다.
- **stored count staleness** → 저장된 followers/following count는 best-effort 값이며 remote refresh, local follow mutation, inbound follow protocol의 순서에 따라 실시간 remote collection과 다를 수 있다. Connection edge는 여전히 kosmo가 아는 `ProfileFollow` 관계만 노출한다.

## Migration Plan

1. remote follow activity correlation metadata를 추가한다.
2. outbound follow/unfollow mutation이 remote target을 허용하도록 확장한다.
3. Fedify inbox listener를 Follow/Undo/Accept/Reject handler에 연결한다.
4. GraphQL follow graph resolver를 local/remote profile이 참여하는 관계로 확장한다.
