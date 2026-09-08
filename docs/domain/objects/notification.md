# Notification 객체

## 정의

Notification은 다른 객체의 행동 결과를 Recipient Profile 또는 Recipient Account에게 직접 전달하는
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
| Quote          | Recipient Profile의 Post가 Quote됨            |
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

| 관계                        | 대상                                            | 방향                                | cardinality | 존재 조건                                                       | 조회 조건        | 조회 권한                |
| --------------------------- | ----------------------------------------------- | ----------------------------------- | ----------- | --------------------------------------------------------------- | ---------------- | ------------------------ |
| Recipient Profile           | [Profile](./profile.md)                         | Notification -> Profile             | 1 -> 1      | Type이 Operational이 아님                                       | Recipient만 조회 | `Notification.Recipient` |
| Recipient Account           | [Account](./account.md)                         | Notification -> Account             | 1 -> 1      | Type이 Operational                                              | Recipient만 조회 | `Notification.Recipient` |
| Related Post                | [Post](./post.md)                               | Notification -> Post                | 1 -> 0..1   | Mention/Reply/Reaction/Repost/Quote/Followee Post               | Recipient만 조회 | `Notification.Recipient` |
| Related Profile             | [Profile](./profile.md)                         | Notification -> Profile             | 1 -> 0..1   | Operational을 제외한 Type                                       | Recipient만 조회 | `Notification.Recipient` |
| Source Reaction             | [Reaction](./reaction.md)                       | Notification -> Reaction            | 1 -> 0..1   | Type이 Reaction                                                 | Recipient만 조회 | `Notification.Recipient` |
| Source Repost               | [Post](./post.md)                               | Notification -> Post                | 1 -> 0..1   | Type이 Repost, Content와 Reply Parent 없이 Repost Source가 있음 | Recipient만 조회 | `Notification.Recipient` |
| Related Follow Request      | [Follow Request](./follow-request.md)           | Notification -> Follow Request      | 1 -> 0..1   | Type이 Follow Request                                           | Recipient만 조회 | `Notification.Recipient` |
| Related Follow Relationship | [Follow Relationship](./follow-relationship.md) | Notification -> Follow Relationship | 1 -> 0..1   | Type이 Follow 또는 Followee Post                                | Recipient만 조회 | `Notification.Recipient` |

Notification은 Recipient Profile과 Recipient Account 중 정확히 하나를 가진다.
Reply Notification의 Related Post는 원인 행동으로 생성된 Reply Post이고 Related Profile은 Reply Author
Profile이다.
Reaction Notification의 Source Reaction은 알림을 만든 원인 Reaction이다. Related Post와 Related Profile은
각각 Source Reaction의 Post와 Profile에 일치해야 한다.
Repost Notification의 Source Repost는 알림을 만든 원인 Repost Post다. Related Post와 Related Profile은
각각 Source Repost의 Repost Source와 Author Profile에 일치해야 한다.
Quote Notification의 Related Post는 원인 Quote Post이고 Related Profile은 Quote Author Profile이다.
Recipient Profile은 Related Post의 direct Repost Source Author Profile이다. 원문은 이 Post 관계에서
식별하며 Notification을 위해 별도의 Post 구조 관계를 만들지 않는다.

## 행동

| 행동                                | 행동 주체 | 대상 객체         | 입력값                     | 권한                                       | 조건                                                                                                                                                 | 결과                                                                                                          |
| ----------------------------------- | --------- | ----------------- | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Notification 생성                   | 시스템    | Notification      | Type, Recipient, 원인 객체 | `System.NotificationSource`                | Type별 필수 관계가 존재하고 Recipient가 원인 객체의 조회 정책을 통과하며 아래 억제 정책에 걸리지 않는다                                              | 입력 Notification Type과 Read State=Unread인 Notification 및 원인 관계가 생성된다                             |
| 상호작용 Notification 정리          | 시스템    | Notification      | 정리 대상 Notification     | `System.NotificationSource`                | 지원 Type의 필수 원인 관계 결손·원인 Recipient 불일치·Recipient 기준 Related Post/Profile 비가용 (Recipient 자체의 복구 가능한 비활성화·정지는 제외) | 시점과 성공을 보장하지 않고 Notification 제거를 Best Effort로 시도한다                                        |
| Profile Notification 지정 읽음 처리 | Account   | Notification 목록 | Notification ID 목록       | `Account.Active`, `Notification.Recipient` | Type이 Operational이 아닌 입력 항목 중 요청 Account가 현재 조회할 수 있는 Notification이다                                                           | 처리 가능한 입력 항목은 Read가 되고 읽음 시각이 최초 기록된다. 이미 Read이면 상태와 읽음 시각을 바꾸지 않는다 |
| Account Notification 읽음 처리      | Account   | Notification      | 없음                       | `Notification.Recipient`                   | Type이 Operational이고 Recipient Account State가 Deleted가 아니며 Read State가 Unread다                                                              | Read State가 Read가 되고 읽음 시각이 기록된다                                                                 |

