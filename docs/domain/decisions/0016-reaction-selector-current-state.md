# ADR 0016: Reaction Selector Current State

## 상태

Accepted

## 날짜

2026-07-26

## 결정

- Reaction selector는 Post를 조회하는 현재 selected Profile이 남긴 Reaction 관계를 복원한다. guest 또는
  selected Profile이 없는 경우 현재 관계는 비어 있다.
- Reaction 삭제는 행동 주체 Profile, Post와 Reaction Type으로 현재 관계를 식별한다. 같은 조합의 Reaction이
  존재하면 제거하고, 존재하지 않으면 상태를 바꾸지 않은 채 멱등 성공한다.
- 다른 Profile이나 다른 Reaction Type의 관계는 삭제하지 않는다.
- 오래 지연된 Post/Type 삭제가 그 사이 같은 조합으로 재생성된 현재 Reaction을 제거할 수 있는 가능성을
  수용한다. 이를 막기 위한 관계 history, soft delete 또는 idempotency ledger는 현재 범위에 추가하지 않는다.

## 이유

- selector는 화면 재진입이나 selected Profile 전환 뒤에도 현재 선택을 복원하고 해제할 수 있어야 하며, 과거
  Reaction ID 보존을 모든 consumer의 전제로 만들지 않는다.
- Reaction은 selected Profile이 즉시 같은 Reaction을 다시 생성할 수 있는 낮은 위험의 소셜 상호작용이므로
  ABA를 막기 위한 별도 상태와 저장 범위를 추가하지 않는다.
- Profile/Post/Type 조건으로 현재 관계만 삭제하면 관계가 없는 반복·동시 요청을 성공 no-op으로 정규화하면서
  다른 Profile과 Type을 보존할 수 있다.

## 대체 관계

이 ADR은 [ADR 0012](./0012-post-interaction-followup-clarifications.md)의 “이미 제거한 동일 Reaction 삭제
재시도는 상태를 바꾸지 않는다”는 결정을 대체한다. ADR 0012의 Reaction 추가 멱등성, count와 Profile 목록
visibility 및 Reply Notification 결정은 유지한다.

## 문서 반영

- [Reaction](../objects/reaction.md)은 selected Profile의 현재 관계 조회와 Post/Type 기준 삭제를 정의한다.
- Reaction OpenSpec은 구체 GraphQL 조회·mutation·payload와 Notification cleanup 경계를 선택한다.
