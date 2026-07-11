# Follow Request 객체

## 정의

Follow Request는 Follower Profile이 승인제 Followee Profile에게 보낸 팔로우 요청이다. 성립된 관계는
[Follow Relationship](./follow-relationship.md)이 소유한다.

## 상태

### Follow Request State

| 값       | 의미                                                |
| -------- | --------------------------------------------------- |
| Pending  | Followee Profile의 처리를 기다리는 상태             |
| Accepted | 승인되어 Follow Relationship이 생성된 terminal 상태 |
| Rejected | 거절된 terminal 상태                                |

## 속성

| 속성      | 타입/nullability | 검증 정책                           | 존재 조건                 | 조회 조건   | 조회 권한                   |
| --------- | ---------------- | ----------------------------------- | ------------------------- | ----------- | --------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가      | 항상                      | 요청 당사자 | `FollowRequest.Participant` |
| 처리 시각 | 시각, nullable   | 승인/거절 결과로 기록하며 변경 불가 | State가 Accepted/Rejected | 요청 당사자 | `FollowRequest.Participant` |

## 관계

| 관계                       | 대상                                            | 방향                                  | cardinality | 존재 조건        | 조회 조건   | 조회 권한                   |
| -------------------------- | ----------------------------------------------- | ------------------------------------- | ----------- | ---------------- | ----------- | --------------------------- |
| Follower Profile           | [Profile](./profile.md)                         | Follow Request -> Profile             | 1 -> 1      | 항상             | 요청 당사자 | `FollowRequest.Participant` |
| Followee Profile           | [Profile](./profile.md)                         | Follow Request -> Profile             | 1 -> 1      | 항상             | 요청 당사자 | `FollowRequest.Participant` |
| 생성된 Follow Relationship | [Follow Relationship](./follow-relationship.md) | Follow Request -> Follow Relationship | 1 -> 0..1   | State가 Accepted | 요청 당사자 | `FollowRequest.Participant` |

같은 Follower/Followee 조합에는 Pending Follow Request가 하나만 존재한다.

## 행동

| 행동                | 행동 주체 Profile | 대상 객체      | 입력값           | 권한                     | 조건                                                                                                                                              | 결과                                                                  |
| ------------------- | ----------------- | -------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Follow Request 생성 | Follower Profile  | Follow Request | Followee Profile | `Profile.Member`         | 두 Profile이 다르고 Active/Normal이며 Followee의 Approval Policy가 Approval Required다. 양방향 Block, Domain Block, 기존 관계/Pending 요청이 없다 | State=Pending인 Follow Request가 생성된다                             |
| Follow Request 승인 | Followee Profile  | Follow Request | 없음             | `FollowRequest.Followee` | State가 Pending이고 두 Profile이 Active/Normal이며 차단 관계가 없다                                                                               | State=Accepted, 처리 시각, Follow Relationship이 원자적으로 생성된다  |
| Follow Request 거절 | Followee Profile  | Follow Request | 없음             | `FollowRequest.Followee` | State가 Pending이다                                                                                                                               | State=Rejected가 되고 처리 시각이 기록된다                            |
| Follow Request 취소 | Follower Profile  | Follow Request | 없음             | `FollowRequest.Follower` | State가 Pending이다                                                                                                                               | Follow Request와 대응하는 Follow Request Notification Item이 제거된다 |

Accepted와 Rejected 상태에는 다른 상태 전이를 적용하지 않는다. Rejected 뒤 다시 요청하려면 새 Follow Request를
생성한다.

## 권한

| 권한                        | 종류      | 성립 조건                                                 |
| --------------------------- | --------- | --------------------------------------------------------- |
| `FollowRequest.Follower`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Follower Profile이다 |
| `FollowRequest.Followee`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Followee Profile이다 |
| `FollowRequest.Participant` | 객체 종속 | 요청 Profile이 Follower 또는 Followee Profile이다         |

## 조회 정책

- Pending Follow Request는 Followers Only Post 접근 권한이나 Follow Relationship을 만들지 않는다.
- Follow Request 취소 이력과 원격 delivery 상태 보존 방식은 구현 스펙에서 다룬다. 대응하는 Notification Item은
  취소 결과로 제거한다.

## 확정 용어

- 팔로우 요청: Follow Request
- Follow Request State: Follow Request State

## 제외/보류

- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