### Profile Notification 지정 읽음 처리

- Account는 한 요청에 0개 이상의 Notification ID를 지정할 수 있다.
- 시스템은 입력 ID 중 요청 Account가 Recipient Profile membership을 가지고 있고 현재 조회 정책을 통과하는
  서로 다른 Profile Notification만 Read 처리한다.
- 존재하지 않거나 Notification이 아니거나 요청 Account가 Recipient Profile membership을 가지지 않거나 현재 조회할 수 없는 입력 ID는
  조용히 제외하며, 존재 여부나 제외 이유를 응답으로 노출하지 않는다.
- 빈 목록이거나 모든 입력 ID가 제외돼도 성공한 no-op이다.
- 중복 ID와 이미 Read인 Notification은 멱등적으로 처리하며 최초 읽음 시각을 보존한다.
- 입력에 없는 Notification은 요청 처리 중 새로 생성된 항목을 포함해 변경하지 않는다. 시스템은 입력 목록을
  요청 시점의 전체 visible unread 집합으로 확장하지 않는다.
- 처리 실패 시 입력 목록의 일부 Notification만 변경된 상태를 남기지 않는다.

### Type별 생성 관계

| Notification Type | Recipient                           | 필수 원인 관계                                                                     |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Mention           | Mentioned Profile                   | Related Post, Related Profile                                                      |
| Reply             | Reply Parent의 Author Profile       | Related Post, Reply Author인 Related Profile                                       |
| Reaction          | Post Author Profile                 | Source Reaction, Related Post, Reaction Owner인 Related Profile                    |
| Repost            | Source Post Author Profile          | Source Repost, Related Post, Repost Author인 Related Profile                       |
| Quote             | direct Repost Source Author Profile | Quote인 Related Post, Quote Author인 Related Profile, Quote의 direct Repost Source |
| Follow            | Followee Profile                    | Follower인 Related Profile, Related Follow Relationship                            |
| Follow Request    | Followee Profile                    | Related Follow Request, Follower인 Related Profile                                 |
| Followee Post     | Follower Profile                    | Related Post, Followee인 Related Profile, Related Follow Relationship              |
| Operational       | Account                             | 운영 메시지                                                                        |

### Reply/Mention 수신자별 분류와 중복 처리 (Future)

2026-09-08 사용자 승인으로 확정한 후속 Mention 구현 계약이다. Mention은 도메인 Type으로
정의되어 있으나 현재 API·알림 생성·inbox 통합의 완료를 의미하지 않는다. 후속 구현 전 담당 Linear
이슈와 필요한 OpenSpec scenario에 아래 정책을 연결하고 검증한다.

- 분류 기준은 해당 Post가 답글인지 여부만이 아니라 각 Recipient와 원인 Post의 관계다.
- Mention의 source와 Related Post는 Recipient를 멘션한 원인 Post이며, Related Profile은 그 Post의
  Author Profile이다. 같은 원인 Post에서 같은 Recipient를 여러 번 멘션해도 source는 하나이며,
  동일 source·Recipient 쌍에 Mention Notification은 최대 하나만 존재한다.
- Recipient의 Post에 답하면서 같은 Recipient를 멘션한 경우, 같은 원인 Post에 대해 해당 Recipient에게
  Reply Notification 하나만 생성하고 Mention Notification을 중복 생성하지 않는다.
- 타인의 Post에 답하면서 Recipient를 멘션한 경우, 해당 Recipient에게는 Mention Notification이다.
  그 글이 Reply라는 이유만으로 해당 Recipient의 Mention을 Reply로 바꾸거나 제외하지 않는다.
- 여러 Profile이 멘션되면 각 Recipient별로 분류한다. 같은 Post가 원글 작성자에게는 Reply,
  다른 Mentioned Profile에게는 Mention의 원인이 될 수 있다. 각 Recipient의 조회·생성 억제 정책은
  그대로 적용한다.

표시 문구와 원글 미리보기 여부는 [Notification presentation](../../design/notifications.md)이
소유하며, 알림 UI의 구성만으로 Related Post나 Recipient 관계를 바꾸지 않는다.

## 권한

