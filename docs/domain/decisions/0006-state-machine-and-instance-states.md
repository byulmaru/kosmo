# ADR 0006: State Rules and Instance States

## 상태

Accepted

## 날짜

2026-06-29

## 결정

### Profile

- Profile Lifecycle State는 Active, Deactivated, Deleted 값을 가진다.
- Profile Suspension State는 Normal, Suspended 값을 가진다.
- 두 상태 차원은 독립이며 운영자 정지/해제는 Suspension State만 바꾼다.
- Deleted는 terminal 상태다.
- Owner는 Active Local Profile을 Deactivated로, Deactivated Local Profile을 Active로 바꿀 수 있다.
- Profile 삭제는 Deactivated/Normal Local Profile에만 적용한다.
- 운영자는 Deleted가 아닌 Profile을 정지할 수 있고 Owner는 정지를 직접 해제할 수 없다.
- Remote Profile 갱신은 Lifecycle/Suspension State를 바꾸지 않는다.

### Instance

- Instance Safety State는 Normal, Domain Limit, Domain Block 값을 가진다.
- Instance Reachability State는 Reachable, Unreachable 값을 가진다.
- Instance Service State는 Active, Suspended 값을 가진다.
- Safety는 운영자 정책, Reachability는 응답 성공/실패 관측, Service는 원격 서버의 명시적 정지 신호다.
- 각 상태 변경 행동은 대상 상태 차원만 바꾸고 다른 차원은 유지한다.
- Domain Limit은 공개 Post List와 검색 후보를 제한하지만 원격 요청 자체를 막지 않는다.
- Domain Block은 콘텐츠와 관계 후보를 없는 것처럼 취급한다.
- 새 원격 요청은 Safety State가 Domain Block이 아니고 Reachability/Service State가 Reachable/Active일 때만
  보낸다.
- Instance 상태 변경은 기존 Notification Item의 존재와 Read State를 바꾸지 않는다.

## 문서 반영

- [Profile](../objects/profile.md)은 lifecycle, suspension, origin 상태 차원과 Mutation 조건을 정의한다.
- [Instance](../objects/instance.md)는 safety, reachability, service 상태 차원과 각 Mutation을 정의한다.
- [Post](../objects/post.md), [Media](../objects/media.md), [Post List Policy](../policies/post-list.md),
  [Notification Item](../objects/notification-item.md)은 Instance 상태의 조회 결과를 소비한다.
