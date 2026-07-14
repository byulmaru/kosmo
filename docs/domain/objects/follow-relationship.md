# Follow Relationship 객체

## 정의

Follow Relationship은 Profile 간 성립된 follower/followee 방향 관계다. 승인 대기는
[Follow Request](./follow-request.md)가 소유하고, 승인·거절 처리 결과는 Follow Request에 보존하지 않는다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 성립된 팔로우 관계를 뜻한다.

## 속성

| 속성                           | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건            | 조회 권한            |
| ------------------------------ | ---------------- | ------------------------------ | --------- | -------------------- | -------------------- |
| 생성 시각                      | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 관계 당사자          | `Follow.Participant` |
| 관계별 새 Post 알림 Preference | boolean, 필수    | 생성 시 기본값은 false다       | 항상      | follower의 개인 설정 | `Follow.Follower`    |

## 관계

| 관계             | 대상                    | 방향                           | cardinality | 존재 조건 | 조회 조건   | 조회 권한            |
| ---------------- | ----------------------- | ------------------------------ | ----------- | --------- | ----------- | -------------------- |
| Follower Profile | [Profile](./profile.md) | Follow Relationship -> Profile | 1 -> 1      | 항상      | 관계 당사자 | `Follow.Participant` |
| Followee Profile | [Profile](./profile.md) | Follow Relationship -> Profile | 1 -> 1      | 항상      | 관계 당사자 | `Follow.Participant` |

같은 follower/followee 조합에는 Follow Relationship이 하나만 존재한다.

## 행동

| 행동                         | 행동 주체 Profile | 대상 객체           | 입력값           | 권한                                | 조건                                                                                                                                      | 결과                                                                                                                                   |
| ---------------------------- | ----------------- | ------------------- | ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Follow Relationship 생성     | Follower Profile  | Follow Relationship | Followee Profile | `Account.Active`, `Profile.Member`  | 두 Profile이 다르고 Active/Normal이며 Followee의 Approval Policy가 Open이다. 양방향 Profile Block, Profile Domain Block, 기존 관계가 없다 | 새 Post 알림 Preference=false인 Follow Relationship이 생성된다. 같은 조합의 Pending Follow Request와 그 Notification이 있으면 제거된다 |
| Unfollow                     | Follower Profile  | Follow Relationship | 없음             | `Account.Active`, `Follow.Follower` | 관계가 존재한다                                                                                                                           | Follow Relationship과 이 관계를 원인으로 가진 Notification이 제거된다                                                                  |
| 새 Post 알림 Preference 변경 | Follower Profile  | Follow Relationship | boolean          | `Account.Active`, `Follow.Follower` | 관계가 존재한다                                                                                                                           | Preference가 바뀐다                                                                                                                    |

Approval Policy가 Approval Required인 Followee에는 Follow Relationship을 직접 생성하지 않고 Follow Request를 생성한다.
Approval Policy 변경만으로 기존 Pending Follow Request를 승인하거나 제거하지 않는다.

## 권한

| 권한                 | 종류      | 성립 조건                                                      |
| -------------------- | --------- | -------------------------------------------------------------- |
| `Follow.Follower`    | 객체 종속 | 행동/요청 Profile이 Follow Relationship의 Follower Profile이다 |
| `Follow.Followee`    | 객체 종속 | 행동/요청 Profile이 Follow Relationship의 Followee Profile이다 |
| `Follow.Participant` | 객체 종속 | 요청 Profile이 Follower 또는 Followee Profile이다              |

## 조회 정책

- Follower/Followee 수는 Active/Normal Profile 사이의 현재 Follow Relationship만 계산한다.
- Profile Block과 Domain Block은 Follow Relationship보다 우선한다.
- 팔로워/팔로잉 목록 공개 정책의 구체 값이 확정되기 전에는 관계 당사자 외 공개 범위를 확장하지 않는다.

## 확정 용어

- 팔로우: Follow
- 팔로워: Follower
- 팔로잉 대상: Followee
- 관계별 설정: Relationship Preference

## 제외/보류

- 팔로우 가져오기/내보내기, 계정 이동, 서버 이전, 백업은 현재 범위에서 제외한다.
- List, 추천 팔로우, Followed Hashtag, 가까운 친구 또는 서클은 현재 범위에서 제외한다.
- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
