# 2026-06-29 상태 기계와 Domain moderation 결정 기록

## 배경

[2026-06-29 도메인 경계 후속 결정 기록](./2026-06-29-domain-boundary-followup.md)에 남긴 Profile 상태
전이와 Domain moderation action taxonomy 질문이 닫혔다. 확정 결정은
[ADR 0006](../decisions/0006-state-machine-and-domain-moderation.md)에 남겼다.

## 확정된 결정

1. Profile 상태 전이는 Identity 컨텍스트의 상태 기계로 명시한다.
2. Profile State는 활성, 비활성화, 정지, 삭제됨 네 상태를 가진다.
3. 삭제됨은 terminal 상태이며 되돌릴 수 없다.
4. `Owner` Account는 활성 Profile을 비활성화하고, 비활성화 Profile을 재활성화할 수 있다.
5. Profile 삭제는 비활성화 상태에서만 수행한다.
6. 정지와 정지 해제는 Trust & Safety moderation action으로 수행한다.
7. 정지 해제 시 Profile은 정지 전 상태로 복구된다.
8. Domain moderation action taxonomy는 Trust & Safety 도메인 명세에 둔다.
9. Domain moderation action은 Domain Limit과 Domain Block을 가진다.
10. Domain Limit은 원격 Domain의 도달 범위를 제한한다.
11. Domain Block은 원격 Domain을 없는 것처럼 취급한다.
12. Domain moderation action은 기존 Notification을 삭제하거나 읽음 상태를 바꾸지 않는다.
13. 물리 색인 삭제, 원격 delivery 실패 처리, 재시도 방식은 구현/연합 스펙으로 분리한다.

## 후속 확인

- Profile 삭제는 비활성화 상태에서만 가능하다는 제약을 유지한다.
- 정지 상태는 Trust & Safety만 해제할 수 있으며, `Owner` Account가 직접 해제할 수 없다.

## 문서 반영

- [Identity 컨텍스트](../objects/profile.md)에 Profile State Machine을 추가했다.
- [Trust & Safety 컨텍스트](../objects/instance.md)에 Domain Moderation Action을 추가했다.
- [ADR 0006](../decisions/0006-state-machine-and-domain-moderation.md)을 추가했다.
