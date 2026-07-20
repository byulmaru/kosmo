# ADR 0012: Post Interaction Follow-up Clarifications

## 상태

Accepted

## 날짜

2026-07-20

## 결정

- Reply Notification의 Related Post는 원인 행동으로 생성된 Reply Post이고 Related Profile은 Reply Author
  Profile이다.
- Reaction Type별 개수는 대상 Post에 현재 존재하는 모든 Reaction을 포함하고 Post를 조회할 수 있는 viewer
  사이에서 달라지지 않는다. Reaction을 남긴 Profile 목록만 viewer가 조회할 수 있는 Profile로 제한한다.
- 같은 Profile/Post/Reaction Type 조합의 Reaction 추가를 반복하면 기존 Reaction을 유지한 채 멱등
  성공한다.
- 행동 주체가 이미 제거한 동일 Reaction의 삭제를 재시도하면 상태를 바꾸지 않은 채 멱등 성공한다. 이
  멱등성은 다른 Profile이 소유한 기존 Reaction을 삭제할 권한을 부여하지 않는다.

## 이유

- Reply Notification의 Related Post를 명시해 알림 이동과 조회가 Reply Parent와 결과 Reply 중 서로 다른
  대상을 선택하지 않게 한다.
- Reaction 개수를 viewer와 무관하게 유지해 Post 단위로 캐시할 수 있게 하고, Profile 목록에서만 viewer의
  Profile 조회 경계를 적용한다.
- 네트워크 재시도와 동시 요청이 중복 Reaction이나 불필요한 실패를 만들지 않도록 추가와 삭제의 반복 결과를
  고정한다.

## 문서 반영

- [Post](../objects/post.md)는 Content Warning과 Reply 용어를 명확히 한다.
- [Reaction](../objects/reaction.md)은 추가·삭제 멱등성, viewer와 무관한 개수와 viewer별 Profile 목록을
  정의한다.
- [Notification](../objects/notification.md)은 Reply Notification의 Related Post와 Related Profile을
  정의한다.

이 ADR은 [ADR 0010](./0010-post-interaction-contracts.md)을 보완하며 Media, Profile Block과 Notification
억제 정책의 구현 순서를 변경하지 않는다.
