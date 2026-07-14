# Profile Block 객체

## 정의

Profile Block은 Owner Profile과 Target Profile 사이의 조회와 상호작용을 차단하는 관계다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 적용 중인 Block을 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건    | 조회 권한            |
| --------- | ---------------- | ------------------------------ | --------- | ------------ | -------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Owner만 조회 | `ProfileBlock.Owner` |

## 관계

| 관계           | 대상                    | 방향                     | cardinality | 존재 조건 | 조회 조건    | 조회 권한            |
| -------------- | ----------------------- | ------------------------ | ----------- | --------- | ------------ | -------------------- |
| Owner Profile  | [Profile](./profile.md) | Profile Block -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileBlock.Owner` |
| Target Profile | [Profile](./profile.md) | Profile Block -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileBlock.Owner` |

같은 Owner/Target 조합에는 Profile Block이 하나만 존재한다.

## 행동

| 행동               | 행동 주체 Profile | 대상 객체     | 입력값         | 권한                                   | 조건                                                                             | 결과                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------- | ------------- | -------------- | -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile Block 생성 | Owner Profile     | Profile Block | Target Profile | `Account.Active`, `Profile.Member`     | Owner는 Active/Normal Local Profile이고 Target과 다르며 같은 조합의 Block이 없다 | Block이 생성되고 두 Profile 사이의 Follow Request와 Follow Relationship, Target이 Owner의 Post에 남긴 Reaction이 제거된다. 제거된 Follow 객체를 원인으로 가진 Notification Item도 제거되며 Repost Post, Bookmark, 다른 기존 Notification Item은 action에서 동기적으로 유지된다 |
| Profile Block 제거 | Owner Profile     | Profile Block | 없음           | `Account.Active`, `ProfileBlock.Owner` | Profile Block이 존재한다                                                         | Profile Block이 제거된다                                                                                                                                                                                                                                                       |

## 권한

| 권한                 | 종류      | 성립 조건                                             |
| -------------------- | --------- | ----------------------------------------------------- |
| `ProfileBlock.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Block의 Owner Profile이다 |

## 조회 정책

- Owner와 Target은 서로의 Profile, Post, Media와 Follow 후보를 직접 조회할 수 없다.
- 모든 Post List와 검색 결과에서 상대 Profile의 콘텐츠를 Exclude한다.
- Block 뒤 상대 Profile에서 발생한 새 Notification Item은 생성하지 않는다.
- 제거된 Follow Request/Relationship을 원인으로 가진 Notification Item은 함께 제거한다. 다른 기존 Notification
  Item은 Block action에서 동기적으로 바꾸지 않지만, 상대 Profile을 조회할 수 없어지면 Notification 조회에서 없는
  것으로 취급하고 후속 비동기 cleanup 전까지 저장 상태가 남을 수 있다.
- Block은 기존 Repost Post를 제거하지 않는다.

## 확정 용어

- Profile Block: Profile Block
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- 커뮤니티 관리와 신고 처리는 현재 범위에서 제외한다.
