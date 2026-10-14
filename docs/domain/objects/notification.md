# Notification 객체

## 정의

Notification은 도메인 활동의 결과 또는 운영 안내를 Recipient Profile 또는 Recipient Account에게 직접
전달하는 개별 알림이다.

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

| 속성      | 타입/nullability | 검증 정책                                                 | 존재 조건          | 조회 조건        | 조회 권한                |
| --------- | ---------------- | --------------------------------------------------------- | ------------------ | ---------------- | ------------------------ |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가                            | 항상               | Recipient만 조회 | `Notification.Recipient` |
| 읽음 시각 | 시각, nullable   | Read 전이 결과로 기록하며 변경 불가                       | Read State가 Read  | Recipient만 조회 | `Notification.Recipient` |
| 운영 제목 | 문자열, 필수     | Operational 알림 제목                                     | Type이 Operational | Recipient만 조회 | `Notification.Recipient` |
| 운영 본문 | 문자열, 선택     | 본문이 제공되면 해당 본문                                 | Type이 Operational | Recipient만 조회 | `Notification.Recipient` |
| 운영 링크 | 문자열, 필수     | 내부 경로 또는 HTTP(S) 외부 링크; 실행 가능한 scheme 거부 | Type이 Operational | Recipient만 조회 | `Notification.Recipient` |

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
Operational Notification은 Related Post·Related Profile이나 별도의 원인 객체 관계를 갖지 않으며,
운영 링크가 활성화할 목적지다.
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

| 행동                                       | 행동 주체 | 대상 객체                     | 입력값                                            | 권한                                       | 조건                                                                                                                                                        | 결과                                                                                                          |
| ------------------------------------------ | --------- | ----------------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Notification 생성                          | 시스템    | Notification                  | Type, Recipient, Type별 데이터와 필요한 원인 객체 | `System.NotificationSource`                | Type별 필수 데이터·관계가 유효하고 Recipient 조회 정책을 통과하며 아래 억제 정책에 걸리지 않는다                                                            | 입력 Notification Type과 Read State=Unread인 Notification이 생성된다                                          |
| 상호작용 Notification 정리                 | 시스템    | Notification                  | 정리 대상 Notification                            | `System.NotificationSource`                | 원인 객체가 있는 Type의 필수 관계 결손·원인 Recipient 불일치·Recipient 기준 Related Post/Profile 비가용 (Recipient 자체의 복구 가능한 비활성화·정지는 제외) | 시점과 성공을 보장하지 않고 Notification 제거를 Best Effort로 시도한다                                        |
| Profile Notification 지정 읽음 처리        | Account   | Notification 목록             | Notification ID 목록                              | `Account.Active`, `Notification.Recipient` | Type이 Operational이 아닌 입력 항목 중 요청 Account가 현재 조회할 수 있는 Notification이다                                                                  | 처리 가능한 입력 항목은 Read가 되고 읽음 시각이 최초 기록된다. 이미 Read이면 상태와 읽음 시각을 바꾸지 않는다 |
| Account Operational Notification 읽음 처리 | Account   | Operational Notification 목록 | Notification ID 목록                              | `Account.Active`, `Notification.Recipient` | 요청 Account의 Operational Notification이다                                                                                                                 | 처리 가능한 입력 항목은 Read가 되고 최초 읽음 시각을 보존한다                                                 |

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

### Operational Notification 조회와 읽음 처리

- Recipient Account가 ACTIVE이고 해당 Profile의 membership을 가지면 `Profile.notifications`와
  `Profile.unreadNotificationCount`는 그 Profile의 조회 가능한 Profile Notification과 해당 Account의
  Operational Notification을 함께 포함한다. Account Operational Notification은 Account가 membership을 가진
  각 Profile에서 조회되며, Profile에 속한 social Notification은 해당 Profile에 한정된다.
- `markNotificationRead`는 요청에 지정된 ID 중 각 권한 범위에서 현재 조회 가능한 항목만 읽음 처리한다.
  ACTIVE Account는 기존 Profile Notification과 자신의 Operational Notification을 지정할 수 있다. 존재하지 않거나
  다른 Recipient에게 속하거나 현재 조회할 수 없는 ID는 조용히 제외한다.
