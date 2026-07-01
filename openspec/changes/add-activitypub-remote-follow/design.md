## Context

`add-activitypub-remote-profile-federation`은 remote actor를 kosmo `Profile`로 materialize하고 DB-only 조회를 제공한다. 이 change는 그 foundation 위에서 local/remote profile 사이의 follow graph를 ActivityPub Follow protocol과 연결한다.

## Goals / Non-Goals

**Goals:**

- local profile이 remote profile을 follow/unfollow할 수 있게 한다.
- remote actor가 local actor를 Follow/Undo할 수 있게 한다.
- inbound Accept/Reject를 받아 outbound follow state를 갱신한다.
- `ProfileFollow`를 kosmo follow graph의 source of truth로 유지한다.
- Fedify inbox listener, signature/key verification, `sendActivity`, delivery queue/retry를 재사용한다.

**Non-Goals:**

- remote followers/following collection full mirror.
- remote post ingestion, timeline federation, mention/reply delivery.
- moderation/block/mute/domain allowlist 정책.
- user-facing follow request approval UI.

## Decisions

- **`ProfileFollow`가 도메인 source of truth다.** local/remote 여부와 관계없이 follower/followee 방향은 기존 `ProfileFollow`에 저장한다. ActivityPub activity id는 상태 전이를 연결하기 위한 correlation metadata로만 둔다.
- **outbound delivery는 Fedify `sendActivity`를 사용한다.** kosmo는 `Follow` 또는 `Undo(Follow)` activity를 만들고 Fedify에 전달한다. retry/queue/signature는 Fedify 설정에 맡긴다.
- **inbound activity는 Fedify inbox listener에서 받는다.** HTTP signature verification, actor key fetch, request parsing은 Fedify에 맡기고, kosmo handler는 verified typed Follow/Undo/Accept/Reject만 처리한다.
- **remote target follow는 pending 가능성을 인정한다.** remote actor가 approval required이거나 Accept를 기다려야 하면 `PENDING`으로 저장한다. Accept를 받으면 `ACCEPTED`, Reject를 받으면 `REJECTED`로 갱신한다.
- **unresponsive instance에는 outbound follow delivery를 하지 않는다.** `UNRESPONSIVE` instance는 저장된 stale profile 조회만 허용하고 outbound federation을 억제하므로 remote follow/unfollow mutation은 대상이 차단된 것으로 처리하고 `Follow`/`Undo(Follow)`를 발송하지 않는다.
- **remote followers/following collection은 mirror하지 않는다.** remote profile의 full collection을 가져오지 않고, kosmo DB에 저장된 local/remote `ProfileFollow` 관계만 GraphQL follow graph에 반영한다.
- **remote follow graph count는 known graph 기준이다.** remote profile의 followers/following/count 필드는 nullable unsupported가 아니라 kosmo DB에 저장된 `ProfileFollow` 관계를 기준으로 반환하며, fediverse 전체 collection count로 해석하지 않는다.
- **remote follow 재요청은 새 Follow activity identity를 사용한다.** 기존 `REJECTED` 관계에 다시 follow를 요청하면 새 remote follow 시도로 전환하고, outbound Follow activity id는 시도마다 고유해야 한다.
- **unsupported inbox activity는 닫는다.** Follow graph에 필요한 activity 외에는 이번 change에서 처리하지 않는다.

## Risks / Trade-offs

- **remote server별 follow handshake 차이** → `PENDING`을 기본 안전 상태로 허용하고 Accept/Reject listener로 수렴한다.
- **delivery 성공과 관계 상태 불일치** → activity correlation metadata와 idempotent mutation 처리로 재시도를 안전하게 만든다.
- **follow request approval UX 부재** → `APPROVAL_REQUIRED` local profile에 대한 inbound Follow는 `PENDING`으로 저장하고 Accept/Reject를 자동 발송하지 않는다. 승인/거절 UX와 그 결과 activity delivery는 후속 change로 남긴다.
- **remote collection 미러링 없음** → followers/following count는 kosmo가 아는 관계 기준이며 fediverse 전체 count가 아니다.

## Migration Plan

1. remote follow activity correlation metadata를 추가한다.
2. outbound follow/unfollow mutation이 remote target을 허용하도록 확장한다.
3. Fedify inbox listener를 Follow/Undo/Accept/Reject handler에 연결한다.
4. GraphQL follow graph resolver를 local/remote profile이 참여하는 관계로 확장한다.
