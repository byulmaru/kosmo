## 1. Data Model

- [ ] 1.1 remote Follow/Accept/Reject/Undo activity를 `ProfileFollow`에 연결할 수 있는 activity correlation metadata 저장 경계를 추가한다.
- [ ] 1.2 transport retry/queue 상태는 Fedify 경계에 두고 도메인 테이블에 중복 저장하지 않도록 저장 모델을 정렬한다.
- [ ] 1.3 새 저장 경계의 Drizzle table/relations/migration fixture를 갱신한다.

## 2. Fedify Follow Integration

- [ ] 2.1 remote target `followProfile`에서 `ProfileFollow`를 생성 또는 idempotent 반환하고, 새 remote follow 시도일 때만 Fedify `sendActivity`로 `Follow` activity를 발송한다.
- [ ] 2.2 remote target `unfollowProfile`에서 `ProfileFollow`를 제거 또는 idempotent 처리하고 Fedify `sendActivity`로 `Undo(Follow)` activity를 발송한다.
- [ ] 2.3 `REJECTED` remote follow 재요청은 새 outbound Follow activity identity를 가진 새 시도로 전환하고 unique 제약에 막히지 않도록 처리한다.
- [ ] 2.4 Fedify inbox listener에서 verified typed remote `Follow`를 받아 remote follower profile을 materialize하고 local follow policy에 따라 `ACCEPTED` 또는 `PENDING` 관계를 만든다.
- [ ] 2.5 `APPROVAL_REQUIRED` inbound Follow는 `PENDING`으로 저장하되 이번 change에서는 Accept/Reject를 자동 발송하지 않는 정책을 반영한다.
- [ ] 2.6 Fedify inbox listener에서 verified typed remote `Undo(Follow)`를 받아 actor/object가 일치하는 기존 remote follower 관계를 idempotent하게 제거한다.
- [ ] 2.7 Fedify inbox listener에서 verified typed remote `Accept`/`Reject`를 받아 actor/object가 저장된 outbound Follow와 일치할 때만 outbound remote follow 관계 상태를 `ACCEPTED` 또는 `REJECTED`로 갱신한다.
- [ ] 2.8 follow 관련 activity 외 Fedify inbox listener activity는 지원하지 않는 activity로 닫고 기존 federation route와 `/graphql` proxy가 섞이지 않는지 확인한다.

## 3. GraphQL Profile Follow API

- [ ] 3.1 `followProfile`과 `unfollowProfile`이 active remote profile target을 지원하도록 확장한다.
- [ ] 3.2 remote profile의 `followers`, `following`, `followersCount`, `followingCount`가 nullable unsupported가 아니라 저장된 local/remote `ProfileFollow` 기준 known graph를 반환하도록 확장한다.
- [ ] 3.3 `viewerFollow`가 local target과 remote target 모두에서 현재 active profile의 `ProfileFollow` 관계를 반환하도록 loader와 테스트를 갱신한다.
- [ ] 3.4 GraphQL schema를 재생성하고 remote known follow graph/count와 remote follow mutation contract를 확인한다.

## 4. Verification

- [ ] 4.1 ActivityPub follow test로 Fedify `sendActivity` outbound Follow/Undo, Fedify inbox listener inbound Follow/Undo/Accept/Reject, actor/object matching, idempotency, state transition, unsupported inbox activity 차단을 검증한다.
- [ ] 4.2 GraphQL follow test로 remote target follow/unfollow, rejected remote follow 재요청, viewerFollow, remote known follow graph/count 응답, suspended 또는 unresponsive instance target 차단과 outbound Follow/Undo 미발송을 검증한다.
- [ ] 4.3 `pnpm lint:eslint`, 관련 package typecheck/test, GraphQL schema check, `openspec validate add-activitypub-remote-follow --strict`를 실행한다.
