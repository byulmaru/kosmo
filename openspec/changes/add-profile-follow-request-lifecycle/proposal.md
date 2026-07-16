## Why

`profile_follow_request`는 row 존재 자체가 Pending인 저장 계약을 갖고 있지만, local 요청 생성과 local/remote 요청이 공유할 조회·승인·거절·취소 lifecycle 및 GraphQL API가 아직 없다. PROD-323에서 정렬한 pending-only 계약을 실제 서비스 경계로 제공해 승인 필요 프로필을 정책 우회 없이 follow할 수 있게 해야 한다.

## What Changes

- Local `OPEN` 프로필 follow는 기존처럼 성립된 `ProfileFollow`를 생성하거나 반환하고, `APPROVAL_REQUIRED` 프로필 follow는 pending `ProfileFollowRequest`를 생성하거나 반환한다.
- Local/Remote request가 공유하는 pair 조회, 승인, 거절, 취소 core lifecycle을 제공한다. participant 가용성은 관계를 만드는 승인에서 검증하고, 거절·취소는 unavailable 상대가 있어도 pending row를 정리할 수 있게 한다.
- 승인 시 request 삭제, relation 생성과 저장 follow count 갱신을 하나의 transaction으로 처리하고 caller transaction에 참여한다.
- GraphQL에 participant 전용 `ProfileFollowRequest` Relay Node, Profile 소유 incoming/outgoing connection과 처리 mutation을 제공한다.
- **BREAKING**: `FollowProfilePayload.profileFollow`을 `ProfileFollowResult` union 타입의 `FollowProfilePayload.result`로 교체한다. 승인은 영향받은 Profile과 삭제 ID를 반환하고, 거절은 행동자인 `followeeProfile`, 취소는 행동자인 `followerProfile`과 삭제 ID를 처리 mutation payload에 포함한다.
- 기존 FollowButton은 새 payload에서도 `OPEN` follow/unfollow 동작을 유지하되 아직 소비하지 않는 union 결과를 선택하거나 요청 상태·취소·관리 UI를 추가하지 않는다.
- Notification 생성·표시, Fedify inbox/Accept/Reject delivery, remote target follow/unfollow, ActivityPub Follow ID·actor URI·object URI·generation 저장과 해당 metadata migration/backfill, Profile/Domain Block 정책·저장 기반은 포함하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `data-model`: pending request 승인·거절·취소 전이의 원자성, 저장 count와 caller transaction 계약을 구체화한다.
- `profile`: follow policy에 따른 relation/request 생성, 공통 pending-only 처리 lifecycle과 Profile 소유 요청 조회 요구사항을 추가한다.
- `api-platform`: `ProfileFollowRequest` Relay Node, participant visibility, follow 성공 union과 처리 mutation payload 계약을 추가한다.

## Impact

- `packages/core/services`: established follow와 pending request의 공통 transaction 경계, request lifecycle service와 DB-backed 테스트가 추가된다.
- `apps/api/src/graphql/resolvers/profile` 및 `apps/api/schema.graphql`: Node, loader/access, connections, union과 mutations가 추가·변경된다.
- `apps/app/src/components/profile/FollowButton.tsx`와 Relay/Storybook fixture: 새 payload에서 follower/followee Profile만 소비해 기존 `OPEN` cache/count 갱신을 유지하도록 갱신된다. union과 request transition payload 계약은 API schema/integration test가 검증한다.
- 이 change는 기존 `profile_follow_request` 테이블, UUID primary key와 unique/FK/index를 그대로 사용하므로 자체 migration과 dependency 변경은 없다. PROD-366 적용 뒤 신규 row는 PostgreSQL `uuidv7()` default를 사용하고 기존 UUIDv8 값은 재작성하지 않는다.
- `add-activitypub-remote-follow`/PROD-243은 ActivityPub recipient·actor·object 검증, actor materialization, remote pending request 생성과 Fedify Follow/Undo handler를 소유한다. 양쪽은 remote actor/follower와 local followee의 기존 pair/FK를 공통 식별 경계로 사용하고 protocol activity metadata나 generation을 저장하지 않는다. PROD-243의 exact-row 삭제 경계는 delete/refollow 경쟁에서 새 row를 지우지 않는 로컬 동시성 방어로만 사용하며 expected generation을 비교하지 않는다. remote request 승인·거절 뒤 필요한 protocol payload는 저장된 participant pair에서 재구성하고 delivery는 이 change 밖에 남긴다.
- PROD-243과 PROD-272 구현은 기존 pair/FK 계약을 기준으로 병렬 진행한다. 두 active change가 같은 `Follow profile mutation` requirement를 수정하므로 이 change의 archive는 `add-activitypub-remote-follow` 최종 archive보다 먼저 수행하고, PROD-361이 최종 archive에서 이 change의 union/request 계약과 remote follow 계약을 누적 동기화한다.
