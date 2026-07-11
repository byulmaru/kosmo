# Post Notification Mute 객체

## 정의

Post Notification Mute는 Owner Profile이 Root Post thread에서 발생하는 새 Reply, Reaction, Repost
Notification을 억제한 관계다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 적용 중인 알림 Mute를 뜻한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건    | 조회 권한                    |
| --------- | ---------------- | ------------------------------ | --------- | ------------ | ---------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | Owner만 조회 | `PostNotificationMute.Owner` |

## 관계

| 관계          | 대상                    | 방향                              | cardinality | 존재 조건 | 조회 조건    | 조회 권한                    |
| ------------- | ----------------------- | --------------------------------- | ----------- | --------- | ------------ | ---------------------------- |
| Owner Profile | [Profile](./profile.md) | Post Notification Mute -> Profile | 1 -> 1      | 항상      | Owner만 조회 | `PostNotificationMute.Owner` |
| Root Post     | [Post](./post.md)       | Post Notification Mute -> Post    | 1 -> 1      | 항상      | Owner만 조회 | `PostNotificationMute.Owner` |

같은 Owner Profile과 Root Post 조합에는 Post Notification Mute가 하나만 존재한다.

## 행동

| 행동                        | 행동 주체 Profile | 대상 객체              | 입력값    | 권한                         | 조건                                                                                    | 결과                                                     |
| --------------------------- | ----------------- | ---------------------- | --------- | ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Post Notification Mute 생성 | Owner Profile     | Post Notification Mute | Root Post | `Profile.Member`             | Owner는 Active/Normal Local Profile이고 Root Post 조회 정책을 통과하며 같은 조합이 없다 | Owner/Post 관계를 가진 Post Notification Mute가 생성된다 |
| Post Notification Mute 제거 | Owner Profile     | Post Notification Mute | 없음      | `PostNotificationMute.Owner` | Post Notification Mute가 존재한다                                                       | Post Notification Mute가 제거된다                        |

## 권한

| 권한                         | 종류      | 성립 조건                                                      |
| ---------------------------- | --------- | -------------------------------------------------------------- |
| `PostNotificationMute.Owner` | 객체 종속 | 행동/요청 Profile이 Post Notification Mute의 Owner Profile이다 |

## 조회 정책

- Root Post와 그 Reply 하위에서 발생한 새 Reply, Reaction, Repost Notification Item을 Owner Profile에게
  생성하지 않는다.
- 기존 Notification Item의 존재와 Read State는 바꾸지 않는다.

## 확정 용어

- Post Notification Mute: Post Notification Mute
- Root Post: Root Post

## 제외/보류

- Mention Notification과 Follow 계열 Notification에는 적용하지 않는다.
