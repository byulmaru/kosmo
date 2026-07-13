# Notification Item 객체

## 정의

Notification Item은 다른 객체의 행동 결과를 Recipient Profile 또는 Recipient Account에게 직접 전달하는
개별 알림이다.

## 상태

### Read State

| 값     | 의미           |
| ------ | -------------- |
| Unread | 아직 읽지 않음 |
| Read   | 읽음 처리됨    |

### Notification Type

| 값             | 의미                                          |
| -------------- | --------------------------------------------- |
| Mention        | Recipient Profile이 Post에 멘션됨             |
| Reply          | Recipient Profile의 Post에 Reply가 작성됨     |
| Reaction       | Recipient Profile의 Post에 Reaction이 생성됨  |
| Repost         | Recipient Profile의 Post가 Repost됨           |
| Follow         | Recipient Profile이 팔로우됨                  |
| Follow Request | Recipient Profile에 Follow Request가 생성됨   |
| Followee Post  | 알림 Preference 대상 Followee가 Post를 작성함 |
| Operational    | Recipient Account 대상 운영 알림              |

## 속성

| 속성        | 타입/nullability | 검증 정책                           | 존재 조건          | 조회 조건        | 조회 권한                |
| ----------- | ---------------- | ----------------------------------- | ------------------ | ---------------- | ------------------------ |
| 생성 시각   | 시각, 필수       | 생성 결과로 기록하며 변경 불가      | 항상               | Recipient만 조회 | `Notification.Recipient` |
| 읽음 시각   | 시각, nullable   | Read 전이 결과로 기록하며 변경 불가 | Read State가 Read  | Recipient만 조회 | `Notification.Recipient` |
| 운영 메시지 | 문자열, 필수     | 비어 있지 않은 운영 알림 본문       | Type이 Operational | Recipient만 조회 | `Notification.Recipient` |

## 관계

| 관계                        | 대상                                            | 방향                                     | cardinality | 존재 조건                                   | 조회 조건        | 조회 권한                |
| --------------------------- | ----------------------------------------------- | ---------------------------------------- | ----------- | ------------------------------------------- | ---------------- | ------------------------ |
| Recipient Profile           | [Profile](./profile.md)                         | Notification Item -> Profile             | 1 -> 1      | Type이 Operational이 아님                   | Recipient만 조회 | `Notification.Recipient` |
| Recipient Account           | [Account](./account.md)                         | Notification Item -> Account             | 1 -> 1      | Type이 Operational                          | Recipient만 조회 | `Notification.Recipient` |
| Related Post                | [Post](./post.md)                               | Notification Item -> Post                | 1 -> 0..1   | Mention/Reply/Reaction/Repost/Followee Post | Recipient만 조회 | `Notification.Recipient` |
| Related Profile             | [Profile](./profile.md)                         | Notification Item -> Profile             | 1 -> 0..1   | Operational을 제외한 Type                   | Recipient만 조회 | `Notification.Recipient` |
| Related Follow Request      | [Follow Request](./follow-request.md)           | Notification Item -> Follow Request      | 1 -> 0..1   | Type이 Follow Request                       | Recipient만 조회 | `Notification.Recipient` |
| Related Follow Relationship | [Follow Relationship](./follow-relationship.md) | Notification Item -> Follow Relationship | 1 -> 0..1   | Type이 Follow 또는 Followee Post            | Recipient만 조회 | `Notification.Recipient` |

Notification Item은 Recipient Profile과 Recipient Account 중 정확히 하나를 가진다.

## 행동

| 행동                           | 행동 주체 | 대상 객체         | 입력값                     | 권한                                       | 조건                                                                                                    | 결과                                                                                   |
| ------------------------------ | --------- | ----------------- | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Notification 생성              | 시스템    | Notification Item | Type, Recipient, 원인 객체 | `System.NotificationSource`                | Type별 필수 관계가 존재하고 Recipient가 원인 객체의 조회 정책을 통과하며 아래 억제 정책에 걸리지 않는다 | 입력 Notification Type과 Read State=Unread인 Notification Item 및 원인 관계가 생성된다 |
| Profile Notification 읽음 처리 | Profile   | Notification Item | 없음                       | `Account.Active`, `Notification.Recipient` | Type이 Operational이 아니고 Read State가 Unread다                                                       | Read State가 Read가 되고 읽음 시각이 기록된다                                          |
| Account Notification 읽음 처리 | Account   | Notification Item | 없음                       | `Notification.Recipient`                   | Type이 Operational이고 Recipient Account State가 Deleted가 아니며 Read State가 Unread다                 | Read State가 Read가 되고 읽음 시각이 기록된다                                          |

### Type별 생성 관계

| Notification Type | Recipient                     | 필수 원인 관계                                                        |
| ----------------- | ----------------------------- | --------------------------------------------------------------------- |
| Mention           | Mentioned Profile             | Related Post, Related Profile                                         |
| Reply             | Reply Parent의 Author Profile | Related Post, Reply Author인 Related Profile                          |
| Reaction          | Post Author Profile           | Related Post, Reaction Owner인 Related Profile                        |
| Repost            | Source Post Author Profile    | Related Post, Repost Author인 Related Profile                         |
| Follow            | Followee Profile              | Follower인 Related Profile, Related Follow Relationship               |
| Follow Request    | Followee Profile              | Related Follow Request, Follower인 Related Profile                    |
| Followee Post     | Follower Profile              | Related Post, Followee인 Related Profile, Related Follow Relationship |
| Operational       | Account                       | 운영 메시지                                                           |

## 권한

| 권한                        | 종류      | 성립 조건                                                                 |
| --------------------------- | --------- | ------------------------------------------------------------------------- |
| `Notification.Recipient`    | 객체 종속 | 요청 Profile이 Recipient Profile이거나 요청 Account가 Recipient Account다 |
| `System.NotificationSource` | 독립      | 시스템이 Notification Item 생성 원인의 반영 주체다                        |

## 조회 정책

- Recipient가 Related Post 또는 Related Profile을 볼 수 없는 경우 새 Notification Item을 생성하지 않는다.
- Recipient의 Profile Mute, Profile Block, Profile Domain Block을 적용한다.
- Notification Scope를 포함한 Word Mute Rule과 Hashtag Mute Rule이 일치하면 새 Notification Item을
  생성하지 않는다.
- Post Notification Mute의 Root Post thread에 속한 Reply, Reaction, Repost Notification Item은 생성하지
  않는다.
- Domain Block Instance에서 온 원인 객체는 새 Notification Item을 만들지 않는다.
- Followee Post는 Follow Relationship의 새 Post 알림 Preference가 true일 때만 생성한다.
- Follow Request Notification은 Related Follow Request가 존재하는 동안만 유지한다.
- Follow Request가 승인, 거절 또는 취소되면 대응하는 Follow Request Notification Item을 제거한다.
- Follow Request 또는 Follow Relationship이 제거되면 이를 직접 원인으로 가진 Notification Item도 제거한다.
- Mute가 나중에 생성되어도 기존 Notification Item의 존재와 Read State는 바꾸지 않는다. Profile Block은 제거된
  Follow 객체를 직접 원인으로 가진 Notification Item만 제거한다.

## 확정 용어

- 알림: Notification
- 알림 항목: Notification Item
- 읽음 상태: Read State
- 알림 유형: Notification Type
- 수신자: Recipient

## 제외/보류

- Quote Notification은 현재 범위에서 제외한다.
