# ADR 0028: Quote Notification Policy

## 상태

Accepted — 사용자의 “Spec Gate 승인” 응답으로 PROD-903 정책 결과와 후속 책임안을 승인했다. 제품 정책의 미결정 사항은 없다. 이 이슈는 Domain 전용이며 후속 구현 OpenSpec의 승인은 포함하지 않는다.

## 날짜

2026-09-08

## 근거

- [PROD-903](https://linear.app/byulmaru/issue/PROD-903)의 정책 결정 범위.
- PROD-903 Spec 대화에서 제공 범위, 유형·수신자·이동 대상, 동시 중복 처리의 권장안에 대한 사람의
  “권장안대로” 응답.
- 같은 대화의 후속 질문에서 “Profile 단위 자기 인용 억제 + 두 글의 조회 권한 확인 (권장)” 선택.
- 같은 대화에서 Mute 적용 대상, Remote Quote 최초 1회 생성, 철회·삭제 시 숨김·정리와
  일시적인 조회 불가·Recipient 비활성화 시 물리 보존을 명시적으로 확정한 응답.
- 후속 질문에서 “억제 후·기능 도입 전 Quote는 소급 생성하지 않음 (권장)” 선택.
- 후속 질문에서 “로컬 작성도 인용 관계 승인 후 최초 판단 (권장)” 선택.
- 최신 응답에서 Mention 선생성·Read State 보존, 동시 후보 Quote 우선, Followee Post 독립과
  Block·공개 범위 변경의 복구 가능한 제한 보존을 명시적으로 확정했다.
- [ADR 0014](./0014-post-structure-relations.md)의 Quote 관계 조합과
  [ADR 0015](./0015-post-share-reference.md)의 Quote 자체 상세 경로.

## 결정

- 마지막 후속 응답 “Mention과 동일한 원칙”에 따라 먼저 생성된 Reply도 보존한다. 이후 Quote 승인으로
  별도 알림을 추가하지 않고 기존 Reply Notification과 Read State·최초 읽음 시각을 유지한다.

- Local 작성과 Remote 수신 모두 Quote 알림을 제공한다.
- 별도 Quote Notification Type을 사용하고 direct Repost Source의 Author Profile에게 알린다.
- Related Post는 원인 Quote Post, Related Profile은 Quote Author Profile이다. 알림을 선택하면 Quote 자체
  상세로 이동한다. Notification 원문은 Quote의 direct Repost Source로 식별한다.
- 같은 Quote와 같은 Recipient에게 Reply·Quote·Mention이 동시에 발생하면 Reply, Quote, Mention 순서로
  한 건만 제공한다. 다른 Recipient에게 가는 알림은 각각 판정한다.
- Quote·Mention이 처음부터 동시에 후보이면 Type별 생성·Mute 조건 적용 후 Quote를 우선한다.
  같은 Quote·Recipient의 Mention이 먼저 생성됐다면 이후 승인돼도 Quote 알림을 추가하지 않는다.
  기존 Mention Notification과 Read State·최초 읽음 시각을 보존한다. Followee Post는 독립 정책을 유지한다.
- 자기 인용 억제는 Profile 단위다. 같은 Account의 서로 다른 Profile까지 억제하지 않는다.
- Recipient가 Quote와 direct Source를 모두 조회할 수 있어야 알림을 생성·조회할 수 있다.
  Source가 조회 불가여도 Quote 자체 Content를 유지하는 Post 정책은 바꾸지 않는다.
- Profile Mute는 Quote Author, Word·Hashtag Mute는 Quote 내용·Hashtag, Post Notification Mute는
  direct Source가 속한 원문 thread를 검사한다. Word·Hashtag Mute에서 Source 내용을 다시 검사하지 않는다.
- 각 Type의 생성·Mute 조건을 먼저 적용하고 남은 Reply·Quote·Mention 후보에 우선순위를 적용한다.
- Remote Quote는 승인이 확인된 최초 한 번만 알림을 생성하며 같은 Quote의 재처리·재승인은 새 알림을 만들지 않는다.
- Local 작성도 인용 관계 승인 후 Source를 정상 표시할 수 있을 때 최초 알림을 판단한다.
  승인 대기·거절 중에는 Quote 알림을 생성하지 않는다.
- 첫 생성 판단에서 Mute·조회 권한으로 억제됐거나 기능 도입 전에 존재한 Quote에는 소급 알림을 만들지 않는다.
  정책이 적용되는 Remote Quote의 최초 승인은 생성 판단 시점으로 인정한다. 보존된 알림의 숨김 해제는 새 생성이 아니다.
- 승인 철회·Quote 또는 Source 삭제로 무효가 되면 모든 알림 조회 표면에서 즉시 숨기고 기존 unavailable
  Notification 정책에 따라 비동기로 정리한다. 물리 정리 뒤에도 같은 Quote에 다시 알리지 않는다.
- Block·공개 범위 변경 등 복구 가능한 조회 제한, 일시적인 조회 실패나 Recipient 측 비활성화·정지에서는
  조회 표면에서만 숨기고 Notification과 Read State·최초 읽음 시각을 보존한다. 다시 조회 가능해지면
  기존 상태를 사용한다. 물리 정리는 승인 철회·Quote 삭제·Source 삭제 등 확정적 관계 무효화에만 적용한다.

## 이유와 결과

Quote는 자체 Content와 상세 경로를 가진다. 별도 알림에서 Quote로 이동하면 수신자가 인용글을 바로
확인할 수 있다. 원인은 같은 Quote이고 수신자도 같을 때 알림을 한 건으로 제한하며, 우선순위는 사람의
선택에 따라 Reply, Quote, Mention 순서로 고정한다. 이 규칙을 전체 Notification grouping 변경으로 넓히지 않는다.

알림 제공 여부는 원문과 인용글의 조회 권한을 넓히지 않는다. 기본 행동 주체인 Profile로 자기 인용을 판단하며,
Account를 공유한다는 이유로 다른 Profile의 알림까지 억제하지 않는다.

## 검토한 대안

- Local 작성만 먼저 제공하거나 Quote 알림을 제공하지 않는 안 대신 Local·Remote 모두 제공하는 안을 선택했다.
- 원문 상세로 이동하는 안 대신 Quote 자체 상세로 이동하는 안을 선택했다.
- Quote 우선 또는 유형별 개별 알림 대신 Reply 우선의 한 건을 선택했다.
- Account 단위 자기 인용 억제와 Source 조회 불가 시 알림 유지 대신 Profile 단위 억제와 두 Post의 조회 확인을 선택했다.

## 남은 결정

현재 Post 구조는 Reply와 Quote의 동시 성립을 허용하므로 해당 구조 전제는 제거하지 않는다.
동시 후보는 기존 Reply 우선을 유지하고, 먼저 생성된 Reply는 Mention과 같은 원칙으로 보존하기로 확정했다.
PROD-903 자체의 제품 정책상 미결정 사항은 없다.
Quote·Mention 중복, Followee Post 독립, 복구 가능한 조회 제한의 보존은 확정했다.
원격 관계의 legacy 승인·재승인 허용 조건은 해당 관계 owner가 확정해야 하며, 알림의 재승인 시 재생성 금지와
구분한다. 후속 구현·OpenSpec·통합 검증·archive owner는 정혜주로 승인됐고,
[PROD-926](https://linear.app/byulmaru/issue/PROD-926)으로 생성·배정했다. 해당 이슈의 Issue Gate와
OpenSpec 검토는 다음 단계다.

## 문서 반영

- [Notification](../objects/notification.md): 유형·원인·수신자·이동·자기 인용·조회·동시 중복 정책.
- [Post](../objects/post.md): Quote 알림 정책의 소유 문서 연결.
- [Post Notification Mute](../objects/post-notification-mute.md): direct Source의 원문 thread 기준.
- [Word Mute Rule](../objects/word-mute-rule.md), [Hashtag Mute Rule](../objects/hashtag-mute-rule.md): Quote 내용·태그만 검사.
