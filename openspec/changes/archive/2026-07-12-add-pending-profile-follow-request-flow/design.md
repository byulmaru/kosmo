## Context

`ProfileFollowRequests`는 follower/followee/createdAt과 pair unique constraint만 가진다. API는 현재
`followProfile`에서 승인제 대상을 conflict로 거부하고, `Profile.viewerState`는 established follow만 노출한다.
Notification 객체와 ActivityPub remote follow 구현은 별도 이슈가 소유하므로 이번 change는 저장 계약을
복제하지 않고 호출 가능한 port를 둔다.

## Goals / Non-Goals

**Goals:**

- local/remote request가 동일한 pending-only lifecycle 함수를 사용한다.
- 생성, 승인, 거절, 취소의 권한과 pair uniqueness를 DB transaction 안에서 보장한다.
- GraphQL Node/connection/mutation과 FollowButton을 Relay identity에 맞게 연결한다.
- notification과 federation integration을 lifecycle port로 분리해 후속 이슈가 구현체를 연결할 수 있게 한다.
- canonical 문서, active spec, OpenSpec과 코드의 lifecycle 의미를 정렬한다.

**Non-Goals:**

- notification table, notification 목록 UI 또는 push delivery 구현.
- ActivityPub HTTP signature, inbox routing, queue/retry, durable activity log의 신규 구현.
- Accepted/Rejected request history나 처리 시각 보존.
- 전체 E2E와 운영 federation delivery 검증.

## Risks / Trade-offs

- [Risk] 처리 transaction이 끝난 뒤 integration port가 실패하면 DB 결과와 외부 delivery가 어긋날 수 있다.
  → transaction 안에서 네트워크 호출을 하지 않으며 port 실패를 호출자에게 전파한다. durable outbox/retry는
  ActivityPub/Notification 소유 이슈에서 제공한다.
- [Risk] unique race에서 follow와 request가 동시에 생길 수 있다. → target policy와 기존 row를 transaction에서
  다시 확인하고 pair-level advisory transaction lock을 사용해 생성/처리를 직렬화한다.
- [Risk] request Node의 전역 조회가 존재 여부를 제3자에게 누출할 수 있다. → loader가 viewer active profile이
  follower 또는 followee인 row만 반환한다.
- [Risk] UI가 incoming approve/reject 전체 관리 화면까지 확장될 수 있다. → 이번 사용자 흐름은 기존
  FollowButton의 outgoing request 생성/취소와 API incoming connection/processing 계약까지 제공한다.

## Migration Plan

1. canonical Follow Request/Relationship/Notification 문장에서 terminal request 참조를 제거한다.
2. core에 transaction-aware lifecycle 함수와 integration port interface를 추가한다.
3. API에 request ref/loader/connection과 follow/approve/reject/cancel mutation을 연결한다.
4. generated GraphQL schema와 app Relay fragment/mutation/UI를 갱신한다.
5. lifecycle 단위 테스트, GraphQL schema test, app component 테스트와 타입/포맷 검사를 실행한다.

저장 schema는 이미 pending-only이므로 migration은 없다. rollback은 API/UI/lifecycle 함수를 제거하고
canonical 문서와 spec delta를 되돌리는 방식이며 request row 데이터 shape에는 영향을 주지 않는다.
