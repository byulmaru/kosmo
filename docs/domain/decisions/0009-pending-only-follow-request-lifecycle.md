# ADR 0009: Pending-only Follow Request Lifecycle

## 상태

Accepted

## 날짜

2026-07-12

## 결정

- Follow Request는 별도 상태 차원을 가지지 않으며 객체 존재 자체가 Pending을 뜻한다.
- Follow Request 승인 시 요청을 제거하고 같은 follower/followee 조합의 Follow Relationship을 원자적으로
  생성한다.
- Follow Request 거절과 취소 시 요청을 제거한다.
- Accepted/Rejected 상태, 처리 시각과 생성된 Follow Relationship 참조를 Follow Request에 저장하지 않는다.
- Follow Request 승인, 거절, 취소는 객체가 존재할 때만 적용하며 처리 뒤 같은 요청 ID에 적용할 전이는 없다.
- local/remote 요청은 같은 저장 생명주기를 사용한다. 원격 승인·거절 delivery는 ActivityPub Follow 경계가
  소유한다.
- Follow Request Notification Item은 원본 요청이 존재하는 동안만 유지하고 요청이 승인, 거절 또는 취소되면
  Notification 생명주기 경계에서 제거한다.

## 대체한 결정

- [ADR 0007](./0007-spec-boundary-and-state-clarifications.md)의 Follow Request
  Pending/Accepted/Rejected 상태와 Notification 처리 표시 파생 결정을 대체한다.

## 문서 반영

- [Follow Request](../objects/follow-request.md)는 pending-only 객체와 처리 시 삭제하는 행동을 정의한다.
- [Follow Relationship](../objects/follow-relationship.md)은 승인 결과로 독립 생성되는 성립 관계를 정의한다.
- [Notification Item](../objects/notification-item.md)은 Follow Request 존재에 맞춘 생성·제거 경계를 정의한다.
