## 1. Data Model

- [ ] 1.1 원본 remote Follow activity id, actor/object URI, Fedify `orderingKey`, inbound Follow response metadata를 `ProfileFollow` 또는 inbound `ProfileFollowRequest`에 연결할 수 있는 activity correlation metadata 저장 경계를 추가하고, Accept/Reject/Undo activity id durable history는 Fedify idempotency 또는 후속 activity log 범위로 둔다.
- [ ] 1.2 outbound Follow activity identity는 새 logical Follow마다 고유하게 만들고, Fedify `orderingKey`는 follower actor URI와 followee actor URI pair에서 안정적으로 파생해 같은 pair의 모든 outbound Follow/Undo(Follow)에 재사용하며, Fedify transport retry는 같은 identity를 재사용하게 하고, transport retry/queue 상태는 Fedify 경계에 두고 도메인 테이블에 중복 저장하지 않도록 저장 모델을 정렬한다.
- [ ] 1.3 #190의 상태 없는 `ProfileFollow`와 pending-only `ProfileFollowRequest` 구조에 맞춰 Drizzle table/relations/migration fixture를 갱신한다.

## 2. Fedify Follow Integration

- [ ] 2.1 remote target `followProfile`에서 target `followPolicy`가 `OPEN`이면 established `ProfileFollow`를 생성 또는 idempotent 반환하고, 새 관계일 때만 Fedify `sendActivity`로 `Follow` activity를 발송한다.
- [ ] 2.2 `followProfile`에서 target `followPolicy`가 `APPROVAL_REQUIRED`이면 후속 request flow 전까지 local/remote target 모두 conflict로 거부하고 `ProfileFollow`/`ProfileFollowRequest`/`Follow` activity를 만들지 않는다.
- [ ] 2.3 remote target `unfollowProfile`에서 established `ProfileFollow`를 제거하고 responsive instance에만 Fedify `sendActivity`로 저장된 원본 Follow를 object로 하는 `Undo(Follow)` activity를 follower/followee actor pair의 stable `orderingKey`로 발송한다.
- [ ] 2.4 remote target `unfollowProfile`의 idempotent 응답 또는 `UNRESPONSIVE` instance local 삭제는 ActivityPub `Undo(Follow)` activity를 발송하지 않는다.
- [ ] 2.5 Fedify inbox listener에서 follow protocol activity가 unknown remote actor를 참조하면 actor URI host를 `acct:` domain으로 신뢰하지 않고 Fedify/WebFinger lookup으로 federated handle과 canonical actor URI를 실제 검증한 뒤 #182 materialization 경로를 먼저 수행하며, canonical actor URI가 activity actor URI와 일치하지 않거나 lookup이 실패하면 follow graph/request를 갱신하지 않는다.
- [ ] 2.6 Fedify inbox listener에서 verified typed follow protocol activity를 받으면 remote actor instance를 확인하고, `SUSPENDED`이면 follow graph/request를 갱신하지 않으며, outbound response가 필요한 `UNRESPONSIVE` activity이면 graph/request를 갱신하지 않고 outbound response를 발송하지 않는다. 단, `UNRESPONSIVE` actor의 actor/object가 검증된 Accept/Reject/Undo(Follow)는 outbound 없이 기존 projection/request 정리만 허용한다.
- [ ] 2.7 Fedify inbox listener에서 verified typed remote `Follow`를 받아 `Follow.actor`가 materialized remote actor URI와 일치하고 `Follow.object`가 active local actor URI와 일치하며 personal inbox recipient가 있으면 그 recipient와도 일치하는지 검증한다.
- [ ] 2.8 Fedify inbox listener에서 2.6과 2.7의 검증을 통과한 remote `Follow`에 대해 existing established `ProfileFollow`가 있으면 request를 만들지 않고 idempotent하게 유지하며 같은 pair의 pending `ProfileFollowRequest`를 같은 transaction 안에서 삭제하고 Fedify `sendActivity`로 원본 Follow에 대한 `Accept(Follow)`를 발송한다.
- [ ] 2.9 Fedify inbox listener에서 2.6과 2.7의 검증을 통과한 remote `Follow`에 대해 existing established `ProfileFollow`가 없고 local follow policy가 `OPEN`이면 established `ProfileFollow`를 만들고 같은 pair의 pending `ProfileFollowRequest`를 같은 transaction 안에서 삭제한 뒤 Fedify `sendActivity`로 원본 Follow에 대한 `Accept(Follow)`를 발송한다.
- [ ] 2.10 Fedify inbox listener에서 2.6과 2.7의 검증을 통과한 remote `Follow`에 대해 existing established `ProfileFollow`가 없고 local follow policy가 `APPROVAL_REQUIRED`이면 pending `ProfileFollowRequest`로 저장하되, 기존 request가 있으면 first wins로 기존 inbound Follow response metadata를 유지하고 이번 change에서는 Accept/Reject를 자동 발송하지 않는다.
- [ ] 2.11 Fedify inbox listener에서 2.6의 검증을 통과한 verified typed remote `Undo(Follow)`를 받아 actor/object가 일치하고 personal inbox recipient가 있으면 undo 대상 Follow object local actor와도 일치할 때 existing `ProfileFollow` 또는 `ProfileFollowRequest`를 idempotent하게 제거하며, 저장된 inbound Follow id가 다르거나 object id가 없어도 verified same actor/object이면 취소 의사로 처리한다.
- [ ] 2.12 Fedify inbox listener에서 2.6의 검증을 통과한 verified typed remote `Accept`를 받아 actor/object가 저장된 outbound Follow와 일치하고 personal inbox recipient가 있으면 저장된 outbound Follow의 local follower actor와도 일치할 때 optimistic established `ProfileFollow` projection을 idempotent하게 유지하며, 이번 change에서는 outbound pending request를 승격하지 않는다.
- [ ] 2.13 Fedify inbox listener에서 2.6의 검증을 통과한 verified typed remote `Reject`를 받아 actor/object가 저장된 outbound Follow와 일치하고 personal inbox recipient가 있으면 저장된 outbound Follow의 local follower actor와도 일치할 때 optimistic established `ProfileFollow` projection을 삭제하고 rejected 상태를 저장하지 않는다.
- [ ] 2.14 follow 관련 activity 외 Fedify inbox listener activity는 무시하고 기존 federation route와 `/graphql` proxy가 섞이지 않는지 확인한다.

