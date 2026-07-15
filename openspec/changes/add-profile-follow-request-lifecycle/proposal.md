## Why

`profile_follow_request`는 row 존재 자체가 Pending인 저장 계약을 갖고 있지만, local 요청 생성과 local/remote 요청이 공유할 조회·승인·거절·취소 lifecycle 및 GraphQL API가 아직 없다. PROD-323에서 정렬한 pending-only 계약을 실제 서비스 경계로 제공해 승인 필요 프로필을 정책 우회 없이 follow할 수 있게 해야 한다.

## What Changes

- Local `OPEN` 프로필 follow는 기존처럼 성립된 `ProfileFollow`를 생성하거나 반환하고, `APPROVAL_REQUIRED` 프로필 follow는 pending `ProfileFollowRequest`를 생성하거나 반환한다.
- Local/Remote request가 공유하는 pair 조회, 승인, 거절, 취소 core lifecycle을 제공한다. participant 가용성은 관계를 만드는 승인에서 검증하고, 거절·취소는 unavailable 상대가 있어도 pending row를 정리할 수 있게 한다.
- 승인 시 request 삭제, relation 생성과 저장 follow count 갱신을 하나의 transaction으로 처리하고 caller transaction에 참여한다.
- GraphQL에 participant 전용 `ProfileFollowRequest` Relay Node, Profile 소유 incoming/outgoing connection과 처리 mutation을 제공한다.
- **BREAKING**: `FollowProfilePayload.profileFollow`을 `ProfileFollowResult` union 타입의 `FollowProfilePayload.result`로 교체한다. 승인은 영향받은 Profile과 삭제 ID를 반환하고, 거절은 행동자인 `followeeProfile`, 취소는 행동자인 `followerProfile`과 삭제 ID를 처리 mutation payload에 포함한다.
- 기존 FollowButton은 union 결과를 안전하게 처리해 `OPEN` follow/unfollow 동작을 유지하되 요청 상태·취소·관리 UI는 추가하지 않는다.
- Notification 생성·표시, Fedify inbox/Accept/Reject delivery, remote target follow/unfollow, inbound correlation/generation, Profile/Domain Block 정책·저장 기반과 새 DB migration은 포함하지 않는다.

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
- `apps/app/src/components/profile/FollowButton.tsx`, request transition Relay store test와 Relay/Storybook fixture: 새 union을 처리하고 actor Profile 소유 request connection의 삭제 edge 갱신 계약을 검증하도록 갱신된다.
- 기존 `profile_follow_request` 테이블, unique/FK/index와 `TableDiscriminator`를 그대로 사용하므로 migration과 dependency 변경은 없다.
- `add-activitypub-remote-follow`/PROD-243은 ActivityPub 검증·materialization·correlation/generation·조건부 삭제를 계속 소유하고, 이 change의 core lifecycle을 검증된 actor pair에 재사용한다.
- 두 active change가 같은 `Follow profile mutation` requirement를 수정하므로 이 change를 먼저 구현·archive하고, PROD-361이 `add-activitypub-remote-follow` 최종 archive에서 이 change의 union/request 계약과 remote follow 계약을 누적 동기화한다.