- 빈 ID 목록, 중복 ID와 이미 Read인 항목은 성공한 멱등 처리다. 최초 읽음 시각을 보존하며, 입력에 없는 항목을
  요청 중 새로 생성된 알림까지 확장해 읽음 처리하지 않는다.
- Operational Notification 목록에서 항목을 활성화하면 이동을 기다리게 하지 않고 Best Effort Read를 시작한다.
  Push를 탭해 목적지로 이동하는 동작은 Read State를 바꾸지 않는다.

### Operational Notification 수동 발송과 재시도

- 각 수동 발송은 고유 UUID `sendId`로 식별한다. 최초 수신자 집합 capture가 성공한 시점에 ACTIVE인 Account를
  대상으로 고정하며, 그 뒤 가입하거나 ACTIVE가 된 Account를 같은 발송의 재시도에 추가하지 않는다.
- Operational Notification Push는 최초 capture 뒤에도 전달 시점에 Account State가 ACTIVE인 설치만 대상으로 한다.
- 같은 `sendId`와 제목·본문·링크 데이터로 재시도해도 기존 Notification 행, 데이터와 `readAt`을 바꾸지 않는다.
  같은 `sendId`를 다른 제목·본문·링크 데이터와 함께 재사용하면 발송을 실패 처리한다.

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
| Operational       | Account                             | 제목, 선택적 본문, 내부·외부 링크                                                  |

### Reply/Mention 수신자별 분류와 중복 처리

2026-09-08 사용자 승인으로 확정한 정책이다. 알림 생성은 저장된 유효 Mention 관계에 대해 출처
종류를 제한하지 않는다.

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
- Profile Mute는 Recipient가 Owner이고 Related Profile이 Target인 관계 중 만료 시각이 없거나
  DB 현재 시각보다 미래인 관계를 적용한다. 만료 시각이 DB 현재 시각과 같거나 과거이면 그 Mute로
  새 Notification을 억제하지 않는다. 만료만으로 과거에 억제한 Notification을 소급 생성하지 않는다.
- Notification Scope를 포함한 Word Mute Rule과 Hashtag Mute Rule이 일치하면 새 Notification을
  생성하지 않는다.
- Post Notification Mute의 Root Post thread에 속한 Reply, Reaction, Repost Notification은 생성하지
  않는다.
- Domain Block Instance에서 온 원인 객체는 새 Notification을 만들지 않는다.
- Followee Post는 Follow Relationship의 새 Post 알림 Preference가 true일 때만 생성한다.
- Follow Request Notification은 Related Follow Request가 존재하는 동안만 유지한다.
- Follow Request가 승인, 거절 또는 취소되면 대응하는 Follow Request Notification을 제거한다.
- Follow Request 또는 Follow Relationship이 제거되면 이를 직접 원인으로 가진 Notification도 제거한다.
- Notification Node, 목록, Unread count와 읽음 처리는 저장 행의 Recipient 권한을 기준으로 한다. Related Post/Profile의 현재 조회 가능성은 저장 행을 숨기지 않는다. Related Post/Profile이나 source 필드는 현재 요청의 일반 객체 조회 권한을 적용하며, 조회할 수 없으면 null 또는 unavailable로 반환한다. Recipient 권한으로 원본 객체 접근을 우회하지 않는다.
- 필수 원인 관계 결손·Recipient 불일치·Related Post/Profile 비가용에 따른 기존 비동기 정리 정책은 유지한다. 정리 전까지 행이 존재하면 Recipient는 해당 Notification 행을 조회할 수 있으며, 정리 뒤까지 보존하는 계약은 아니다.
- Profile Block pair 정책은 Related Post/Profile과 그 필드의 기존 접근 조건에 적용한다. Profile Block transaction은 새 Profile Block 관계를 만들면서 함께 제거한 Follow 객체를 직접 원인으로 가진 Notification을 같은 transaction에서 제거한다. 다른 Notification 행은 source 조회 불가만으로 API에서 숨기지 않으며 기존 비동기 정리 정책은 유지한다. duplicate Block 관찰이나 Unblock의 보상 cleanup으로 확장하지 않는다. commit 뒤 별도 effect의 성공·실패는 이미 성공한 Profile Block 관계와 그 transaction 결과를 바꾸지 않는다.
- Mute가 나중에 생성되어도 기존 Notification의 존재와 Read State는 바꾸지 않는다.

