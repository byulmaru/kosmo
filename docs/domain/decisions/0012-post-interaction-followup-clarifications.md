# ADR 0012: Post Interaction Follow-up Clarifications

## 상태

Accepted

## 날짜

2026-07-20

## 결정

- Reply Notification의 Related Post는 원인 행동으로 생성된 Reply Post이고 Related Profile은 Reply Author
  Profile이다.
- Reaction Type별 개수와 Reaction을 남긴 Profile 목록은 모두 viewer가 조회할 수 있는 Profile이 남긴
  Reaction만 포함한다.
- 같은 Profile/Post/Reaction Type 조합의 Reaction 추가를 반복하면 기존 Reaction을 유지한 채 멱등
  성공한다.
- 행동 주체가 이미 제거한 동일 Reaction의 삭제를 재시도하면 상태를 바꾸지 않은 채 멱등 성공한다. 이
  멱등성은 다른 Profile이 소유한 기존 Reaction을 삭제할 권한을 부여하지 않는다.

## 이유

- Reply Notification의 Related Post를 명시해 알림 이동과 조회가 Reply Parent와 결과 Reply 중 서로 다른
  대상을 선택하지 않게 한다.
- Reaction 개수와 Profile 목록이 같은 viewer 경계를 사용하게 해 개수만으로 조회할 수 없는 Profile의
  Reaction을 추론하지 못하게 한다.
- 네트워크 재시도와 동시 요청이 중복 Reaction이나 불필요한 실패를 만들지 않도록 추가와 삭제의 반복 결과를
  고정한다.

## 문서 반영

- [Post](../objects/post.md)는 Content Warning과 Reply 용어를 명확히 한다.
- [Reaction](../objects/reaction.md)은 추가·삭제 멱등성과 viewer별 조회 결과를 정의한다.
- [Notification](../objects/notification.md)은 Reply Notification의 Related Post와 Related Profile을
  정의한다.

이 ADR은 [ADR 0010](./0010-post-interaction-contracts.md)을 보완하며 Media, Profile Block과 Notification
억제 정책의 구현 순서를 변경하지 않는다.
