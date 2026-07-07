# Notification Item 객체

## 정의

Notification Item은 다른 객체의 행동 결과를 Profile 또는 Account 대상에게 전달하는 개별 알림이다.

## 상태

### Read State

| 값     | 의미           |
| ------ | -------------- |
| unread | 아직 읽지 않음 |
| read   | 읽음 처리됨    |

### Follow Request Notification State

| 값          | 의미                                             |
| ----------- | ------------------------------------------------ |
| 대기        | Follow Request가 아직 승인/거절되지 않았다       |
| 승인 처리됨 | Follow Request가 승인되어 알림 표시가 처리되었다 |
| 거절 처리됨 | Follow Request가 거절되어 알림 표시가 처리되었다 |

Follow Request Notification State는 Follow Request Notification에만 존재하는 상태 차원이며 Read State와
독립이다. 이 상태는 관련 Follow Request의 승인/거절 결과를 표시하기 위한 Notification Item 상태이며 Follow
Request의 원본 상태를 대체하지 않는다.

## 속성

| 속성                     | 타입/nullability                            | 검증 정책                                                                        | 상태별 존재 조건            | 조회 권한                |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------- | ------------------------ |
| Notification Type        | enum, 필수                                  | 멘션, 답글, Reaction, Repost, Follow, Follow Request, Followee Post, Operational | 항상                        | `Notification.Recipient` |
| Read State               | Read State, 필수                            | unread 또는 read                                                                 | 항상                        | `Notification.Recipient` |
| Follow Request 처리 상태 | Follow Request Notification State, nullable | 대기, 승인 처리됨, 거절 처리됨                                                   | Follow Request Notification | `Notification.Recipient` |
| 생성 시각                | 시각, 필수                                  | 미정                                                                             | 항상                        | `Notification.Recipient` |
| 읽음 시각                | 시각, nullable                              | 읽음 처리 시 존재                                                                | read                        | `Notification.Recipient` |

## 관계

| 관계                     | 대상                                            | 조건                | 조회 권한                   |
| ------------------------ | ----------------------------------------------- | ------------------- | --------------------------- |
| 대상 Profile             | [Profile](./profile.md)                         | Profile 대상 알림   | `Notification.Recipient`    |
| 대상 Account             | [Account](./account.md)                         | Account 대상 알림   | `Notification.Recipient`    |
| 관련 Post                | [Post](./post.md)                               | 게시 관련 알림      | `Post.Visible`              |
| 관련 Profile             | [Profile](./profile.md)                         | Profile 관련 알림   | `Profile.Visible`           |
| 관련 Follow Request      | [Follow Request](./follow-request.md)           | Follow Request 알림 | `FollowRequest.Participant` |
| 관련 Follow Relationship | [Follow Relationship](./follow-relationship.md) | Followee Post 알림  | `Profile.FollowListVisible` |

## 행동

| 행동                     | 행동 주체            | 대상 객체         | 입력값                                         | 권한                                                           | 결과                                                                    |
| ------------------------ | -------------------- | ----------------- | ---------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Notification 생성        | 시스템               | Notification Item | 원인 이벤트, 관계별 새 Post 알림 preference    | `Post.Visible`, `Profile.Visible`, `Profile.FollowListVisible` | 새 Notification Item 생성                                               |
| 개별 읽음 처리           | Profile 또는 Account | Notification Item | 없음                                           | `Notification.Recipient`                                       | Read State가 read가 된다                                                |
| Follow Request 처리 반영 | 시스템               | Notification Item | Follow Request 상태                            | `System.NotificationSource`                                    | Follow Request Notification State가 승인 처리됨 또는 거절 처리됨이 된다 |
| Notification 억제        | 시스템               | Notification Item | 안전 정책, Muted Thread, Instance Safety State | `Post.Visible`, `Profile.Visible`, `Profile.FollowListVisible` | 새 알림을 만들지 않는다                                                 |

## 권한

| 권한                        | 종류      | 성립 조건                                                              | 대표 참조                        |
| --------------------------- | --------- | ---------------------------------------------------------------------- | -------------------------------- |
| `Notification.Recipient`    | 객체 종속 | 행동 주체 Profile이 대상 Profile이거나 요청 Account가 대상 Account이다 | Notification Item 조회/읽음 처리 |
| `System.NotificationSource` | 독립      | 시스템이 Notification Item 상태 반영 원본이다                          | Notification 상태 반영           |

## 불변 조건

- 공개 범위상 볼 수 없는 Post의 알림은 보내지 않는다.
- Profile Relation Rule과 Notification 적용 위치의 Word Mute Rule, Hashtag Mute Rule은 새 Notification
  Item 생성 억제와 기존 Notification 표시 모두에 반영되어야 한다.
- Home 또는 Search에만 적용하는 Word Mute Rule, Hashtag Mute Rule은 Notification Item 생성을 막지
  않는다.
- Muted Thread는 상태 차원이 아니라 새 Notification Item 생성을 억제하는 정책 단위다.
- Muted Thread의 새 Reply, Reaction, Repost Notification Item은 생성하지 않는다.
- Domain Block 상태인 Instance에서 온 원인 이벤트는 새 Notification Item을 생성하지 않는다.
- Follow Request Notification State는 Read State를 대체하지 않는다.
- block, mute, Profile 도메인 차단, Domain Block, Domain Limit이 발생해도 기존 Notification은 삭제하거나
  Read State를 바꾸지 않는다.

## 확정 용어

- 알림: Notification
- 읽음: Read
- 알림 억제: Suppress
- thread mute: Muted Thread

## 제외/보류

- Quote 알림은 현재 범위에서 제외한다.
