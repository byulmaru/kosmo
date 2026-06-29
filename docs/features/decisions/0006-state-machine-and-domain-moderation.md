# ADR 0006: State Machine and Domain Moderation

## 상태

Accepted

## 날짜

2026-06-29

## 결정

Profile 상태 전이는 Identity 컨텍스트의 `Profile State Machine`으로 명시한다.

- Profile State는 활성, 비활성화, 정지, 삭제됨 네 상태를 가진다.
- 삭제됨은 terminal 상태이며 되돌릴 수 없다.
- `Owner` Account는 활성 Profile을 비활성화하고, 비활성화 Profile을 재활성화할 수 있다.
- Profile 삭제는 비활성화 상태에서만 수행한다.
- 정지는 Trust & Safety moderation action의 결과이며, 정지 해제도 Trust & Safety가 수행한다.
- 정지 해제 시 Profile은 정지 전 상태로 복구된다.
- active Profile은 활성 상태여야 한다.

Domain moderation action taxonomy는 Trust & Safety 도메인 명세에 둔다.

- Domain moderation action은 운영자 Account가 원격 Domain 전체에 적용하는 moderation action이다.
- Domain moderation action은 Profile 제어의 mute/block과 구분한다.
- Domain Limit은 원격 Domain의 도달 범위를 제한한다.
- Domain Block은 원격 Domain을 없는 것처럼 취급한다.
- Trust & Safety가 Domain moderation action 원본 정책을 소유하고, Publishing, Media, Social Graph,
  Engagement, Post List, Discovery, Notification은 그 결과를 소비한다.
- Domain moderation action은 기존 Notification을 삭제하거나 읽음 상태를 바꾸지 않는다.
- 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로 분리한다.

## 문서 반영

- [Identity 컨텍스트](../contexts/identity.md)는 Profile State Machine과 전이 규칙을 명시한다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md)는 Domain Limit과 Domain Block을 명시한다.
- [2026-06-29 도메인 경계 후속 결정 기록](../records/2026-06-29-domain-boundary-followup.md)의 열린
  질문은 후속 기록으로 닫는다.