### Quote Notification

- Local 작성과 Remote 수신에서 발생한 Quote 모두 별도 Quote Notification Type으로 제공한다.
- Quote Notification을 선택하면 Related Post인 Quote 자체의 canonical 상세로 이동한다. 인용된 Source의
  상세로 직접 이동하지 않는다.
- Quote Author와 Recipient가 같은 Profile이면 생성하지 않는다. 같은 Account에 속한 서로 다른 Profile의
  인용은 일반 인용으로 취급한다.
- Recipient가 Quote와 direct Repost Source를 각각 조회할 수 있어야 새 Quote Notification을 생성한다.
  저장된 Notification 행의 조회는 Recipient 권한을 따른다. Related Post와 direct Source 필드는 현재 요청의 일반 Post 조회
  권한을 적용하며, 조회할 수 없어도 행이나 다른 접근 가능한 Post의 정책을 바꾸지 않는다.
- 같은 Quote Post가 같은 Recipient Profile에게 Reply, Mention, Quote Notification을 발생시키면 각 Type의
  생성·Mute 조건을 먼저 적용하고, 최초 선택에서 남은 후보 중 Reply, Mention, Quote 순서로 한 건만 제공한다.
  이 우선순위는 독립적인 비동기 처리의 도착 순서와 무관하게 적용하며 Recipient가 서로 다르면 각각 판정한다.
- 우선순위는 최초 대표 Notification 선택에만 적용한다. 이미 저장된 대표 Notification은 ID, Type, Read State와
  최초 읽음 시각을 유지하며, 이후 더 높은 우선순위 Type이 생성 가능해져도 추가·교체하거나 소급 생성하지 않는다.
  따라서 Quote 승인 전에 Mention 또는 Reply가 먼저 생성된 경우 승인으로 Quote Notification을 추가하거나 기존
  Notification의 Type을 바꾸지 않는다. 이 승인 처리로 기존 Notification과 Read State·최초 읽음 시각을 변경하지
  않으며, 다른 사유에 따른 조회·정리는 해당 Type의 기존 정책을 따른다. 이 선택의 근거는
  [ADR 0028](../decisions/0028-quote-notification-policy.md#2026-10-12-사용자-지정-우선순위)에 기록한다.
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
  생성 판단 시점으로 인정한다. 저장된 Notification의 Quote/source 필드가 다시 조회 가능해지는 것은 새 알림 생성과 구분한다.
- Block·공개 범위 변경 등으로 Quote 또는 direct Source를 현재 조회할 수 없어도 저장된 Notification 행은 Recipient
  권한으로 조회한다. Related Post와 source 필드는 현재 요청의 일반 Post 조회 권한을 적용해 null/unavailable이 될 수 있다.
  기존 unavailable Notification 정책에 따른 Best Effort 비동기 정리와 삭제 시점·성공의 비보장은 유지한다.
- 비동기 정리 전에 조회 제한이 풀리면 저장된 행의 Quote/source 필드가 다시 조회 가능해질 수 있다. 이때 Notification ID,
  Read State와 최초 읽음 시각은 유지된다. 물리 정리 뒤 보존이나 복원을 보장하는 계약은 아니다.
- 승인 철회·Quote 삭제·direct Source 삭제 등 기존 정리 조건은 유지한다. 정리 전에는 Recipient가 저장 행을 조회할 수 있으며,
  물리 정리 뒤에는 같은 Quote의 재처리·재승인으로 새 알림을 만들거나 삭제된 알림을 복원하지 않는다.
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