## 3. GraphQL Profile Follow API

- [ ] 3.1 `followProfile`과 `unfollowProfile`이 active remote profile target을 지원하도록 확장한다.
- [ ] 3.2 remote profile의 `followers`, `following`, `followersCount`, `followingCount`가 nullable unsupported가 아니라 저장된 local/remote `ProfileFollow` 기준 known graph를 반환하도록 확장한다.
- [ ] 3.3 `viewerFollow`가 local target과 remote target 모두에서 현재 active profile의 `ProfileFollow` 관계를 반환하도록 loader와 테스트를 갱신한다.
- [ ] 3.4 GraphQL schema를 재생성하고 remote known follow graph/count와 remote follow mutation contract를 확인한다.

## 4. Verification

- [ ] 4.1 ActivityPub follow test로 Fedify `sendActivity` outbound Follow/Undo/Accept, follow/unfollow/refollow에서 같은 actor pair stable `orderingKey`의 Follow/Undo 발송, Fedify inbox listener inbound Follow/Undo/Accept/Reject, unknown actor WebFinger lookup과 canonical actor URI 검증, actor/object 및 personal inbox recipient matching, active local actor 검증, unavailable remote actor guard, idempotent established inbound Follow, established 전환 시 pending request 삭제, duplicate pending inbound Follow first-wins metadata, established follow/request projection, unsupported inbox activity 무시를 검증한다.
- [ ] 4.2 GraphQL follow test로 remote target follow/unfollow, local/remote `APPROVAL_REQUIRED` target 거부, viewerFollow, remote known follow graph/count 응답, suspended instance target 차단, unresponsive instance follow 차단, unresponsive instance unfollow local 삭제와 outbound Follow/Undo 미발송을 검증한다.
- [ ] 4.3 `pnpm lint:eslint`, 관련 package typecheck/test, GraphQL schema check, `openspec validate add-activitypub-remote-follow --strict`를 실행한다.
