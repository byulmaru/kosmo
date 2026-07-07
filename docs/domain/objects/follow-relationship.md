# Follow Relationship 객체

## 정의

Follow Relationship은 Profile 간 성립된 follower/followee 방향 관계다. 팔로우 요청은
[Follow Request](./follow-request.md)가 소유한다.

## 상태

명시된 상태 차원은 없다. 객체의 존재가 성립된 Follow Relationship을 뜻한다.

## 속성

| 속성                           | 타입/nullability | 검증 정책 | 상태별 존재 조건 | 조회 권한                   |
| ------------------------------ | ---------------- | --------- | ---------------- | --------------------------- |
| 생성 시각                      | 시각, 필수       | 미정      | 항상             | `Profile.FollowListVisible` |
| 관계별 새 Post 알림 preference | boolean, 필수    | 미정      | 항상             | `Follow.Follower`           |

## 관계

| 관계             | 대상                    | 조건                    | 조회 권한                   |
| ---------------- | ----------------------- | ----------------------- | --------------------------- |
| follower Profile | [Profile](./profile.md) | 팔로우를 수행한 Profile | `Profile.FollowListVisible` |
| followee Profile | [Profile](./profile.md) | 팔로우 대상 Profile     | `Profile.FollowListVisible` |

## 행동

| 행동                         | 행동 주체 Profile | 대상 객체           | 입력값       | 권한                          | 결과                           |
| ---------------------------- | ----------------- | ------------------- | ------------ | ----------------------------- | ------------------------------ |
| Follow Relationship 생성     | Profile           | Follow Relationship | 대상 Profile | `Follow.TargetAvailable`      | Follow Relationship이 생성된다 |
| 언팔로우                     | follower Profile  | Follow Relationship | 없음         | `Follow.ParticipantOrBlocker` | Follow Relationship이 제거된다 |
| 새 Post 알림 preference 변경 | follower Profile  | Follow Relationship | boolean      | `Follow.Follower`             | preference가 바뀐다            |

언팔로우와 차단 삭제는 별도 상태를 만들지 않고 관계 제거로 표현한다.

## 권한

| 권한                          | 종류      | 성립 조건                                                           | 대표 참조                      |
| ----------------------------- | --------- | ------------------------------------------------------------------- | ------------------------------ |
| `Follow.TargetAvailable`      | 객체 종속 | 행동 주체 Profile이 대상 자유 Profile과 다르고 차단 정책을 통과한다 | 자유 Profile follow            |
| `Follow.ParticipantOrBlocker` | 객체 종속 | 행동 주체 Profile이 Follow Relationship의 follower 또는 차단 주체다 | 언팔로우, 차단 시 관계 제거    |
| `Follow.Follower`             | 객체 종속 | 행동 주체 Profile이 Follow Relationship의 follower다                | 관계별 새 Post 알림 preference |

## 불변 조건

- 자기 자신은 팔로우할 수 없다.
- block과 Domain Block은 follow보다 우선한다.
- 팔로워/팔로잉 수는 수락된 관계와 활성 Profile을 기준으로 계산한다.
- 승인제 Profile 대상 팔로우는 Follow Relationship을 직접 만들지 않고 Follow Request를 만든다.

## 확정 용어

- 팔로우: Follow
- 팔로워: Follower
- 팔로잉 대상: Followee
- 관계별 설정: Relationship Preference

## 제외/보류

- 팔로우 가져오기/내보내기, 계정 이동, 서버 이전, 백업은 현재 범위에서 제외한다.
- List, 추천 팔로우, Followed Hashtag, 가까운 친구 또는 서클은 현재 범위에서 제외한다.
- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
