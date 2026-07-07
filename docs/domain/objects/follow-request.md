# Follow Request 객체

## 정의

Follow Request는 follower Profile이 승인제 followee Profile에게 보낸 팔로우 요청이다. 수락된 팔로우
관계는 [Follow Relationship](./follow-relationship.md)이 소유한다.

## 상태

### Follow Request State

| 값        | 의미                                           |
| --------- | ---------------------------------------------- |
| 요청 대기 | followee Profile의 승인을 기다린다             |
| 수락      | 요청이 승인되어 Follow Relationship이 생성됐다 |
| 거절      | followee Profile이 요청을 거절했다             |

## 속성

| 속성      | 타입/nullability | 검증 정책 | 상태별 존재 조건 | 조회 권한                   |
| --------- | ---------------- | --------- | ---------------- | --------------------------- |
| 생성 시각 | 시각, 필수       | 미정      | 항상             | `FollowRequest.Participant` |
| 처리 시각 | 시각, nullable   | 미정      | 수락 또는 거절   | `FollowRequest.Participant` |

## 관계

| 관계                       | 대상                                            | 조건                | 조회 권한                   |
| -------------------------- | ----------------------------------------------- | ------------------- | --------------------------- |
| follower Profile           | [Profile](./profile.md)                         | 요청을 보낸 Profile | `FollowRequest.Participant` |
| followee Profile           | [Profile](./profile.md)                         | 요청 대상 Profile   | `FollowRequest.Participant` |
| 생성된 Follow Relationship | [Follow Relationship](./follow-relationship.md) | 수락된 요청         | `FollowRequest.Participant` |

## 행동

| 행동                | 행동 주체 Profile | 대상 객체      | 입력값       | 권한                            | 결과                                                             |
| ------------------- | ----------------- | -------------- | ------------ | ------------------------------- | ---------------------------------------------------------------- |
| Follow Request 생성 | Profile           | Follow Request | 대상 Profile | `FollowRequest.TargetAvailable` | 요청 대기 상태의 Follow Request가 생성된다                       |
| Follow Request 승인 | followee Profile  | Follow Request | 없음         | `FollowRequest.Incoming`        | Follow Request가 수락 상태가 되고 Follow Relationship이 생성된다 |
| Follow Request 거절 | followee Profile  | Follow Request | 없음         | `FollowRequest.Incoming`        | Follow Request가 거절 상태가 된다                                |
| Follow Request 취소 | follower Profile  | Follow Request | 없음         | `FollowRequest.Requester`       | 요청 대기 상태의 Follow Request가 제거된다                       |

## 권한

| 권한                            | 종류      | 성립 조건                                                             | 대표 참조           |
| ------------------------------- | --------- | --------------------------------------------------------------------- | ------------------- |
| `FollowRequest.TargetAvailable` | 객체 종속 | 행동 주체 Profile이 대상 승인제 Profile과 다르고 차단 정책을 통과한다 | Follow Request 생성 |
| `FollowRequest.Incoming`        | 객체 종속 | 행동 주체 Profile이 Follow Request의 followee다                       | 요청 승인/거절      |
| `FollowRequest.Requester`       | 객체 종속 | 행동 주체 Profile이 Follow Request의 follower다                       | 요청 취소           |
| `FollowRequest.Participant`     | 객체 종속 | viewer Profile이 Follow Request의 follower 또는 followee다            | Follow Request 조회 |

## 불변 조건

- Follow Request는 Follow Relationship이 아니다.
- 요청 대기 상태는 팔로워 공개 Post 접근 권한을 만들지 않는다.
- 수락된 Follow Request는 하나의 Follow Relationship을 생성한다.
- 거절된 요청은 다시 보낼 수 있다.

## 확정 용어

- 팔로우 요청: Follow Request
- Follow Request State: Follow Request State

## 제외/보류

- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
