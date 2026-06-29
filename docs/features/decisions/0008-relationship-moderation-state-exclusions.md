# ADR 0008: Relationship and Moderation Case State Exclusions

## 상태

Accepted

## 날짜

2026-06-29

## 결정

도메인 명세에 남은 상태 기계 후보 중 다음 두 가지는 현재 도메인 상태 기계로 두지 않는다.

- Account-Profile 관계는 별도 Account-Profile Relationship State Machine을 갖지 않는다.
- Account-Profile 관계의 현재 권한은 `Owner`/`Member` role과 마지막 `Owner` 불변 조건으로 판단한다.
- 초대, 수락, 연결 해제 흐름은 Account-Profile 관계 상태로 확장하지 않는다.
- Moderation Case는 신고 묶음과 운영자 action 판단 단위로 둔다.
- Moderation Case State Machine은 두지 않는다.
- 신고 처리 기록과 운영자 action은 감사 로그로 남기지만, 처리 단계 전이는 현재 도메인 명세의 상태
  기계로 정의하지 않는다.

## 문서 반영

- [Identity 컨텍스트](../contexts/identity.md)는 Account-Profile 관계를 role 기반 관계로 유지하고 별도
  상태 기계를 두지 않는다.
- [Trust & Safety 컨텍스트](../contexts/trust-safety.md)는 Moderation Case를 상태 기계가 아닌 운영자
  action 판단 단위로 제한한다.
