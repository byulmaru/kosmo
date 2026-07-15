# Follow Request 객체

## 정의

Follow Request는 Follower Profile이 승인제 Followee Profile에게 보낸 팔로우 요청이다. 성립된 관계는
[Follow Relationship](./follow-relationship.md)이 소유한다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 Followee Profile의 처리를 기다리는 Pending 요청을
뜻한다. 승인, 거절 또는 취소로 대기가 끝나면 객체를 제거한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건   | 조회 권한                   |
| --------- | ---------------- | ------------------------------ | --------- | ----------- | --------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 요청 당사자 | `FollowRequest.Participant` |

## 관계

| 관계             | 대상                    | 방향                      | cardinality | 존재 조건 | 조회 조건   | 조회 권한                   |
| ---------------- | ----------------------- | ------------------------- | ----------- | --------- | ----------- | --------------------------- |
| Follower Profile | [Profile](./profile.md) | Follow Request -> Profile | 1 -> 1      | 항상      | 요청 당사자 | `FollowRequest.Participant` |
| Followee Profile | [Profile](./profile.md) | Follow Request -> Profile | 1 -> 1      | 항상      | 요청 당사자 | `FollowRequest.Participant` |

같은 Follower/Followee 조합에는 Pending Follow Request가 하나만 존재한다.

## 행동

| 행동                | 행동 주체 Profile | 대상 객체      | 입력값           | 권한                                       | 조건                                                                                                                                              | 결과                                                                                                                                  |
| ------------------- | ----------------- | -------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Follow Request 생성 | Follower Profile  | Follow Request | Followee Profile | `Account.Active`, `Profile.Member`         | 두 Profile이 다르고 Active/Normal이며 Followee의 Approval Policy가 Approval Required다. 양방향 Block, Domain Block, 기존 관계/Pending 요청이 없다 | Pending Follow Request가 생성되고 대응하는 Follow Request Notification 생성 경계를 호출한다                                           |
| Follow Request 승인 | Followee Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Followee` | Follow Request가 존재하고 두 Profile이 Active/Normal이며 차단 관계와 기존 Follow Relationship이 없다                                              | Follow Request를 제거하고 새 Post 알림 Preference=false인 Follow Relationship을 원자적으로 생성하며 Notification 제거 경계를 호출한다 |
| Follow Request 거절 | Followee Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Followee` | Follow Request가 존재한다                                                                                                                         | Follow Request를 제거하고 Notification 제거 경계를 호출한다                                                                           |
| Follow Request 취소 | Follower Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Follower` | Follow Request가 존재한다                                                                                                                         | Follow Request를 제거하고 Notification 제거 경계를 호출한다                                                                           |

승인과 거절 결과는 Follow Request 상태로 보존하지 않는다. 거절 또는 취소 뒤 다시 요청하려면 새 Follow Request를
생성한다. 원격 요청의 승인과 거절은 같은 저장 생명주기를 적용한 뒤 ActivityPub Follow 경계에 delivery를 위임한다.

## 권한

| 권한                        | 종류      | 성립 조건                                                 |
| --------------------------- | --------- | --------------------------------------------------------- |
| `FollowRequest.Follower`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Follower Profile이다 |
| `FollowRequest.Followee`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Followee Profile이다 |
| `FollowRequest.Participant` | 객체 종속 | 요청 Profile이 Follower 또는 Followee Profile이다         |

## 조회 정책

- Follow Request는 Followers Only Post 접근 권한이나 Follow Relationship을 만들지 않는다.
- 처리 이력과 원격 delivery 상태 보존 방식은 Follow Request가 소유하지 않는다.

## 확정 용어

- 팔로우 요청: Follow Request

## 제외/보류

- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
