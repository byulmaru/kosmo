## Context

이 결정 기록은 PROD-272, pending-only active data-model spec, canonical Follow Request 문서와 기존 Relay/federation
경계를 반영한다.

## Decision Records

### Follow Request는 pending row로만 존재한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: canonical 문서의 Accepted/Rejected 상태와 처리 시각이 상태 컬럼 없는 active data model과 충돌한다.
- Decision Outcome: request row 존재를 Pending으로 해석하고 승인·거절·취소 시 row를 삭제한다. 승인은 별도 `ProfileFollow`를 생성한다.
- Alternatives Considered: terminal row를 보존하면 schema migration과 중복 상태 모델이 필요하고 이슈의 pending-only 제약을 위반한다.
- Consequences: 처리 이력은 Follow Request에서 조회할 수 없으며 request ID 재처리는 not-found다.
- Confirmation / Follow-up: canonical 문서, OpenSpec과 DB/API 타입에 state/respondedAt이 없어야 한다.

### 하나의 lifecycle service가 local/remote 처리를 소유한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: GraphQL과 ActivityPub listener가 각자 request row를 다루면 권한, uniqueness와 처리 결과가 drift할 수 있다.
- Decision Outcome: 저장 mutation은 core lifecycle 함수로 집중하고 local API와 remote adapter가 이를 호출한다.
- Alternatives Considered: resolver별 직접 쿼리는 적은 파일로 끝나지만 federation과 local 흐름의 불변 조건을 공유하지 못한다.
- Consequences: lifecycle 함수는 actor role과 target 정책을 명시적으로 입력/검증하고 transaction을 소유한다.
- Confirmation / Follow-up: 생성·승인·거절·취소와 중복/권한 단위 테스트를 같은 service에서 검증한다.

### Notification과 ActivityPub는 port로 연결한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: PROD-272는 lifecycle 경계를 호출해야 하지만 notification 저장과 ActivityPub delivery 구현을 중복 소유하지 않는다.
- Decision Outcome: request 생성/삭제 notification hook과 remote Accept/Reject delivery port를 정의하고 lifecycle 결과에 따라 호출한다.
- Alternatives Considered: no-op으로 완전히 생략하면 통합 지점이 없어지고, 직접 notification/activity row를 만들면 다른 이슈 소유권을 침범한다.
- Consequences: 현재 기본 구현은 안전한 no-op이며 소유 이슈가 실제 adapter를 주입한다. port 실패와 retry 정책은 각 소유 경계가 결정한다.
- Confirmation / Follow-up: lifecycle 테스트에서 port 호출 payload와 호출하지 않는 local 경로를 검증한다.

### GraphQL은 request Node와 participant connections를 제공한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: FollowButton 상태와 followee 처리 흐름 모두 안정적인 Relay identity와 제한된 조회가 필요하다.
- Decision Outcome: `ProfileFollowRequest` Node, `Profile.viewerState.followRequest`, viewer incoming/outgoing connections와 처리 mutations를 제공한다.
- Alternatives Considered: boolean pending 필드만 노출하면 cancel/approve/reject 대상 identity가 없고 cache 정규화가 어렵다.
- Consequences: request loader는 participant access를 강제하고 mutation payload는 영향받은 Profile/request ID를 반환한다.
- Confirmation / Follow-up: schema snapshot과 app Relay compiler로 계약을 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `APPROVAL_REQUIRED` 대상 follow를 request flow가 없어 conflict로 거부한다는 `split-profile-follow-requests`의 임시 결정은 pending request 생성으로 대체된다.
- Follow Request가 Accepted/Rejected terminal 상태와 처리 시각을 보존한다는 canonical 문장은 pending-only lifecycle로 대체된다.