| 권한                        | 종류      | 성립 조건                                                                                    |
| --------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `Notification.Recipient`    | 객체 종속 | 요청 Account가 Recipient Profile의 Account-Profile Membership을 가지거나 Recipient Account다 |
| `System.NotificationSource` | 독립      | 시스템이 Notification 생성 원인의 반영 주체다                                                |

## 조회 정책

- Recipient가 Related Post 또는 Related Profile을 볼 수 없는 경우 새 Notification을 생성하지 않는다.
- Reply, Reaction, Repost, Quote의 Recipient Profile과 원인 행동의 Related Profile이 같으면 새 Notification을
  생성하지 않는다.
- Recipient의 Profile Mute, Profile Block, Profile Domain Block을 적용한다.
- Notification Scope를 포함한 Word Mute Rule과 Hashtag Mute Rule이 일치하면 새 Notification을
  생성하지 않는다.
- Post Notification Mute의 Root Post thread에 속한 Reply, Reaction, Repost Notification은 생성하지
  않는다.
- Domain Block Instance에서 온 원인 객체는 새 Notification을 만들지 않는다.
- Followee Post는 Follow Relationship의 새 Post 알림 Preference가 true일 때만 생성한다.
- Follow Request Notification은 Related Follow Request가 존재하는 동안만 유지한다.
- Follow Request가 승인, 거절 또는 취소되면 대응하는 Follow Request Notification을 제거한다.
- Follow Request 또는 Follow Relationship이 제거되면 이를 직접 원인으로 가진 Notification도 제거한다.
- Recipient Profile 자체를 조회할 수 없거나 필수 원인 관계가 없거나 그 관계의 Recipient가 Notification의
  Recipient와 일치하지 않거나 Recipient Profile 기준으로 Related Post 또는 Related Profile을 더 이상 조회할 수
  없는 Notification은 목록, Unread count, Node 조회와 읽음 처리에서 존재하지 않는 것으로 취급한다.
- Recipient Profile과 Related Profile 사이에 Profile Block이 있으면 양쪽 방향의 pair 정책으로 해당 Notification을
  목록, Unread count, Node 조회와 읽음 처리에서 숨긴다. 이 정책은 Recipient가 Related Post를 직접 조회할 수 있는
  방향의 Post·Media 정책과 독립적으로 적용한다.
- 필수 원인 관계가 없거나 Recipient와 일치하지 않거나 Related Post/Profile을 Recipient 기준으로 조회할 수 없게
  된 Notification은 비동기적으로 제거한다. 제거 전까지 저장 행과 Read State가 남을 수 있으며, 현재
  delivery는 모든 API 표면에서 숨기는 것으로 이 간격을 격리한다.
- Recipient Profile 자체가 일시적으로 조회 불가인 경우에도 item은 숨기되, 복구 가능한 Recipient Profile의
  일시 비활성화·정지만으로는 Notification을 비동기 제거하지 않는다.
- Mute가 나중에 생성되어도 기존 Notification의 존재와 Read State는 바꾸지 않는다. Profile Block은 제거된
  Follow 객체를 직접 원인으로 가진 Notification을 제거하고, 그 밖에 pair 정책 또는 Related Post/Profile 조회
  조건을 충족하지 않는 item은 위 숨김·비동기 제거 정책을 따른다.

### Quote Notification

- Local 작성과 Remote 수신에서 발생한 Quote 모두 별도 Quote Notification Type으로 제공한다.
- Quote Notification을 선택하면 Related Post인 Quote 자체의 canonical 상세로 이동한다. 인용된 Source의
  상세로 직접 이동하지 않는다.
- Quote Author와 Recipient가 같은 Profile이면 생성하지 않는다. 같은 Account에 속한 서로 다른 Profile의
  인용은 일반 인용으로 취급한다.
- Recipient가 Quote와 direct Repost Source를 각각 조회할 수 있어야 새 Quote Notification을 생성한다.
  둘 중 하나라도 더 이상 조회할 수 없으면 목록, Unread count, Node 조회와 읽음 처리에서 없는 것으로 취급한다.
  Source를 조회할 수 없어도 Quote 자체를 조회할 수 있다는 Post 정책은 바꾸지 않는다.
- 같은 Quote Post가 같은 Recipient Profile에게 Reply, Quote, Mention Notification을 동시에 발생시키면
  각 Type의 생성·Mute 조건을 먼저 적용한 뒤 남은 후보에서 Reply, Quote, Mention 순서로 한 건만 제공한다.
  Recipient가 서로 다르면 각각 판정한다.
