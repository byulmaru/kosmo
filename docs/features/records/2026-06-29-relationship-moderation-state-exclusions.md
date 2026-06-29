# 2026-06-29 관계와 신고 상태 제외 결정 기록

## 배경

직전 검수에서 남은 질문 후보로 Account-Profile 관계 상태 기계와 Moderation Case 상태 기계를 제시했다.
제품 방향 답변으로 두 상태 기계를 현재 도메인 명세에 두지 않기로 했다.

## 질문별 결정

1. Account-Profile 관계에는 별도 Account-Profile Relationship State Machine을 두지 않는다. 현재 권한은
   `Owner`/`Member` role과 마지막 `Owner` 불변 조건으로 판단한다.
2. Moderation Case State Machine은 두지 않는다. Moderation Case는 신고 묶음과 운영자 action 판단
   단위이며, 신고 처리 기록과 운영자 action은 감사 로그로 남긴다.

## 문서 반영 원칙

- `contexts/identity.md`에는 Account-Profile 관계 상태를 추가하지 않는다.
- `contexts/trust-safety.md`에는 Moderation Case 처리 단계 전이를 상태 기계로 추가하지 않는다.
- 이후 실제 운영 대기열이나 처리 단계가 필요하면 도메인 상태 기계가 아니라 별도 운영/구현 스펙에서
  다룬다.
