# Profile Mute 객체

## 정의

Profile Mute는 Owner Profile이 Target Profile의 콘텐츠와 새 Notification 노출을 개인적으로 억제한 관계다.
대상 Profile에는 알리지 않으며 기존 관계와 상호작용 객체를 제거하지 않는다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 만료 시각을 지나지 않은 객체의 존재가 적용 중인 Mute를 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                           | 존재 조건 | 조회 조건    | 조회 권한           |
| --------- | ---------------- | ----------------------------------- | --------- | ------------ | ------------------- |
| 만료 시각 | 시각, nullable   | 생성/변경 시 미래 시각이거나 영구다 | 항상      | Owner만 조회 | `ProfileMute.Owner` |

## 관계

| 관계           | 대상                    | 방향                    | cardinality | 존재 조건 | 조회 조건    | 조회 권한           |
| -------------- | ----------------------- | ----------------------- | ----------- | --------- | ------------ | ------------------- |
| Owner Profile  | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |
| Target Profile | [Profile](./profile.md) | Profile Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `ProfileMute.Owner` |

같은 Owner/Target 조합에는 적용 중인 Profile Mute가 하나만 존재한다.

## 행동

| 행동              | 행동 주체 Profile | 대상 객체    | 입력값                    | 권한                | 조건                                                                                      | 결과                                     |
| ----------------- | ----------------- | ------------ | ------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| Profile Mute 생성 | Owner Profile     | Profile Mute | Target Profile, 만료 시각 | `Profile.Member`    | Owner는 Active/Normal Local Profile이고 Target과 다르며 같은 조합의 적용 중인 Mute가 없다 | Owner/Target 관계를 가진 Mute가 생성된다 |
| Profile Mute 변경 | Owner Profile     | Profile Mute | 만료 시각                 | `ProfileMute.Owner` | 입력이 미래 시각이거나 영구다                                                             | 만료 시각이 바뀐다                       |
| Profile Mute 제거 | Owner Profile     | Profile Mute | 없음                      | `ProfileMute.Owner` | Profile Mute가 존재한다                                                                   | Profile Mute가 제거된다                  |

## 권한

| 권한                | 종류      | 성립 조건                                            |
| ------------------- | --------- | ---------------------------------------------------- |
| `ProfileMute.Owner` | 객체 종속 | 행동/요청 Profile이 Profile Mute의 Owner Profile이다 |

## 조회 정책

- Home/Hashtag Post List에서는 Target Profile의 Post를 Exclude한다.
- Target Profile Post List에서는 Target Profile의 Post를 Collapse한다.
- Target Profile에서 발생한 새 Notification Item은 생성하지 않는다.
- 기존 Notification Item의 존재와 Read State는 바꾸지 않는다.
- 만료 시각이 지난 Profile Mute는 조회 정책에 적용하지 않는다.

## 확정 용어

- Profile Mute: Profile Mute
- Owner Profile: Owner Profile
- Target Profile: Target Profile

## 제외/보류

- Profile Mute는 Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark를 제거하지 않는다.
