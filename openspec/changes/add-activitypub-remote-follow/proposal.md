## Why

remote ActivityPub actor가 kosmo `Profile`로 materialize되면, 다음 단계는 local profile과 remote profile 사이의 follow 관계를 실제 ActivityPub Follow protocol과 연결하는 것이다. 이 변경은 remote post ingestion 없이 follow graph와 inbox/outbox follow activity만 연다.

## What Changes

- local profile이 `followPolicy = OPEN`인 remote `Profile`을 follow/unfollow할 때 local `ProfileFollow` 관계와 ActivityPub Follow/Undo activity를 연결한다.
- remote actor가 local actor를 Follow/Undo하면 Fedify inbox listener가 전달한 typed activity를 `ProfileFollow` 관계 또는 `ProfileFollowRequest` 요청으로 materialize한다.
- remote Accept/Reject activity가 저장된 outbound Follow와 actor/object 기준으로 일치하면 optimistic follow projection을 유지하거나 삭제한다.
- remote `Profile`의 ActivityPub followers/following collection은 full mirror하지 않고, kosmo가 알고 있는 local `ProfileFollow` 관계만 GraphQL에서 노출·집계한다.
- transport delivery retry, HTTP signature/key verification, inbox parsing, `sendActivity`는 Fedify에 맡기고, kosmo는 established follow/request projection과 activity correlation만 저장한다.

## Capabilities

### New Capabilities

- `activitypub-remote-follow`: Fedify 기반 Follow/Accept/Reject/Undo activity 처리와 kosmo `ProfileFollow` projection 경계를 다룬다.

### Modified Capabilities

- `data-model`: remote follow activity correlation metadata와 inbound `ProfileFollowRequest` 연계 요구사항을 추가한다.
- `profile`: remote profile 대상 follow/unfollow, viewerFollow, viewerState follow, known follow graph visibility/count 계약을 확장한다.

## Impact

- Depends on `add-activitypub-remote-profile-federation`.
- `packages/fedify`: Fedify `sendActivity`와 inbox listener를 follow 도메인 handler에 연결한다.
- `packages/core/db`: outbound Follow activity identity와 inbound Follow correlation metadata를 `ProfileFollow` 또는 inbound `ProfileFollowRequest`와 연결할 수 있어야 한다.
- `apps/api`: remote target follow/unfollow와 viewerFollow/viewerState follow/follow graph resolver를 확장한다.
- `apps/web`: follow button/status가 `Profile.origin = ACTIVITYPUB`인 대상에서도 동작할 수 있다.