- 같은 Quote·Recipient의 Quote와 Mention이 동시에 생성 후보이면 각 Type의 생성·Mute 조건을 먼저
  적용한다. 둘 다 남으면 Quote Notification 한 건만 제공한다. Reply도 후보이면 위 세 Type의 규칙을 적용한다.
  인용 관계가 승인 대기여서 Mention Notification이 먼저 생성됐다면 이후 승인돼도 별도 Quote Notification을
  추가하거나 기존 Mention의 Type을 교체하지 않는다. 이 승인 처리로 기존 Notification과 Read State·최초 읽음
  시각을 변경하지 않는다. 다른 사유에 따른 조회·정리는 해당 Type의 기존 정책을 따른다.
- 같은 Quote·Recipient의 Reply Notification이 먼저 생성된 경우에도 Mention과 동일하게 처리한다.
  이후 Quote 승인으로 알림을 추가하지 않고 기존 Reply Notification과 Read State·최초 읽음 시각을 보존한다.
- Followee Post Notification은 이 중복 제거 대상에 포함하지 않고 기존 독립 정책을 따른다.
- Profile Mute는 Quote Author를 대상으로 검사한다. Notification Scope의 Word Mute Rule과 Hashtag Mute Rule은
  Quote의 내용과 Hashtag를 검사하며, direct Source의 내용과 Hashtag를 다시 검사하지 않는다.
- Post Notification Mute는 direct Repost Source가 속한 원문 Root Post thread를 기준으로 검사한다.
  Quote 자체가 다른 thread에 속하더라도 이 기준은 바뀌지 않는다. Reply 후보는 자신의 Parent thread 기준을
  따르며, Quote의 thread Mute를 Mention 후보에 적용하지 않는다.
- Remote Quote Notification은 승인이 확인된 뒤 최초 한 번만 생성한다. 미승인·무효·철회 상태에서는
  생성하지 않는다. 같은 Quote의 재처리나 재승인으로 새 Notification을 만들지 않는다.
- Local 작성에서도 인용 관계가 승인되어 Source를 정상 표시할 수 있는 시점에 최초 생성 여부를 판단한다.
  Remote Source의 승인 대기 중이거나 거절된 상태에서는 Quote Notification을 생성하지 않는다.
- 최초 생성 판단에서 Mute·조회 권한 때문에 억제된 Quote는 나중에 조건이 풀려도 소급 생성하지 않는다.
  기능 도입 전의 Quote에도 소급 알림을 만들지 않는다. 이 정책이 적용되는 Remote Quote의 최초 승인 시점은
  생성 판단 시점으로 인정하며, 이미 저장된 알림의 일시적인 숨김 해제와 구분한다.
- Block·공개 범위 변경 등으로 Quote 또는 direct Source를 현재 조회할 수 없으면 목록, Unread count,
  Node 조회와 읽음 처리에서 즉시 숨긴다. 이후에는 기존 unavailable Notification 정책에 따라
  Best Effort로 비동기 정리할 수 있으며 삭제 시점과 성공은 보장하지 않는다.
- 비동기 삭제 전에 조회 제한이 풀리고 다른 조회 조건도 충족하면 남아 있는 Notification이 다시 보일 수 있다.
  이를 위한 Notification, Read State, 최초 읽음 시각의 보존이나 이후 복원은 보장하지 않는다.
- 승인 철회·Quote 삭제·direct Source 삭제 등 확정적인 무효 사유도 즉시 숨김과 기존 unavailable
  Notification의 Best Effort 비동기 정리 정책을 따른다. 물리 정리 뒤에도 같은 Quote의 재처리·재승인으로
  새 알림을 만들거나 삭제된 알림을 복원하지 않는다.
- Quote 전용 보존 예외는 두지 않는다. Recipient 자체의 일시 비활성화·정지만으로 제거하지 않는 공통
  정책은 그대로 적용하며, 이를 Quote나 direct Source 조회 불가 전반의 보존 보장으로 확대하지 않는다.

## 확정 용어

- 알림: Notification
- 읽음 상태: Read State
- 알림 유형: Notification Type
- 수신자: Recipient

## 제외/보류

- Remote Quote의 승인 판정 자체는 원격 인용 관계 계약을 따르며 이 문서에서 legacy 승인을 추정하지 않는다.
- 조회 불가 Notification의 비동기 제거를 event-driven 처리로 전환하거나 현재 범위를 넘어 대량 처리하는 방식은
  후속 capability에서 결정한다.
- Recipient Profile의 일시 비활성화·정지는 비동기 물리 제거 원인에서 제외한다.
